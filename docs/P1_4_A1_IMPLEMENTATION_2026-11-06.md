# P1.4 A1 — Báo cáo triển khai mã nguồn có kiểm soát

Retail Insight — 06/11/2026. **A1 SOURCE-ONLY; KHÔNG TRIỂN KHAI DATABASE/RUNTIME.**

Người dùng đã cho phép A1 sau [bộ A0](P1_4_A0_DESIGN_REVIEW_2026-11-06.md). Các điểm “chưa phê duyệt A1” trong A0 là trạng thái lịch sử của lần bàn giao trước; phê duyệt mới chỉ bao gồm phát triển code/kiểm thử cô lập, không bao gồm A2, DDL hay activation.

## 1. Kết quả và ranh giới

Đã xây dựng implementation SALE/RECEIPT mới qua factory cùng repository SQL và transaction controller, utilities ngày/tiền/hash, contract policy/kỳ/epoch, migration tooling và disposable harness. **app.js/server.js/ledger.js hiện tại không import hoặc mount implementation mới.** Không đổi API, role hoặc writer đang chạy. Các API/reader P1.1–P1.3 cũ vẫn nguyên source.

Writer/admin mặc định đóng trước khi lấy connection. Không có biến môi trường bật writer mới. Chỉ có hai mode được code chấp nhận:
- ISOLATED_MOCK với pool mock có nhãn rõ, dùng cho unit/integration mock trong A1.
- A2_DISPOSABLE với pool capability do harness cấp sau identity/permit gate; chưa gọi connector thật trong A1. Đổi nhãn một object thường không đủ.
Mode RUNTIME/production bị từ chối. A2 vẫn cần phê duyệt riêng trước bất kỳ native write/migration/provisioning.

## 2. File tạo mới

Không sửa file cũ. Tạo các file sau:

| Nhóm | File / chức năng |
|---|---|
| Domain | [domain.js](../backend/src/p14/domain.js): DATE/IANA, accepted instant, monthly range, DECIMAL cents BigInt, request/hash/replay versions, policy/control checks |
| Repository | [repository.js](../backend/src/p14/repository.js): SQL có tenant/branch, lock rank, current authorization, final header và atomic posting |
| Writer | [writer.js](../backend/src/p14/writer.js): READ COMMITTED, deadline/acquire/rollback/UNKNOWN, bounded retry, cùng connection Primary |
| HTTP factory | [router.js](../backend/src/p14/router.js): SALE/RECEIPT replacement router cần explicit auth/tenant injection; không mount |
| Admin | [administration.js](../backend/src/p14/administration.js): close live period/policy activation, OWNER recheck/audit, sorted user lock helper; không mở endpoint mới |
| Lifecycle | [lifecycle.js](../backend/src/p14/lifecycle.js): readiness và drain contract; chưa nối vào LB/server thực tế |
| SQL parser | [sql-parser.js](../backend/src/p14/sql-parser.js): lexical comments/quotes/markers, compound trigger subset, one top-level statement |
| Migration | [migration.js](../backend/src/p14/migration.js): candidate/render/checksums, persistent journal, step recovery, SQL metadata adapter và advisory lock |
| Harness | [disposable.js](../backend/src/p14/disposable.js): permit/endpoint/UUID/schema/account/grants/engine/UTC/TLS gates, connection/pool factory |
| Artifact CLI | [candidate-cli.js](../backend/src/p14/candidate-cli.js): inspect hoặc tạo JSON candidate; không có apply/connect command |
| Kiểm thử mới | backend/test/p14/domain.test.js, writer.test.js, migration.test.js, disposable.test.js, controls.test.js |
| Helpers kiểm thử | backend/test/p14/model.js, no-network.js |
| Release riêng | [candidate.json](../backend/releases/p14-a1-rc1/candidate.json), [README](../backend/releases/p14-a1-rc1/README.md) |
| Bàn giao | Báo cáo này và [manifest A1](P1_4_A1_MANIFEST_2026-11-06.md) |

Không sửa package.json/lockfile, runner cũ, migration001/002, env, frontend, AI gateway/FastAPI/weights/research, tài khoản, container hay production config.

