# A2.0 — Hai Backend, native matrix và kế hoạch đo tải

06/11/2026 — **tất cả native cases NOT RUN**.
[Báo cáo](../P1_4_A2_0_READINESS_REVIEW_2026-11-06.md), [gate môi trường](ENVIRONMENT_AND_IDENTITY.md).

## 1. Khả năng chạy hai Backend độc lập

Node v24.13.0 và module factory A1 tồn tại; repository nhận connection riêng, không phụ thuộc singleton/runtime pool. createP14LedgerRouter có auth/tenant injection. Đây là cơ sở code để tạo hai process test, **chưa có launcher native/test authenticator hoàn chỉnh** và chưa chạy PID nào.

Plan sau approval:
- Test app riêng, không import src/app.js, src/server.js, db/pool.js, dotenv/config hoặc production auth middleware có config global. Không mount router vào runtime Retail Insight.
- Backend A127.0.0.1:13317 và B127.0.0.1:13318, hai PID/process.env config riêng, một pool riêng mỗi process/account; cùng target DB127.0.0.1:13316/schema/UUID/release epoch.
- JWT key/session fixtures riêng cho test. Auth middleware riêng kiểm test signature/claim và context; writer vẫn recheck session/user/org/assignment Primary trong transaction, không tin role claim.
- Principal backend1/backend2 không có DDL/delete/economic update. Control process riêng đổi quyền/close period/policy bằng protocol lock rank; không gọi runtime PATCH/staff thật.
- Independent correlation IDs + instance IDs/PIDs, log connection IDs và barrier stage; không lưu cookie/token/password/payload PII.
- A2 admission chỉ sau gate fixes, schema/release ready và explicit permit; không đổi RUNTIME mode thành enabled. Observer nhìn hai connection/thread từ hai PID thực sự.
- Route request tới A/B trực tiếp để chứng minh cross-Backend, không sticky/LB. Mất một process không hủy process kia; graceful drain/deadline được kiểm riêng.
- Per process pool≤10; tổng20 connections, thêm migrator1/observer2/setup/control≤7/reserve20 →≤50/80 proposed max_connections. Acquire queue hữu hạn, reject/backpressure có metric; không tăng pool theo số user.
- Thiết kế load BI/catalog qua test read service/factory trên đúng pool; current runtime BI/AI modules import singleton nên không gọi chúng để “tiện dùng”. AI chỉ stub test riêng, không service/weights thật.

A1 model dùng serialization trong RAM chỉ là oracle. Không được chạy model rồi gọi là hai Backend/InnoDB native test. Hai process cùng dùng pool tag “mock” cũng không là native proof.

## 2. Barrier và oracle

Các điểm cần fault/barrier hook mới hoặc xác minh: after-auth-lock, after-guard, after-product/balance, after-header, before-commit, after-durable-commit-before-response. A1 có một số hook cấp service, chưa có đầy đủ raw-driver/after-header/after-commit hook; bổ sung bằng gói code review trước native test, không giữ hook bật trong production.

Coordinator release bằng latch/IPC có deadline, không sleep để “hy vọng đụng nhau”. Chạy hai thứ tự thắng + lặp100 vòng seed cố định đề xuất. Không fakeclock DB để cho qua validation: midnight cases dùng injected approved test clock trong test adapter có contract rõ, và một case DB-clock-real để verify UTC/precision.

Oracle bằng observer/verification account riêng:
- balance cuối=balance đầu+SUM(committed movement delta), quantity≥0, no overflow.
- Một doc/item per intended SKU, sign/branch/org đúng; header total=SUM(quantity*unit_price) DECIMAL.
- Một committed receipt + native marker, success audit một lần; no partial/orphan rows.
- Guard live_revision tăng đúng accepted writes; legacy metadata không giả policy/revision/accepted_at/receipt.
- count/list/BI revenue đúng tenant/branch/same-item filters; raw created_at/payload_hash/item prices và legacy timestamps giữ checksum.
- Out-of-scope schema/credential/account denied trước gửi bất kỳ DDL/DML; không fallback actual DB/Replica.

## 3. Native correctness matrix

