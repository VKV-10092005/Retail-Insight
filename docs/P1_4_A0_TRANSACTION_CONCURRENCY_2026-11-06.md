# P1.4 A0 — Contract chứng từ và concurrency nhiều Backend

06/11/2026 — thiết kế đề xuất, chưa sửa API/transaction helper. [Báo cáo A0](P1_4_A0_DESIGN_REVIEW_2026-11-06.md).

## 1. Request và response

| Trường | Contract đề xuất |
|---|---|
| tenant/actor/epoch/timezone/accepted_at/created_at | Server resolve; client không được gửi |
| branch_id | INT UNSIGNED trong org; branch ACTIVE và assignment phù hợp |
| request_key | 12–80 ký tự, giữ quy tắc VARCHAR/collation legacy; không trim/lowercase mới. Unique(org,type,key), không đổi sang unique branch |
| items | 1–100 SKU khác nhau, sort product_id; quantity int 1–100000; không gộp dòng/giá |
| RECEIPT unit_price | Bắt buộc mỗi item; 0..100000000, tối đa hai số lẻ, giữ limit cũ |
| SALE unit_price | Client không được gửi; giá/snapshot product từ Primary dưới lock |
| note | Optional ≤500 theo contract cũ; omitted khác empty/null nếu normalizer version quy định |
| business_date | Optional ở phiên bản mới, strict YYYY-MM-DD; chỉ chấp nhận today từ accepted instant. Omitted khác explicit trong envelope |
| response | 201 first commit, 200 replay + replayed; giữ id/total tương thích trong giới hạn, BIGINT vượt safe range là string; lỗi 400/401/403/404/409/503 theo nguyên nhân |

Tiền tính bằng integer cents/BigInt hoặc decimal library, kiểm bounds trước ghi DECIMAL(16,2). Không đổi limit total cũ 100000000000000 cents; không dựa Number round cho giá trị không an toàn. Định dạng DECIMAL response phải được chốt qua regression, không tự thay toàn API numeric thành string khi không cần.

**Versioning idempotency:** tra header/receipt Primary bằng key sau auth; receipt hiện có xác định normalizer version dùng để so. Legacy không có receipt → dùng nguyên hash JSON cũ (Zod defaults/sort/insertion order), không sửa payload_hash hay dựng lại từ catalog. New request version v2 có canonical envelope decimal string, note và explicit/omitted date, branch/type/schema version; resolved hash thêm accepted date/policy/giá locked và snapshot algorithm. request_key là định danh, khuyến nghị không lặp vào envelope v2 nhưng phải pin chính xác specification. Payload_hash header mới là hex envelope hash cùng version receipt; legacy vẫn version cũ qua đường lookup riêng.

Lookup phải tìm cả key theo collation thật: key khác case/space có thể cùng DB identity nhưng envelope hash khác thì 409, không coi là key mới. Foreign key receipt cùng key/doc không chứng minh bytes giống tuyệt đối khi collation tương đương; v2 service so canonical envelope/raw key theo quy tắc đã chốt.

Replay không kiểm today/kỳ OPEN/giá hiện tại lần nữa; kiểm quyền xem hiện tại, payload/version rồi trả ID/total frozen. Nếu role hiện tại không còn quyền post nhưng vẫn có quyền xem: chỉ endpoint tra cứu/replay được duyệt mới được trả; không tự mở quyền mutation route. Đề xuất giữ POST requireRoles hiện có, người mất quyền POST nhận 403 và dùng GET detail nếu còn quyền. Khoá kỳ không chặn replay đã commit vì không có write mới.

## 2. Lock rank và linearization

Writer đề xuất **READ COMMITTED**, bắt đầu trên một connection Primary, session UTC đã verify. Plain SELECT không làm lock decision; SELECT FOR SHARE/FOR UPDATE trong transaction là current read. Reader list/BI giữ REPEATABLE READ consistent snapshot. Không SET GLOBAL, không SKIP LOCKED/NOWAIT để bỏ qua validation quan trọng.