## 3. Đối chiếu nhiệm vụ A1

| Nhiệm vụ | Implementation / trạng thái |
|---|---|
| 1. Runner mới | Lexer/parser, manifest/render, exact step hash, dependency/identity binding, RUNNING/VERIFIED/UNKNOWN, postcondition-based resume; không split(';') |
| 2. Disposable harness | Dedicated config/connector, denylist kể cả allowlist cấu hình sai, p14_test_ account, role/global grant rejection; chỉ fake metadata connector đã exercise |
| 3. Business date/policy/epoch | TODAY_ONLY Asia/Ho_Chi_Minh; accepted_at micros UTC, created_at floor second cùng instant; legacy lineage không dựng receipt/policy giả |
| 4. Refactor writer | Replacement implementation độc lập; giữ writer cũ chưa kích hoạt migration. Tính total trước INSERT; header/items/movement/balance/revision/receipt/audit/marker cùng transaction |
| 5. Repository/service | Lock rank control→org→user→session→guard→branch/assignment→policy/period→products→balances→posting; role/expiry đọc lại, không lấy req.user stale |
| 6. Tests cô lập | Unit domain/parser/gates; service+SQL repository integration trên transactional oracle mock; lifecycle/admin; existing SQLite HTTP regression |
| 7. Release candidate | RC1 riêng ngoài auto-discovery; 31 step records (30 DDL, 1 control UPDATE manual) và 30 preflight/backfill/cutover templates; A0 draft/sentinel giữ nguyên |
| 8. Compatibility | Existing pure/mock/SQLite API regression + protected-source checksum; chưa chứng minh writer mới trên schema MySQL thật |
| 9. Báo cáo | Báo cáo này, file manifest, kết quả và các gate A2 bên dưới |

## 4. Quy tắc transaction được hiện thực

Mỗi request mới validate/canonicalize phiên bản v2. Legacy replay gọi nguyên quy tắc Zod/JSON hash cũ, không sửa payload_hash và không dùng giá catalog hiện tại. request_key vẫn được so bằng DB collation hiện hữu; v2 giữ raw key trong envelope, case-equivalent identity khác envelope trả409. Omitted date khác explicit date.

Transaction đặt UTC và READ COMMITTED, recheck auth/session/role/branch dưới lock rồi tra committed receipt. Policy/period và tất cả products được khóa theo product_id tăng trước balances. Missing balance dùng upsert PK + SELECT FOR UPDATE. accepted instant lấy trên Primary sau các khóa có thể chờ; chuyển tháng thì rollback/retry cùng key, không dùng kỳ cũ. Today/expiry/effective policy kiểm tại acceptance.

Total/quantity dùng cents BigInt và bounds cũ; header INSERT total cuối. Success audit + receipt + marker cuối cùng trong cùng transaction. Replay không tăng revision/stock/audit posted lần nữa. Kỳ đóng chặn ý định mới nhưng không chặn replay đã commit nếu vẫn có quyền.

1213/1205 và request-identity duplicate có bounded whole-transaction retry tối đa2 lần; không retry mọi ER_DUP_ENTRY. Mất connection hoặc COMMIT ACK chuyển UNKNOWN và destroy connection, không cấp key mới. Rollback không xác minh được thì không trả connection vào pool. Acquisition timeout hủy connection đến muộn. Deadline/lock wait5s/2s là giá trị thử nghiệm, chưa là SLO được chứng nhận.

Không có mutex/lock RAM trong business implementation. model.js có serialization **chỉ để làm oracle test**; không chứng minh InnoDB hoặc interleaving nhiều Primary connection.

## 5. Runner và RC1: điều đã làm, điều bị khóa

