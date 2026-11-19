# P1.4 A0 — Báo cáo hoàn thiện thiết kế kỹ thuật

Retail Insight — 06/11/2026. **BẢN REVIEW; CHƯA TRIỂN KHAI, CHƯA CHẠY SQL/TEST.**

A0 được cho phép đọc source, thiết kế và tạo SQL dự thảo. Định hướng Client → LB → N Express → một MySQL Primary + hai Read Replicas được giữ; chưa có quyền triển khai hạ tầng hoặc A1/A2. Báo cáo này chốt đề xuất kỹ thuật để review, không tự coi các quyết định nghiệp vụ/vận hành đã được phê duyệt.

## 1. Bộ bàn giao và thứ tự đọc

| Yêu cầu | Sản phẩm |
|---|---|
| A0.1 schema/DDL | [Bộ SQL và thứ tự](p1_4_a0_sql/README.md): preflight, expand, backfill, contract, fences, cutover |
| A0.2 runner/recovery | [Thiết kế runner](P1_4_A0_RUNNER_RECOVERY_2026-11-06.md) |
| A0.3–A0.5 chứng từ/concurrency/mở rộng | [Contract và giao thức khóa](P1_4_A0_TRANSACTION_CONCURRENCY_2026-11-06.md) |
| A0.6–A0.7 disposable/tải | [Thiết kế harness và kiểm thử](P1_4_A0_TEST_DESIGN_2026-11-06.md) |
| A0.8 rủi ro/A1 | Mục 5–8 của báo cáo này |

Nguồn định hướng: [kế hoạch P1.4](P1_4_TECHNICAL_IMPLEMENTATION_PLAN_A_B_2026-11-06.md), đã đọc toàn bộ gồm Chương 15. Các lựa chọn chi tiết trong bộ A0 này thay phần DDL minh họa A tại mục 4–7 khi review gói A. Không triển khai giai đoạn B: chỉ rà soát các vấn đề schema B tại mục 4; không tự cho rằng DDL archive đã release-ready.

## 2. Đối chiếu nguồn và giới hạn bằng chứng

Đọc schema trong [001_auth.sql](../backend/src/db/migrations/001_auth.sql), [002_operations.sql](../backend/src/db/migrations/002_operations.sql), [runner](../backend/src/db/migrate.js), [pool](../backend/src/db/pool.js), [ledger](../backend/src/business/ledger.js), [common](../backend/src/business/common.js), [auth middleware](../backend/src/middlewares/auth.js), [auth routes](../backend/src/routes/auth.js), [catalog/staff](../backend/src/business/catalog.js), [BI](../backend/src/business/bi.js), [AI gateway](../backend/src/business/ai.js), calendar/config, app/server, package.json và các test hiện có.

**Đối chiếu schema hiện tại ở đây là schema được khai báo trong source**, không phải SHOW CREATE TABLE của server đang chạy. Không kết nối database, không đọc .env/secret và không dùng số liệu cũ làm dữ liệu hiện tại. Drift/version/engine/sql_mode/collation/grants thật còn là gate bắt buộc; file preflight chỉ là dự thảo truy vấn cho tương lai.

| Phát hiện từ source | Hệ quả / xử lý A0 |
|---|---|
| 001/002 không chỉ định ENGINE/charset/collation | Không giả định server là InnoDB/utf8mb4 hay collation cụ thể. Dừng nếu engine không InnoDB; renderer dùng metadata đã ký duyệt, không tự CONVERT bảng |
| id org/branch/user/product INT UNSIGNED; doc BIGINT UNSIGNED | FK mới giữ đúng kiểu, mọi FK tenant gồm organization_id; ID BIGINT ra API bằng string chính xác |
| request_key VARCHAR(80), type ENUM, unique document_request(org,type,key) | Receipt dùng VARCHAR(80) và ENUM giống header, **cùng charset/collation** được render từ metadata; không VARBINARY cho key receipt A |
| Writer INSERT total=0 rồi UPDATE; hash JSON sau sort items | Writer A1 phải tính total trước INSERT; giữ normalizer/hash legacy nguyên trạng, không backfill receipt giả |
| Items unique(document,product); movement chưa unique doc/product, FK doc chưa gồm branch | Preflight tìm duplicate/mismatch; contract đề xuất unique movement/doc/product và FK org/branch/doc, thiếu sạch thì NO-GO, không tự sửa dữ liệu |
| transaction helper không đặt isolation; readSnapshot đặt REPEATABLE READ | A1 đặt READ COMMITTED cho writer trên từng transaction; reader BI RR snapshot, không đổi default toàn server |
| assertBranch trong transaction vẫn đọc req.user.role lấy trước đó, không khóa user/session | Thiết kế recheck role/status/session trên Primary dưới shared locks trước guard; không lấy claims/req.user cũ làm quyền quyết định |
| PATCH staff khóa user trước đổi assignment | Dùng cùng lock rank mới; user X chặn poster đang giữ user S, thay assignment không lọt giữa recheck/commit |
| Health chỉ verifyDatabase; server có close/pool.end nhưng chưa readiness/drain deadline | Chưa phải cluster readiness/graceful protocol hoàn chỉnh; A1 cần contract, hạ tầng vẫn chưa dựng |
| auth_sessions MySQL + JWT, pool=10, auth limiter local | Session đã dùng chung DB; chưa có read splitting hay distributed limiter |
| AI query live theo UTC và summary fan-out năm task | A0 không đổi query/calendar/weights; snapshot/queue là thiết kế Chương 15, không tạo bảng AI trong SQL A |
| Test operations nhập app/pool thật, verifyDatabase chỉ chấp nhận retail_app | Không chạy suite đó; thiết kế factory/config riêng cho disposable trước khi có bất kỳ native write test |

