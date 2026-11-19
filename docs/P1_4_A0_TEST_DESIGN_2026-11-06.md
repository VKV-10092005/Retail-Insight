# P1.4 A0 — MySQL disposable, concurrency và kế hoạch tải

06/11/2026 — **chưa tạo database/container/test code, chưa chạy kiểm thử**. [Báo cáo A0](P1_4_A0_DESIGN_REVIEW_2026-11-06.md).

## 1. Môi trường và cổng kiểm soát trước ghi

Thiết kế một MySQL instance/container tách hẳn server đang phục vụ retail_app/research, private network và port test riêng được duyệt; ví dụ đề nghị localhost:13316 nhưng chưa cấp phát. Schema duy nhất retail_p14_test_<runid> nằm allowlist literal của manifest; không chỉ kiểm prefix. Không dùng instance thật tạo thêm schema như cách ly tương đương.

Gate trước mọi DDL/seed/cleanup, kể cả bootstrap ledger:

1. Dedicated config không import .env runtime, src/db/pool.js hoặc verifyDatabase hiện tại (chỉ cho retail_app). Không kế thừa credential production, không root.
2. Host/IP resolved, port, TLS identity, server_uuid và endpoint thuộc allowlist run manifest; DNS aliases/IP trỏ vào production hoặc không xác minh được phải từ chối.
3. SELECT DATABASE(), @@server_uuid, @@port, VERSION(), current_user/user; đúng expected schema/server. DATABASE NULL hoặc schema trong denylist retail_app/retail_management/retail_datawarehouse → fail.
4. SHOW GRANTS/role membership trong bộ nhớ: chỉ quyền đủ cho schema test; không global DML/DDL, không quyền research/production, không grant option/role rộng. Không log credential/grant thô. Quyền provision schema/container chỉ bởi operator được duyệt riêng.
5. Pin MySQL version/engine/collation/sql_mode/timezone theo baseline thực tế; không suy ra server từ package mysql2. Verify InnoDB và enforced CHECK. UTC mỗi connection.
6. Opt-in token test-write riêng + run manifest + explicit future approval; NODE_ENV=test hoặc RUN_DB_TESTS=1 không đủ.
7. Renderer từ chối sentinel/token REVIEW_ONLY; chỉ release digest đã duyệt sau rehearsal mới executable. Không chạy draft file docs bằng runner cũ.
8. Chặn route mạng tới DB thật và AI thật; AI HTTP stub mặc định, research config bỏ trống. Test account runtime không tạo DB hay dùng admin account.

Cleanup dùng manifest exact server/schema/run marker và absolute paths đã resolve, không wildcard hoặc DROP sai server. Chưa thực hiện provisioning/cleanup trong A0.

## 2. Harness tương lai

Ba tầng evidence riêng:
- Pure/static: canonicalization/DATE/decimal, parser/manifest/checksum, compatibility routing; không chứng minh locks.
- Native MySQL: ít nhất hai independent pools/connections, real schema/grants/trigger và barrier; schema snapshot/digest assertions.
- HTTP đa Backend: hai Express process riêng port, cùng DB/session/config epoch; test proxy định tuyến chủ động request A/B, không gọi chung một app process rồi coi là N Backend.

A1 cần dependency injection/factory cho pool/config/clock/fault hooks; hiện app/pool import singleton và verifyDatabase khóa retail_app nên **chưa chạy được write harness an toàn**. Không sửa source trong A0. SQLite/RAM hiện có chỉ là baseline logic; test SELECT constants không chứng minh DDL/row lock/collation/replication.

Synthetic fixtures đề xuất: 2 org, mỗi org 2–4 branch, OWNER/MANAGER/CASHIER/INVENTORY có branch scope, 100/10.000 SKU theo suite; tồn0/1/10/maxINT, giá0/giá giới hạn, documents nhiều item, dated boundary 1970/1975 và current month. Không copy/dump user/research. Load data volumes theo 10k/100k/1m docs là mục tiêu generator tương lai cần ngân sách; chưa tạo.

Barrier/latch tại after-auth-lock, after-guard, after-product/balance-lock, after-header, before-commit, after-commit-before-response; coordinator có deadline và release log. Driver dùng dedicated observer connection kiểm performance_schema lock waits nếu được cấp quyền read test-only; không bật global instrumentation trên DB thật. Không dùng sleep ngẫu nhiên làm bằng chứng concurrency.

Oracle sau mỗi case: header total bằng item sums; movement sign/quantity đúng type/item; balance cuối = đầu + tổng committed delta; một receipt/marker cho native doc; no orphan header/item/movement/receipt; audit success một lần; revision tăng đúng số accepted writes; immutable originals checksum không đổi; tenant scope không leak. Số hàng ảnh hưởng và kinh tế dùng DECIMAL/string chính xác.