Thứ tự thống nhất, mọi luồng lấy subset theo chiều tăng:

| Rank | Tài nguyên | Posting | Luồng khác |
|---|---|---|---|
| 0 | business_schema_control singleton | FOR SHARE | Maintenance/epoch X; không giữ branch rồi đợi control |
| 1 | organizations, theo id | SHARE, kiểm ACTIVE | Disable org X, không cố lock toàn bộ user/branch sau khi chờ rank ngược |
| 2 | users, theo id cho tất cả actor/target liên quan | SHARE, đọc role/status mới | Staff change/disable target X, user set khóa theo ID nếu nhiều người |
| 3 | auth_sessions, theo session id | SHARE, kiểm expires/revoked/user/org | Logout/revoke X sau org/user; expiry chỉ kiểm tại điểm chấp nhận |
| 4 | branch_posting_guards, branch_id tăng | X | Close/activate policy/registry/archive commit cũng X |
| 5 | branches rồi user_branch_roles, khóa theo branch/user | SHARE, kiểm ACTIVE/role assignment | Assignment mutation giữ user X rank 2 trước; branch disable X rank 5 |
| 6 | active policy rồi period; B thêm batch/preview/approval theo ID | policy SHARE, period X | Policy activation/period close dưới guard; B order guard→policy→period→batch→preview→approval |
| 7 | B source/registry identities (nếu có) | A không dùng | Khóa source và identity canonical theo thứ tự; missing row dùng UNIQUE race |
| 8 | products theo product_id | X toàn bộ product trước balances | Catalog mutations cần cùng auth rank; chỉ product update không giữ guard sau product |
| 9 | inventory_balances theo product_id | Upsert an toàn + X | Không sửa balance ngoài posting được duyệt |
| 10 | doc → items → movements → receipt/audit → finalization | INSERT / update balance đã lock | UNIQUE/FK có thể thêm internal locks; vẫn phải xử lý deadlock |

Khóa global control/org/user SHARE tương thích nhau nên không serialize mọi request. User đang sửa X chặn posting của đúng user; guard X serialize một branch. Auth rank trước guard tránh writer giữ guard rồi đợi user trong khi quản trị giữ user rồi đợi guard. A1 cần sửa mọi service liên quan theo rank này hoặc chứng minh luồng đó không lấy rank ngược; A0 không sửa source.

Đọc user trước transaction trong middleware chỉ là preliminary check; quyền quyết định transaction lấy lại dưới lock và không dùng req.user.role stale. Không cần khóa tổ chức chỉ để GET báo cáo dài; báo cáo kiểm auth Primary rồi query snapshot, không hứa revoke cắt được response đã bắt đầu.

Quyền/revoke linearize tại lock/commit: nếu posting đã giữ SHARE, revoke/disable X phải chờ posting commit, sau đó request mới bị từ chối. Không hứa revoke hủy một transaction đã được chấp nhận. Với staff role change, giữ target user X trước delete/reinsert assignments ngăn poster thấy trạng thái trung gian.

## 3. Posting protocol