Không có Git repository tại workspace theo lần đối chiếu trước; không dùng git diff làm bằng chứng. Manifest SHA-256 trong bộ SQL là bằng chứng nội dung draft, không phải schema_migrations của DB.

## 3. Quyết định kỹ thuật đề xuất để review

- TODAY_ONLY: Asia/Ho_Chi_Minh, accepted_at UTC lấy trên Primary sau các khóa nghiệp vụ có thể chờ; floor đến giây cho created_at TIMESTAMP(0), dùng cùng instant cho business_date. Không đổi created_at cũ, movements hay timestamp nghiên cứu.
- Header mới tham chiếu policy_id và period_id theo org/branch. date_policy_version là nhãn thuật toán (business-date-v2), policy.policy_version là số revision riêng; không ép hai trường khác nghĩa thành một.
- Legacy có origin DERIVED_FROM_RECORDED_AT, writer_epoch=0 (nhãn LEGACY_UNKNOWN, không khẳng định writer thực tế), không policy_id/period_id/accepted_at/posting_revision. Không bịa approval hoặc revision cũ. business_date/timezone/algorithm được bổ sung từ recorded instant với manifest.
- Guard có active_policy_id, hai revision live/archive; FK ba cột chứng minh cùng org/branch. Bootstrap guard/policy/kỳ là một bước dữ liệu có manifest riêng được duyệt sau này, writer không tự tạo OPEN.
- Period là tháng; CHECK đầu tháng và đúng tháng kế, loại 9999-12 trước phép cộng; UNIQUE start + monthly shape bảo đảm không có kỳ giao nhau cùng branch. Tách live/archive state; chưa mở reopen/hồi tố.
- Receipt là kết quả đã commit, gắn chính xác org/branch/type/key/doc bằng FK nhiều cột; envelope/resolved hash version hóa. Cùng transaction với doc/items/movements/balance/audit.
- Finalization riêng cho legacy và native. Legacy marker không phải receipt; native marker tham chiếu receipt. Trigger ngăn sửa/xóa posted header/items/movement và append sau finalize; không hứa DB có deferred commit constraint.
- Global schema control được khóa SHARE trước auth/guard; maintenance đổi control bằng X và drain traffic. Cùng lock rank trên mọi Backend và luồng quản trị; không mutex RAM.
- READ COMMITTED cho writer, exact PK locks + UNIQUE; report RR snapshot. Deadlock retry toàn transaction tối đa hai lần, deadline tổng hữu hạn. Lỗi COMMIT/network UNKNOWN không cấp key mới.
- Pool writer/critical reads Primary; báo cáo chỉ offload bằng allowlist/lag gate như Chương 15. Mặc định A1 chưa có Replica/router/Redis.
- SQL dùng explicit ENGINE=InnoDB cho bảng mới; charset/collation các trường FK ký tự theo metadata legacy. Không thay hash, key collation hay precision field cũ.

## 4. Rà soát DDL B, chưa mở gói B