## 3. Migration/schema/failure matrix

| ID | Case | Kỳ vọng / evidence |
|---|---|---|
| M01 | Expand baseline 001/002, cả rỗng và fixture có dữ liệu | Schema metadata đúng type/charset/FK, originals digest không đổi |
| M02 | Drift engine/collation/version/grants/server UUID/schema | Gate từ chối trước DDL; log redacted; zero mutation |
| M03 | Trigger BEGIN END có nhiều ; và literal/comment | Một top-level statement gửi driver; no DELIMITER; checksum deterministic |
| M04 | Crash sau DDL trước checkpoint, checksum sửa giữa run | Resume inspect pre/post; drift UNKNOWN, sửa checksum bị từ chối |
| M05 | Backfill chunks + ACK loss + resume | Không duplicate/changing raw timestamp/money/hash; checkpoint đúng chunk |
| M06 | IANA 1970 +8, transition1975, midnight/month/year/leap | Business DATE parity P1.3, không fixed+7/named-zone dependency |
| M07 | Legacy không policy/revision/accepted_at/receipt thật | NULL lineage + epoch0; LEGACY marker, không forged receipt |
| M08 | FK cross-tenant/same org wrong branch/policy/period/doc/key | FK/CHECK hoặc trusted service từ chối; rollback hoàn toàn |
| M09 | Invalid/zero DATE, period nonmonthly/overlap/9999-12 | CHECK/service từ chối, query year0001/9999 vẫn đúng |
| M10 | Header/items/movement/receipt/audit/finalization mutate hoặc append sau finalize | Native SQL bị chặn theo grants/triggers; balances legitimate vẫn cập nhật |
| M11 | Contract khi movement duplicate/mismatch/partial metadata | NO-GO; không tự sửa/xóa/tắt constraint |
| M12 | Binary cũ/epoch sai/missing control/guard/kỳ | Fail closed, không inventory delta; kiểm actual endpoint trên disposable |
| M13 | Metadata lock dài/timeout/DDL disk fail mô phỏng | Stop/resume, không ghi applied sớm, không partial release COMPLETE |

## 4. Transaction/concurrency matrix

Mọi case race chạy hai thứ tự thắng; lặp có seed ít nhất 100 vòng ở native, đề xuất trước A2 không tính số này là đã đạt.

| ID | Điều phối | Kỳ vọng |
|---|---|---|
| C01 | Hai users, hai Backend, key khác, SKU tồn1 | Một201, một409 stock; balance0, revenue một sale |
| C02 | Receipt và sale cùng SKU, khác Backend | Thứ tự commit hợp lệ, no negative/lost update; receipt sau sale bị409 không bắt sale thành công |
| C03 | Cùng key/payload cùng branch | Một doc/receipt/audit/marker/delta, replay cùng ID |
| C04 | Cùng key khác branch/payload/type | Cùng org/type/key khác branch →409; type khác vẫn theo unique hiện tại, không đổi semantics |
| C05 | Cắt response sau durable COMMIT | Lookup/retry cùng key nhận frozen result; không thêm delta |
| C06 | Close period vs sale/receipt | Cùng guard, close thắng reject write; write thắng commit trước close |
| C07 | Policy pointer switch vs writer | Old/new snapshot đầy đủ, no mixed policy, stale request xử lý rõ |
| C08 | Staff revoke/disable/logout giữa auth preliminary và commit | User/session S/X linearization đúng, không dùng req.user stale |
| C09 | Kill process sau header/items/movement trước commit | Disconnect recovery rollback đầy đủ; observer đo lock release time |
| C10 | 1213 và1205 có barrier, hai product đảo thứ tự ở negative test | Detect lỗi, full rollback, tối đa2 retry, không retry từng statement |
| C11 | Chờ product lock qua local midnight/month rollover | accepted instant lấy sau locks; rollback/retry khi tháng đổi; no stale period/date |
| C12 | Missing balance hai concurrent writer | Upsert unique+row lock, một balance, no lost delta/duplicate |
| C13 | Primary disconnect trước/trong/sau COMMIT | UNKNOWN tra Primary authority; không replay key mới hoặc auto-promote |
| C14 | Hai org cùng product/filter identifiers, branch assignment khác | Zero cross-tenant rows qua list/count/detail/BI/replay/errors |
| C15 | Replay sang ngày mới, đổi giá/kỳ đóng/policy đổi | Frozen committed response; legacy hash không bị viết lại |
| C16 | Direct malicious DML commit thiếu marker | Ghi nhận threat-model limitation; nếu bắt buộc ngăn phải stored procedure/grants, không đánh PASS giả |