1. Validate shape/canonicalize envelope ngoài transaction, auth preliminary Primary; fast replay lookup có scope.
2. Acquire writer connection với timeout, đặt isolation cho next transaction; BEGIN. Lấy locks rank 0–9; nếu thiếu control/guard/policy/kỳ thì rollback fail closed, không tự bootstrap.
3. Sau guard, lookup lại receipt/header để bắt request vừa commit. Nếu replay, commit read-only path/release; không tăng revision/audit posted.
4. Resolve active policy từ pointer cùng org/branch; chỉ policy effective và TODAY_ONLY, timezone đúng Asia/Ho_Chi_Minh. Kỳ dự kiến từ UTC hiện tại; khóa kỳ và toàn product/balance có thể chờ.
5. **Sau toàn bộ khóa có thể chờ cho quyết định nghiệp vụ**, lấy UTC_TIMESTAMP(6) một lần trên Primary. Đặt accepted instant = floor tới giây cho created_at; accepted_at_utc giữ micros; business_date tính IANA từ instant đã floor. Chỉ cắt micros, không chuyển giờ hoặc “làm ngày khớp” bằng timestamp giả.
6. Nếu sau chờ lock đã sang tháng khác kỳ vừa khóa: rollback và bắt đầu lại cùng key trong deadline; không khóa kỳ cũ rồi lấy thêm kỳ mới sai rank. Ngày đổi trong cùng kỳ thì tính lại today và validate explicit date. Clock drift/NTP threshold cần monitor; UTC từ DB là authority, IANA từ thư viện pinned.
7. Kiểm thời điểm accepted nằm kỳ OPEN/effective policy, quyền còn hợp lệ tại acceptance; quantity/stock/price/overflow. Tất cả product đã lock, upsert balance theo PK rồi khóa; không dùng giả định missing SELECT đã khóa gap.
8. Tính total cuối, snapshot item fields; allocate live_revision=guard.live_revision+1 (overflow fail), INSERT header với metadata và total cuối. Giữ raw created_at mới là instant accepted thực; không sửa timestamp cũ.
9. INSERT items, UPDATE balances theo delta, INSERT movements, tăng guard live_revision; INSERT receipt và success audit cùng transaction; INSERT finalization NATIVE cuối sau receipt/audit. Trước COMMIT kiểm marker và số dòng expected.
10. COMMIT một lần. Trả 201 chỉ sau ACK commit; nếu mất ACK, UNKNOWN. Release connection sạch; rollback lỗi cũng phải destroy connection, giữ nguyên primary error và ghi operational alert.

Bootstrap policy pointer cần effective_from <= accepted_at; scheduled switch không dùng MAX(version). Worker/policy activation phải cùng guard. Không cho policy tự động có hiệu lực khác pointer; khi current policy hết tính phù hợp thì fail closed và yêu cầu activation đã duyệt.

Giữ transaction ngắn: không bcrypt/OCR/upload/human approval/HTTP/AI trong lock. Deadline đề xuất tổng request live 5 giây, lock wait 2 giây, tối đa hai retry; đây là đề xuất để benchmark, không thay timeout hiện tại. Deadline app không tự hủy query DB: A1 cần cancel/destroy dedicated connection + xác minh rollback, không trả connection đang ghi cho pool.

## 4. Tám kịch bản cạnh tranh

| Case | Interleaving / kết quả |
|---|---|
| Hai sale SKU tồn=1, khác Backend/key | Guard/balance X xếp hàng; A bán còn0 commit, B current read thấy0 →409 và rollback; chỉ một revenue/movement |
| Nhiều receipt và sale | Mỗi branch serialize; thứ tự commit quyết định sale có tồn hay không. Sale thua trước receipt có thể 409 hợp lệ, không đợi hàng tương lai hoặc bán âm |
| Cùng key trên hai Backend cùng branch | B chờ guard rồi tra lại receipt; một commit + một replay. Không giữ RAM map làm quyết định |
| Cùng key khác branch | Hai guard khác nhau không ngăn race; UNIQUE(org,type,key) tại header/receipt phân xử. ER_DUP_ENTRY rollback toàn transaction rồi current lookup Primary mới; khác payload/branch →409 |
| Timeout sau COMMIT | Tra key/receipt Primary; nếu thấy frozen →200; nếu connection/authority chưa chắc →503/UNKNOWN, giữ key. Chỉ retry cùng key sau xác minh authority/rollback; không tự cấp key |
| Close period và sale | Cùng guard: close trước →sale bị chặn; sale giữ guard →commit trước close. Kỳ missing không ngầm OPEN |
| Activate policy và sale | Cùng guard + control SHARE: sale lấy old pointer trước activation thì commit với old snapshot; activation trước thì sale dùng new pointer hoặc409 stale form, không trộn policy |
| Backend crash/connection loss | Trước commit InnoDB rollback khi disconnect được phát hiện; sau commit trước response dùng receipt. Giữa COMMIT UNKNOWN, không suy diễn rollback |