| Vấn đề DDL tham khảo | Thiết kế bắt buộc trước B1 |
|---|---|
| Batch tạo trước mapping, thiếu FK source+mapping version | Tạo mapping trước batch, UNIQUE(org,source,version), FK batch cùng source; mapping target có FK tenant |
| Preview/approval/commit receipt chưa khóa đúng batch | UNIQUE(org,batch,id) preview và FK approval/receipt(org,batch,preview), không chỉ cùng org |
| Historical doc có thể branch khác batch | UNIQUE(org,branch,id) batch, FK historical(org,branch,batch) |
| Registry uniqueness source identity không gồm batch | Giữ org/source/type/externalID theo contract nguồn; nếu ID chỉ duy nhất theo branch, contract namespace phải phân biệt branch trước publish, không đổi tùy ý |
| LIVE và ARCHIVE có UNIQUE riêng chưa đủ xuyên bảng | Khóa event registry + representation immutable + trigger/transaction target, orphan check/finalization |
| Một đoạn nói một product/doc trong khi DDL cho nhiều SKU khác nhau | Đề xuất B cho nhiều SKU khác nhau tối đa 100; cấm trùng SKU/giá khác trong một doc. **Cần duyệt riêng**, chưa thay nghiệp vụ B |
| DDL staging/approval còn mô tả dạng bảng thay SQL đầy đủ | Chưa là bộ migration B. Phải có gói B0 riêng với states, grants, expiry và parser limits được duyệt |
| Publisher cần UPDATE guard archive_revision nhưng không được DML live | Có thể cấp UPDATE cột archive_revision trên guard; không cho UPDATE live_revision, active policy hay balance; test quyền thật trong B |
| MANAGER/OWNER approve và tự duyệt còn mở | Không tự cấp MANAGER approve; OWNER baseline, self-approval/two-person chờ quyết định |

Archive giữ analytics-only vật lý; upload/publish không đổi live tables, catalog/attributes, movements/balances hoặc AI input. Chưa tạo SQL B runnable, chưa bật HISTORY/COMBINED/import.

## 5. Ma trận tương thích

| Baseline | Điều phải giữ | Bằng chứng tương lai |
|---|---|---|
| P0 AI token/startup | Không sửa token, launcher, weights hoặc inference contract; 503/model unavailable không biến thành forecast giả | HTTP stub contract + diff file AI/config bằng 0; inference thật là gói riêng |
| P1.1 ngày Gregorian | Query 0001–9999, invalid dates/start>end bị chặn; miền query rộng hơn miền DATE writer | Pure validator cases và SQL DATE range không clip TIMESTAMP |
| P1.2 document filters | EXISTS cùng item, tenant/branch, count/list, total full doc vs BI line sum | Fixture có hai item thuộc category khác, cross-tenant, pagination tie cases |
| P1.3 business calendar | Backfill IANA parity day/month/range, giữ UTC raw và tồn LIVE_CURRENT | 1970 +8, transition 1975, midnight/month/year/leap; checksum/count/total trước sau |
| Legacy idempotency | JSON hash/normalizer/key comparison cũ | Fixtures được tính bởi normalizer cũ, case/accent/trailing-space theo collation thật; không cập nhật payload_hash |
| Auth / permission | Session revoke, staff change, org/branch disable có thứ tự với posting | Race user X vs poster S ở hai Backend; linearization commit trước revoke hoặc từ chối sau revoke |

Kết quả PASS cũ chỉ là baseline đã báo trước, không là kết quả A0. SQLite/RAM tests cũ không chứng minh DDL, native locks hay replication.

## 6. Rủi ro và cách chặn

| Mức | Rủi ro | Gate / biện pháp |
|---|---|---|
| Critical | Chạy draft/runner cũ vào retail_app | Draft ngoài migration dir, sentinel SQL không hợp lệ, không có lệnh chạy; release mới chỉ sau approval + identity allowlist |
| Critical | Receipt khác collation/key semantics | Renderer pin actual charset/collation, enum/type, unique tests; unresolved token thì từ chối |
| Critical | Timestamp/business_date lệch nửa đêm | Một accepted instant sau lock, floor giây có chủ đích, IANA pinned; giữ TIMESTAMP raw; không UTC+7 backfill |
| Critical | Old writer ghi giữa tail backfill/contract | Ingress maintenance + control X + drain/credential fence; thiếu bất kỳ bằng chứng thì NO-GO |
| Critical | User/assignment bị đổi giữa authorization và commit | Shared auth locks có rank; staff/disable/revoke tuân thủ rank và writer đọc lại quyền |
| Critical | Duplicate hoặc stock âm xuyên Backend | Guard X + product/balance lock + unique receipt/header; whole transaction rollback |
| High | Direct DB DML cố tình commit thiếu receipt/marker | Runtime trusted threat model phải duyệt; trigger không có commit hook. Nếu yêu cầu chống DML tùy ý: thiết kế stored procedure/thu hồi direct grants trước release |
| High | Metadata lock/ALTER dài, implicit commit, disk | Timeout, preflight long transactions/disk, native rehearsal, checkpoint/schema predicate; không ép thuật toán online chưa hỗ trợ |
| High | Legacy movement duplicate/mismatch/tổng không khớp | Preflight invariant violations là NO-GO, không xóa/gộp/sửa tiền tự động |
| High | Failover async mất receipt đã ACK | UNKNOWN + fence + đối soát, không claim exactly-once qua data loss; chưa triển khai promotion |
| High | Hot guard giảm throughput; pool surge làm hết connection | Benchmark hot branch và mixed branches; connection budget với max/surge và backpressure |
| Medium | Audit failure/PII hoặc no-session denied event | Success audit cùng transaction, failure audit riêng có alert và redaction; không giả user |
| High | Bootstrap org/branch mới thiếu guard/kỳ | A1 thêm provisioning cùng transaction có policy được duyệt hoặc fail closed; không âm thầm cho writer tự OPEN |
| High | Charset legacy không chứa IANA/algorithm labels hoặc key quá dài | Kiểm metadata/key-byte budget bằng native DDL; dừng khi không tương thích |