- Parser đọc marker ngoài literal/comment; giữ semicolon trong BEGIN/IF/CASE; từ chối unclosed quote/comment, executable comments, DELIMITER, nhiều top-level statement và syntax ngoài subset.
- Đây là conservative parser/lexer, **không phải MySQL server grammar validator**. Một statement qua parser chưa chứng minh DDL/trigger hợp lệ native.
- Renderer chỉ nhận bốn tên charset/collation allowlist-safe; không nhận SQL expression tùy ý. Hash draft raw, statement trước/sau render, dependency chain và target binding đều có code kiểm tra.
- SQL adapter kiểm baseline schema_migrations version fingerprint, schema object metadata (engine/collation/columns/indexes/FK/CHECK/trigger), GET_LOCK ownership trước/sau statement.
- Checkpoint A1 dùng **operator-local JSON journal** (fsync file + rename, từ chối symlink directory), không tạo DB ledger trong A1. Đây là lựa chọn implementation khác bảng ledger được đề xuất A0; cần operator-controlled directory và DB advisory lock. File power-loss durability/OS rename semantics chưa có failure-injection native, không hứa whole-release atomic.
- RUNNING/UNKNOWN resume: exact postcondition thì verify không chạy lại; exact precondition thì có thể retry; mismatch thì dừng. Checksum hoặc target/release binding khác bị từ chối.
- RC1 state=CANDIDATE_NOT_EXECUTABLE; mysqlExact/sqlMode/baselineFingerprint/rendering/pre/post predicates chưa bind vì không được kiểm kê DB thật ở A1. Không thể chỉ đổi flag rồi coi release đã được kiểm chứng.
- State-transition DML và backfill/bootstrap/cutover templates không tự chạy trong DDL loop. Manual step làm runner dừng; trước native rehearsal phải có phase/choreography release được review riêng, postconditions và checkpoint evidence tương ứng. Chưa có backfill worker chạy dữ liệu hoặc tự động mở kỳ.
- Không ghi P1.4 vào schema_migrations cũ; không thay runner cũ, không cung cấp apply CLI vào retail_app.

RC1 digest: 91d0ccd1e3f6c495326a556cc967414ed1981ba380e763b696412a185f7b4cb1.

## 6. Kết quả kiểm thử thực tế

Node v24.13.0, dependencies đã có sẵn; không cài thêm package. Không chạy npm test toàn bộ vì có suite opt-in hướng runtime DB.

| Bộ kiểm thử | PASS | FAIL | Phạm vi |
|---|---:|---:|---|
| A1 mới: domain/writer/migration/disposable/controls | 102 | 0 | Logic/mock, local checkpoint temp files; không MySQL |
| Existing config/origins/period/business-calendar/read-snapshot | 84 | 0 | Pure logic/mocks; spawned Node cũng có guard |
| Existing bootstrap-owner + document-list integration | 71 | 0 | Mock bootstrap + SQLite :memory:; HTTP ephemeral của chính test |
| Tổng Node test cases được báo trong ba run trên | 257 | 0 | Không là capacity hoặc native lock proof |

Bản đầu phát hiện lỗi internal column whitelist chứa số và path alias Windows checkpoint; đã sửa và chạy lại. Số102 là kết quả cuối của bộ A1 mới, không cộng các lần chạy lặp.

Test preloader chặn dotenv/config bằng module hook; không nạp .env runtime. Mặc định chặn mọi network. Mode hồi quy HTTP chỉ cho phép socket tới cổng0/ephemeral server do chính process test tạo, không cho nối MySQL/dịch vụ localhost có sẵn/Internet. SQLite chỉ RAM. Checkpoint test chỉ tạo và cleanup exact temp directory đã resolve/kiểm prefix. Không đọc credential production hoặc gọi inference thật.

Các lệnh kiểm thử đã dùng, từ backend:

~~~powershell
node --import ./test/p14/no-network.js --test test/p14/domain.test.js test/p14/writer.test.js test/p14/migration.test.js test/p14/disposable.test.js test/p14/controls.test.js

# Lưu/khôi phục env của shell; không ghi .env hoặc User/Machine env.
$p14PreviousNodeOptions=$env:NODE_OPTIONS
$p14PreviousHttpMode=$env:P14_TEST_OWNED_HTTP
try {
 $env:NODE_OPTIONS='--import=./test/p14/no-network.js'
 node --test test/config.test.js test/origins.test.js test/period.test.js test/business-calendar.test.js test/read-snapshot.test.js
 $env:P14_TEST_OWNED_HTTP='1'
 node --test test/document-list.integration.test.js test/bootstrap-owner.test.js
} finally {
 $env:NODE_OPTIONS=$p14PreviousNodeOptions
 $env:P14_TEST_OWNED_HTTP=$p14PreviousHttpMode
}
~~~