Deadlock 1213: transaction bị victim rollback, bắt lỗi và đảm bảo transaction clean. Lock wait timeout 1205 có thể chỉ rollback statement theo cấu hình server; app **luôn rollback toàn transaction** rồi mới retry. Retry toàn function tối đa 2 lần với jitter 50–200 ms trong deadline; không retry validation/stock conflict/auth/constraint schema bug. Duplicate key chỉ chuyển sang replay lookup nếu đúng constraint identity; không map mọi ER_DUP_ENTRY thành success.

Retry sau rollback hoàn toàn chưa có receipt thì request có thể resolve today/giá/policy mới; chỉ committed receipt đóng băng business_date. Nếu client explicit date đã cũ thì 400, không nới TODAY_ONLY.

## 5. Bất biến và giới hạn trigger

Header/item/movement posted không UPDATE/DELETE; append item/movement bị chặn khi finalization đã có. Native finalize cần receipt đúng doc và coherent items/movements; legacy finalize không giả receipt và chỉ sau migration reconciliation. Audit/receipt/finalization append-only; policy append-only, thay pointer qua guard; period đổi state/version qua service và audit.

FK receipt gắn doc org/branch/type/key nhưng không thay hash/policy/date validation. MySQL không có deferred commit trigger trong thiết kế này; direct DB client có quyền INSERT có thể cố commit header thiếu marker. Threat model mặc định **runtime được tin cậy**, API transaction protocol + grants hạn chế/trigger defense-in-depth. Nếu phải chống mọi DML cố ý: stored posting procedure + revoke direct DML là gate mới trước triển khai, không thể tuyên bố giải quyết bằng trigger đơn lẻ.

DB checks không kiểm IANA today, quyền actor hay tổng delta cross-table đầy đủ: service kiểm trong transaction, triggers kiểm cơ bản, harness kiểm invariant. Maintenance account có quyền cao phải qua runbook/manifest, không dựa session variable client-set để vượt fence.

## 6. Tương thích nhiều Backend và Replica

Mọi critical reads ở Primary: auth/session/role/branch, idempotency, inventory, policy/kỳ/schema epoch, history preview/approve/commit và input AI hiện hành. Một write transaction một writer connection; không route theo GET hoặc SELECT đơn thuần.

Báo cáo dashboard/BI/catalog không quyết định ghi mới được đọc Replica trong tương lai qua allowlist. Mọi count/data/revision của report từ cùng RR snapshot trên một Replica. Gate đề xuất lag≤2s/heartbeat≤5s và receiver/applier healthy; UNKNOWN coi không đạt. Read-after-write detail/receipt luôn Primary; causal GTID wait tương lai phải trước khi mở snapshot. Primary fallback report có budget hoặc 503, không làm nghẽn live.

Sessions hiện đã DB-shared, giữ check Primary, không sticky; rotate secret có grace. Pool budget tính max instances × processes × limit, thêm rolling surge/admin/job reserve. Ví dụ 5 process ×10 writer +20 jobs +30 reserve=100 connection trong budget giả định150; chưa áp dụng cấu hình.

Readiness mới phải xác minh schema/epoch, writer authority và draining; liveness không phụ thuộc AI/Replica. SIGTERM: readiness false → LB drain → stop new request/jobs → chờ inflight trong grace >deadline → rollback/destroy incomplete → close pools. LB không auto retry POST. Đây là contract cần A1/hạ tầng review, không source đã có đủ.

AI/queue/snapshot và archive guard/registry chỉ được thiết kế ở Chương 15 và B0; không bổ sung vào pipeline hoặc bật combined trong A0. Replica không thay backup; UNKNOWN qua promotion async cần đối soát khi receipt bị mất.

Cơ sở: [locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html), [isolation](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html). Lựa chọn RC/lock rank là đề xuất dự án; chưa có bằng chứng native locks/performance.