## 7. Điều kiện vào A1 và trước migration

**Được xem xét chuyển A1 (code/test trên nhánh riêng) khi:** duyệt contract TODAY_ONLY, legacy lineage, hash/version/key semantics; duyệt schema draft/lock ranks/READ COMMITTED; thống nhất threat model direct-DML và cơ chế grants; duyệt môi trường disposable, test budget/SLO; người dùng cho phép rõ A1. Hiện **chưa có phê duyệt A1**.

**Trước bất kỳ migration, kể cả disposable:** xác nhận host/port/server UUID/schema/grants/sql_mode/engine/version/collation, pin release digest; account và network allowlist riêng; native harness/runner mới được review; sentinel không còn trong release đã duyệt; backup/restore và clean preflight/invariants; kế hoạch recovery và operator approval. Không sử dụng runner/pool runtime hiện có làm đường tắt.

**Trước cutover thật:** toàn bộ native/failure/replay/tenant/legacy parity pass có evidence; migration rehearsal/restore drill; bootstrap manifests; writer epoch principal/fence và N Backend inventory; performance ở tải được duyệt; sign-off maintenance, rollout và rollback read basis. Import/combined/AI changes vẫn OFF.

## 8. Quyết định cần phê duyệt riêng

1. TODAY_ONLY, Asia/Ho_Chi_Minh, định nghĩa accepted_at sau khóa và cách floor TIMESTAMP(0).
2. Legacy epoch=0/NULL lineage và finalization riêng; không gán policy/revision/request receipt giả.
3. Envelope version mới, explicit-date khác omitted-date, giữ key collation/normalizer cũ; string ID/DECIMAL serialization contract.
4. Schema + index branch-first để rehearsal; READ COMMITTED writer, auth lock rank, retry/deadline và batch limits.
5. Quyền quản trị policy/kỳ, bootstrap/rollover/org mới, missing fail closed, chưa reopen live.
6. Trusted runtime + trigger hay stored posting procedure chống arbitrary DML; DB grants/principal/fence cần duyệt vận hành riêng.
7. Disposable host/account/DDL privileges, harness injection, synthetic fixtures, fault injection và load-test budget/SLO.
8. Các quyết định B (source identity/overlap, số SKU/doc, OWNER self-approval/MANAGER submit, archive period grants) ở gói riêng.
9. Chương 15: LB/Replica/Redis/AI scaling, lag gates, RPO/RTO/fencing, budget/backup retention còn cần duyệt triển khai riêng.
10. Cho phép A1 cụ thể; đồng ý A0 không phải cho phép migration/test ghi/cutover.

## 9. Trạng thái bàn giao

Tạo mới báo cáo này, runner/recovery, transaction/concurrency, test design; thư mục p1_4_a0_sql chứa README, bảy file SQL dự thảo và manifest SHA-256. Kế hoạch gốc chỉ bổ sung liên kết tới bộ A0; không thay nội dung giai đoạn A/B/Chương 15 đã có.

Kiểm chứng trong A0 chỉ là đọc source và rà soát tĩnh nội dung, liên kết, statement boundaries/checksum/sentinel. Không parse bằng server MySQL; chưa xác nhận syntax/runtime/lock behavior/DDL cost/restore hoặc capacity 100/500/1.000 users. Không chạy unit/integration/native/load tests, không kết nối hoặc tạo DB, không sửa source/API/quyền/AI/runtime. Không có A0 PASS count suy diễn.

**DỪNG sau A0; chờ phê duyệt bước tiếp theo.**