B-gate tương lai riêng: hai OWNER approve/commit cùng batch; MANAGER không quyền bị403; batch/key khác cùng source identity SAME/CONFLICT; close archive vs commit; preview expired/mapping changed; SQL/input AI trước/sau archive giống, no inventory/live_revision change. Không tạo các bảng/fixture B chỉ để hoàn thành A1.

## 5. Load plan 100 / 500 / 1.000 users

Đây là **ba mức tải thử nghiệm, chưa có kết quả capacity**. Chọn k6/JMeter hoặc công cụ tương đương sau approval; A0 không cài tool hay tạo script chạy tải.

Workload A (không mở history): 20% sale,10% receipt,20% products/catalog,40% dashboard/BI,10% AI. Role phù hợp, session riêng có think-time2–5s, login ở ramp và auth-burst riêng. Mỗi request có request_key unique cho ý định mới, một tỷ lệ retry cùng key có kiểm soát; không random key khi timeout. Test hot single branch và multi-branch riêng; AI stub xác định cost để đo API, inference service test riêng để đo AI latency thật.

Mỗi mức: warm-up5 phút, ramp5 phút, steady20 phút, spike ngắn/cooldown có manifest; soak2 giờ ở mức cao nhất đạt gate. Chạy open-arrival-rate cùng closed-user scenario để tránh coordinated omission; ghi actual RPS, offered arrival, achieved accepted writes/s, rejected429/503 và generator saturation. Không tăng số user khi correctness violation.

| Metric | Thu thập |
|---|---|
| API | Throughput offered/completed/accepted, p50/p95/p99 theo route, unexpected5xx/timeout,429/503,409 business riêng |
| DB | Active/idle/max/queued pool, acquisition wait, query digest/slow queries, commit/rollback counts/duration |
| Lock | Deadlocks,1205, retry attempts/exhaustion, guard wait/hold, product/balance lock wait |
| Host | CPU, RSS/RAM/GC/event-loop delay backend; MySQL CPU/IO/disk/buffer pool; generator CPU |
| Replica (khi được duyệt dựng) | Receiver/applier state/error, heartbeat/GTID/lag, ejection/recovery, bounded fallback |
| AI | Queue depth/age, active inference/concurrency, task/fan-out, p50/p95/p99, errors, model memory |
| Correctness | Final balances/sums/revenue/receipt/markers/audit/tenant assertions, no orphan/duplicate |

Gate đề xuất để duyệt theo mức muốn công bố: p95 live write≤1s,p99≤2s; p95 BI≤3s; unexpected5xx/timeouts<1%; zero negative stock/duplicate economic event/partial commit/tenant leak; no unbounded queues/connection growth. Offered rate phải được đặt trước run, accepted-throughput floor và allowable429/503 phải được duyệt, không đạt latency bằng drop phần lớn tải. Ghi sustained resource headroom và N−1 run; nếu guard bottleneck thì báo maximum measured capacity và bottleneck, không bỏ khóa để đạt chỉ tiêu.

AI SLO/concurrency chốt sau warm-up/model hardware benchmark, không suy từ timeout gateway20s. Summary năm task phải đo cost-weight và saturation. Stub pass không là AI inference nghiệm thu; CPU/RAM và model/version/hardware trong report bắt buộc.

## 6. Replica/failover/HA tests tương lai

Chưa dựng LB/Replica/Redis. Sau gói hạ tầng riêng mới chạy: pause applier, network cut1/cả2Replica, stale/unknown lag, causal read wait timeout, Primary fallback budget; backend rolling drain N−1; Primary partition, proof fencing, candidate GTID divergence và old Primary return. Không đọc permission/receipt từ Replica để kết luận correctness.

Replica failure không kéo live posting xuống; Primary failure fail closed/UNKNOWN, promotion chỉ sau fence; async receipt mất sau promotion phải đối soát, không coi test retry cùng key giải quyết data loss. Backup restore/PITR vào instance khác kiểm originals/invariants riêng; Replica không là backup.

## 7. Artifacts và điểm dừng

Mỗi run tương lai lưu config sanitized, release/source checksums, SQL/schema/engine fingerprints, synthetic seed/runid, dataset volume, controller/barrier traces, timing, outcome, metric histogram, DB assertion digest, faults timeline và limitations. Không ghi cookie/token/password/raw PII.

Trạng thái hiện tại: **NOT RUN** cho mọi M/C/load/HA case. Static review A0 không sinh PASS/FAIL native. Trước A1: duyệt isolated environment/harness injection và yêu cầu nghiệp vụ; trước A2: code/runner/harness đã review và actual MySQL proofs. Dừng chờ phê duyệt, không chạy suite RUN_DB_TESTS hiện tại vào retail_app.