| ID | Điều phối / hành động sau approval | Kỳ vọng và evidence |
|---|---|---|
| N01 | Hai sale khác key, A/B cùng SKU tồn1 | Một201, một409stock; balance0, một revenue/movement; lock wait observed |
| N02 | Receipt và sale cùng SKU, tồn0/1/near maxINT, hai thứ tự | Thứ tự commit hợp lệ; sale trước receipt có thể409; no negative/lost increment/overflow |
| N03 | Cùng key/payload qua A/B cùng branch | Một economic write; request thua replay200 cùng ID/total, no extra revision/audit |
| N04 | Cùng org/type/key nhưng khác branch/payload; key case/space theo collation | Unique toàn org/type thắng; khác envelope409; no uniqueness scope bị yếu đi; ghi exact collation evidence |
| N05 | Cùng key khác type và khác org | Giữ UNIQUE semantics cũ, không collision xuyên scope, không trả receipt tenant khác |
| N06 | Drop response sau durable COMMIT, retry sang Backend kia | Primary receipt trả frozen result, không delta lần2; key giữ nguyên |
| N07 | Disable user/revoke session/change assignment trong lúc request giữ auth lock | Poster đã chấp nhận commit trước revoke hoặc bị từ chối sau revoke; no stale-role access; lock S/X evidence |
| N08 | Close live period đồng thời sale/receipt, hai thứ tự | Close thắng reject intent; poster thắng commit trước close; replay committed vẫn được phép theo quyền |
| N09 | Activate policy vs poster | Old/new snapshot nguyên vẹn; no mixed pointer/date/price; version CAS/audit coherent |
| N10 | Product price update/SKU inactive vs posting, nhiều SKU order đảo ở negative path | Server price locked, status recheck; deterministic rank, detect/retry deadlock, no mixed totals |
| N11 | Missing balance concurrent receipt/sale | PK upsert+lock tạo đúng một balance, no gap-lock assumption |
| N12 | Worker/process kill sau header/items/movement trước COMMIT | InnoDB rollback toàn bộ sau disconnect detection; lock release measured; Backend khác tiếp tục |
| N13 | Network cut trước/trong/sau COMMIT trên disposable connection | UNKNOWN classification, no blind new key/retry; receipts/invariants sau reconnect đúng UUID |
| N14 | Induce1213/1205 bằng barrier; rollback failure và timeout trong gate.verify | Whole TX rollback, retry≤2; no raw SQL continuation sau destroy, no dirty pool release |
| N15 | Chờ lock qua midnight/month, session expiry trong lúc chờ | accepted_at sau decision locks, TODAY_ONLY; rollback/retry khi tháng đổi; UTC micro/floor-second coherent |
| N16 | Tenant2/branch ngoài assignment, manipulated org header/body/query | 401/403/404 đúng, zero data/receipt leak hoặc write; role kiểm hiện tại trên Primary |
| N17 | Legacy fixture1970/1975/leap/month/year, backfill+replay | IANA parity P1.3; no fixed+7, no old timestamp/hash/economic mutation, no forged receipt/policy |
| N18 | Old writer epoch/missing metadata/guard/policy/kỳ | Native reject/fail closed, no inventory delta; phân biệt SQL reproduction với actual API/binary evidence |
| N19 | Drain Backend A với inflight, request mới vào A/B | ReadinessA false, reject newA, inflight settles/explicit cancels, no duplicate on B |
| N20 | Current narrow/overprivileged/role/collation/UUID/schema negative cases | Gate rejects before mutation; zero fallback/global grants; observer audit recorded |
| N21 | Trace verified wrapper quanh SET TRANSACTION và BEGIN, server defaultRR | Active transaction phải RC bằng native observation, không chỉ @@session value hoặc test log có SET |
| N22 | Journal crash/DLC ACK loss/fingerprint drift/manual control state loss | Typed phase resume theo exact pre/post/data receipts; no blind replay/fake VERIFIED |

Các case trên chưa có test code đầy đủ hoặc native result. N21 là blocker R01, không được đánh PASS bằng setting server defaultRC. [MySQL next-transaction scope](https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html) và [Performance Schema transaction attributes](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-transaction-tables.html).