node --check toàn bộ module src/p14 đạt. Candidate inspection/build chỉ đọc file/ghi JSON artifact, trả sqlExecuted=false. 13 entry checksum trong manifest A0 khớp; 96 file baseline cũ giữ nguyên aggregate SHA256 2c3d85bba0311b789a5d3fee16996c36116a1989ff72b818ff6bb8f63b7310d8. Manifest A1 ghi riêng file mới.

## 7. Tương thích và những điểm chưa chứng minh

- P0: startup/token/AI service không đổi; không thử inference hoặc sửa token. Kiểm chứng ở A1 là source unchanged, không là model nghiệm thu mới.
- P1.1: Gregorian0001–9999 và invalid/reversed ranges còn PASS; miền ghi DATE vẫn TODAY_ONLY.
- P1.2: SQLite HTTP kiểm cùng-item EXISTS, count/list/pagination/tenant/branch/role; không đổi filters cũ.
- P1.3: IANA1970/1975/midnight/month, RR report snapshot, movement parent date và raw UTC/tồn LIVE_CURRENT còn PASS.
- Chưa chứng minh CREATE/ALTER/TRIGGER trên MySQL thật, CHECK/FK/collation pad semantics, precise driver insertId/dateStrings/native error codes hoặc DDL cost.
- Chưa chứng minh lock rank với InnoDB/FK internal locks, 1213/1205 thật, N Backend processes, crash/disconnect rollback timing, Primary failure/promotion, backup restore, replication lag hoặc SLO100/500/1.000 users.
- Chưa tích hợp readiness/drain/router/admin vào runtime. Current staff/logout/catalog writers chưa chuyển toàn bộ sang protocol A1; đây là gate trước activation, không mở writer mới bên cạnh các luồng quản trị chưa review.
- Chưa có SQL-backed checkpoint ledger; journal operator-local cần được duyệt cách vận hành/backup trước A2 rehearsal.
- Chưa chống arbitrary direct DB DML bằng stored posting procedure; trusted runtime + grants/trigger assumptions A0 còn nguyên.
- Archive B/combined/hồi tố live/LB/Replica/Redis/AI queue đều chưa triển khai.

## 8. Điều kiện cần phê duyệt trước A2

1. Cho phép rõ native rehearsal/test-write trên MySQL disposable riêng; chưa cấp quyền vào retail_app/research.
2. Cấp host/IP/port/server UUID/TLS/schema literal, UUID denylist server thật, dedicated p14_test_ accounts/grants/secret source, pin version/sql_mode/collation/engine. Không dùng .env runtime hoặc root.
3. Review RC1, bind metadata/fingerprints thật, tách/chốt manual choreography (control/bootstrap/backfill/contract/fences/cutover) và recovery evidence trước chạy. Giữ A0 draft/sentinel bất biến.
4. Duyệt local journal hoặc yêu cầu DB ledger, đường dẫn operator-controlled/backup và failure-injection plan.
5. Native validate driver/locks/DDL/collation/replay/tenant/fence/legacy parity, tối thiểu hai process Backend có deterministic barriers. Chỉ sau đó mới đánh giá READ COMMITTED/lock rank là đã có bằng chứng.
6. Review adoption các luồng staff/revoke/policy/period và provisioning org/branch mới; writer missing policy/kỳ vẫn fail closed.
7. Quyết định threat model direct-DML/principal grants và tiêu chí load/SLO/budget. Load levels vẫn là mục tiêu test, không phải đã đạt.
8. Production activation/cutover/infrastructure là phê duyệt khác sau A2; mode RUNTIME còn khóa trong A1, không được đổi bằng env.

**DỪNG sau A1. Không chạy migration/DDL/backfill/seed/native write tests, không thay dữ liệu/schema/service đang vận hành, không tự chuyển A2.**