B/archive, replicated reads, promotion và queue/AI scaling không là case để “mở luôn” trong A2.1. Archive isolation giữ static contract; test B chỉ ở gói riêng sau approval.

## 4. Đo throughput/latency/contention

Correctness trước, pilot10 users trên từng Backend rồi mới mixed/hot-branch. 100,500,1.000 users là **mức tải thử tương lai**, chưa nghiệm thu và không đồng nghĩa100/500/1.000 requests/s.

Workload đề xuất theo A1:20%sale,10%receipt,20%catalog,40%dashboard/BI,10%AI stub; role/session riêng và think-time2–5s có seed. Native ledger-only pilot phải ghi “ledger-only”, không áp kết quả cho BI/AI. Mixed-workload cần test read adapters trước vì current runtime imports config/pool thật.

Các mức load: warmup5 phút, ramp5 phút, steady20 phút, spike/cooldown theo budget; soak2 giờ tại mức qua correctness/SLO. Open-loop offered arrival rate do operator duyệt sau pilot (ví dụ ramp10/25/50/100RPS là proposal), đo dropped/queued/rejected để tránh coordinated omission. Generator phải có CPU/network/headroom đủ, tách node nếu cần.

| Metric | Cách ghi và lý do |
|---|---|
| Offered/completed/accepted throughput | Requests/s theo route/type và accepted documents/s; retry/replay riêng, không tính retry là revenue mới |
| Latency | Client p50/p95/p99 toàn request + server middleware duration, acquire wait, auth/guard/product/balance wait, SQL/commit durations |
| Errors | Unexpected5xx/timeouts,429/503/admission rejection,409stock/conflict/deadlock-exhaustion riêng; denominator gồm mọi offered request |
| DB connections | Per Backend active/idle/acquire rejection; native Threads_connected/running/max; không suy user count từ max_connections |
| Transaction | Commit/rollback/UNKNOWN counts, retry attempts, original intent IDs/correlation, duration distributions |
| Lock | data_locks/data_lock_waits join thread/connection ID, wait age, guard hold time,1213/1205; observer read-only, no global instrumentation on realDB |
| Query/IO | Slow query digest rows-examined/sent, query plan, buffer pool/disk/CPU; redaction không log params |
| Backend | CPU/RSS/GC/event-loop, inflight/queue/deadline; so A/B và hot-branch vs many-branch |
| AI | Stub-call concurrency/latency/reject; không gọi đây là inference latency. Model benchmark là gói AI riêng |
| Replication lag | N/A khi chỉ Primary; không ghi0 như đã đo. Chỉ đo ở gói Replica sau duyệt |

Bottleneck experiments: (1) same-SKU vs different SKU cùng branch, (2) cùngSKU nhiều branch để thấy product lock xuyên branch, (3) nhiều org/branch so một hot guard, (4) pool10 vs queue pressure trong budget cố định, (5) ledger-only vs BI snapshot cost, (6) gate metadata probes bật đầy đủ vs đo overhead có kiểm soát. Không tắt gate/guard trong run nghiệm thu để tăng RPS; đo overhead riêng phải gắn nhãn diagnostic.

SLO đề xuất: live-write p95≤1s,p99≤2s; BI p95≤3s; unexpected errors<1%; zero economic/tenant/correctness violations. Accepted throughput floor/rejection budget phải duyệt trước run; không đạt bằng drop phần lớn traffic. Với8 GiB host hoặc Primary write contention, báo maximum measured stable load và giới hạn, không hứa1.000users.

## 5. Evidence và điểm dừng

Mỗi run tương lai: target UUID/source+release digests/actual collations, independent PIDs/pools, connection IDs, fixtureseed/volumes, barrier/fault timeline, sanitized request outcomes, histogram raw/hdr, invariant reports, lock metadata snapshots và host metrics. Không snapshot credential/PII/research.

A2.0 chỉ bàn giao matrix/measurement design. Chưa tạo instance/fixture/test launcher, không launch hai Backend, không chạy SQL/native/load. GO native chỉ sau R01–R10, tài nguyên và approval A2.1 theo báo cáo.

