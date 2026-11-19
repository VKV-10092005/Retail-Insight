# P1.4 A2.0 — Chuẩn bị MySQL disposable và review release

Retail Insight — 06/11/2026. **STATIC ONLY; CHƯA CHO PHÉP THỰC THI SQL.**

**Kết luận: GO bàn giao thiết kế/cấu hình review; NO-GO tạo môi trường hoặc chạy RC1/native tests ở trạng thái hiện tại.** Có đường triển khai disposable khả thi về thiết kế, nhưng chưa có instance đã cấp phát, metadata/credential riêng và phê duyệt tài nguyên. Review phát hiện các điểm chặn trong harness/runner trước rehearsal.

## 1. Phạm vi và file bàn giao

| Artifact mới | Nội dung |
|---|---|
| Báo cáo này | Kết quả máy, review finding, GO/NO-GO và phê duyệt còn thiếu |
| [Môi trường và identity gate](p1_4_a20/ENVIRONMENT_AND_IDENTITY.md) | Container/instance, tài nguyên, account/grants, gate cần đạt |
| [Release choreography và recovery](p1_4_a20/RELEASE_CHOREOGRAPHY.md) | Thứ tự có barrier/data predicates, checkpoint và UNKNOWN |
| [Test matrix và đo tải](p1_4_a20/CONCURRENCY_TEST_MATRIX.md) | Hai process Backend, concurrency/legacy parity, metrics và load targets |
| [Profile review](p1_4_a20/disposable.profile.review.json) | Cấu hình không có secret, mọi quyền thực thi đóng, metadata thật để null |
| [Compose review](p1_4_a20/compose.disposable.review.json) | Dự thảo cấu hình container riêng, profile/mandatory values chặn chạy nhầm |
| [Release plan review](p1_4_a20/release-plan.review.json) | Phase DAG có typed steps, pre/post evidence, không phải executable manifest |
| [Static evidence](p1_4_a20/STATIC_EVIDENCE.json) | Dữ kiện kiểm tra tĩnh và checksum RC1 |
| [Manifest A2.0](p1_4_a20/MANIFEST.md) | SHA256 các artifact mới; không đổi manifest A0/A1 |

**Không sửa source, test, A0 SQL, RC1 hoặc cấu hình chạy hiện tại.** “Hoàn thiện gate/choreography” trong A2.0 là hoàn thiện contract, binding profile và danh sách sửa cần phê duyệt, không triển khai sửa code ngoài giới hạn “chỉ kiểm tra tĩnh/cấu hình/tài liệu”.

## 2. Kiểm tra môi trường thực tế, không kết nối DB

Chỉ dùng command discovery, metadata filesystem, danh sách dịch vụ, RAM/disk và socket LISTEN của Windows. Không chạy mysql/mysqld, docker/WSL, không khởi động/dừng dịch vụ, không mở TCP tới MySQL. Không đọc .env, registry credential, service command line hay file cấu hình MySQL thật.

| Dữ kiện | Kết quả quan sát | Giới hạn |
|---|---|---|
| Docker/Podman CLI | Không tìm thấy trên PATH; C:/Program Files/Docker không tồn tại | Không chứng minh tuyệt đối máy chưa có bản cài ở nơi khác; chưa có engine usable được xác nhận |
| WSL | Có wsl.exe trên PATH | Chưa kiểm distro/virtualization/backend; không khởi động WSL |
| mysqld.exe | Không có trên PATH; có file trong MySQL Server 9.7/bin và MySQL Server 2/bin | Chỉ file tồn tại, không chạy binary, không xác nhận version server |
| mysql trên PATH | C:/WINDOWS/system32/mysql, file không extension, 0 byte | Không coi đây là CLI MySQL usable; client exe khác có trong thư mục cài đặt |
| Dịch vụ | MySQL97 Running; wampmysqld64 Stopped | Không truy vấn server/port/schema của chúng; không sử dụng lại hoặc thay đổi |
| Cổng đề nghị | Không quan sát listener13316/13317/13318 tại lúc kiểm tra | Không phải giữ chỗ, không bảo đảm còn trống khi được phép chạy |
| RAM | Tổng8.419.024.896 bytes (~7,84 GiB); free1.776.908 KiB (~1,69 GiB) ở snapshot | Free RAM biến động; chưa đủ headroom đề nghị cho DB2 GiB + hai Backend |
| CPU / disk | 8 logical processors; C: free139.253.334.016 bytes (~129,69 GiB) | Không là capacity benchmark; chưa có volume test hoặc quota được cấp |

Tên dịch vụ/thư mục “9.7” không thay cho VERSION() thực tế. compose.yaml hiện tại đề cập mysql:8.4 là cấu hình source, không chứng minh server đang chạy8.4. Không dùng image floating tag để tự quyết phiên bản test.

**Khuyến nghị:** dedicated VM/host/container engine đã được chủ dự án cấp trên môi trường riêng; đề nghị tài nguyên ở tài liệu môi trường. Container vẫn cần CPU/RAM của host: không cài/chạy thêm Docker trên máy đang thiếu RAM chỉ dựa quyền A2.0. Phương án native instance chỉ là dự phòng, phải có datadir/config/service/port/UUID riêng; không dùng service MySQL97 hoặc wampmysqld64 làm disposable.

## 3. Review RC1 và bằng chứng checksum

Đã đọc lại module A1, candidate, A0 SQL, schema001/002 và tài liệu triển khai. Chạy parser/hash/render **trên chuỗi trong bộ nhớ**, có no-network preloader; không gọi runner, connector hoặc SQL driver execution.

| Check tĩnh | Kết quả |
|---|---|
| A0 manifest | 13 entry khớp checksum; 7 draft vẫn có REVIEW_ONLY |
| A1 manifest | 20 entry khớp checksum; không sửa 21 file bàn giao A1 |
| RC1 file SHA256 | 70c9ec5f4ad5d7d4d6abac7911fd41eb12aaadd0b0724350a9dc9d45cf785974 |
| Digest logic RC1 | 91d0ccd1e3f6c495326a556cc967414ed1981ba380e763b696412a185f7b4cb1, tính lại khớp |
| Rebuild từ draft | Digest khớp RC1, không ghi artifact đè |
| Graph | 31 IDs duy nhất,30 dependency edges tham chiếu bước đứng trước, không cycle |
| SQL statement hashes | 31/31 khớp; 30 manual templates được kiểm riêng trong evidence |
| Preconditions | Cả31 before/after fingerprint còn null, cả31 tables=[]; version/sqlMode/rendering/baseline thật chưa bind |
| Synthetic render | Bốn token được thay bằng metadata giả lập utf8mb4/utf8mb4_0900_ai_ci, không còn token; vẫn CANDIDATE_NOT_EXECUTABLE |
| Render digest giả lập | ff56b945c4b8115ebe0285bceab56c7986d7150bac2455bd6c3d3db0a4ed65cb — chỉ lint, không là approval metadata thật |

Graph không cycle chưa có nghĩa choreography đúng nghiệp vụ. Không có PASS native mới. 257 PASS của A1 là kết quả logic/mock/SQLite trước đó; A2.0 không chạy lại unit/integration/load tests hoặc suy ra capacity.

## 4. Findings chặn A2.1

| ID / mức | Phát hiện và bằng chứng source | Quyết định / điều kiện đóng |
|---|---|---|
| R01 Critical | writer.js đặt SET TRANSACTION READ COMMITTED rồi gọi beginTransaction; disposable.js beginTransaction gọi checked()/verify(), chèn SELECT/SHOW/metadata queries trước BEGIN | Nguy cơ next-transaction isolation bị một autocommit transaction trung gian tiêu thụ. Cần sửa wrapper/session initialization có kiểm soát, trace raw driver và native observe active isolation; không đổi default server sang RC để che lỗi |
| R02 High | Gate kiểm version/sql_mode/engine/UUID nhưng không kiểm server/schema/session/column collation và charset, không pin full CURRENT_USER host | Contract tại profile bổ sung mọi tầng + full user@host. Phải triển khai và negative-test trước native admission |
| R03 Critical | runMigration gặp CT_SCHEMA_VERSION manual sẽ throw trước đọc VERIFIED checkpoint; FN_HEADER_INSERT phụ thuộc nó; bootstrap/maintenance không nằm trong DAG thực thi | Không thể chữa bằng mark VERIFIED thủ công hoặc bỏ dependency. Cần release mới có typed TX/BACKFILL/BARRIER/VERIFY steps và manual attestation được kiểm data predicates |
| R04 High | inspect() fingerprint FK columns nhưng không UPDATE_RULE/DELETE_RULE; index/trigger security metadata cũng chưa đầy đủ; baseline fingerprint chỉ schema_migrations versions | Bổ sung constraint actions/index visibility/trigger definer-order, baseline schema/source fingerprint và phase-final verification. Không coi versions001/002 là đủ chống schema drift |
| R05 High | assertNarrowGrants chỉ nhận schema.*; không phân biệt migrator/backend/observer và không hỗ trợ table/column grants | Thiết kế grants tối thiểu đã có; code gate phải chấp nhận đúng capability từng role và từ chối thiếu/quá quyền. Không nâng quyền Backend lên schema-wide để qua parser |
| R06 High | File journal fsync+rename chưa có namespace lock theo realpath cho hai schema khác nhau cùng dùng runId, chưa directory fsync/Windows ACL proof; VERIFIED skip không có phase-final drift check | Duyệt directory ownership, target/release-bound namespace, local lock, final verification và crash evidence. Không hứa power-loss durability từ test roundtrip |
| R07 High | checked() metadata queries trước mọi operation có thể đợi quá deadline; timeout destroy xong verify đang await có thể còn continuation gọi raw SQL | Cần cancellation/closed-state check sau từng await và trước mọi raw call, test “timeout trong verify”, không release connection đang hoạt động |
| R08 High | Permit/config references không freeze; observed identity chỉ kiểm forbidden UUID qua config ban đầu, không denylist lại mỗi probe | Snapshot immutable permit/config, revalidate forbidden UUID/schema/account/roles per checkout/critical operation; điều chỉnh schema/grants trong transaction không được thay authority |
| R09 High | Hai services trong A1 model chung process không là hai Backend native. app.js hiện import pool retail_app | Cần launcher/test authenticator riêng, hai PID/pool/session chung trên disposable; không dùng app.js/.env hoặc production auth middleware trực tiếp |
| R10 High | Không có image digest/version/UUID/grants/collation thật, instance và tài nguyên chưa được duyệt | Giữ execution=false. Operator cung cấp metadata không secret và phê duyệt provisioning trước mọi init |

R01 là suy luận an toàn từ code và semantics documented, **chưa tái hiện bằng MySQL thật**. MySQL xác định SET TRANSACTION không SESSION chỉ áp dụng next transaction, sau đó revert session value; autocommit tạo transaction riêng. Vì vậy cần chặn trước khi gọi native harness. [SET TRANSACTION](https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html), [autocommit](https://dev.mysql.com/doc/refman/8.4/en/innodb-autocommit-commit-rollback.html).

Không sửa findings ở A2.0 vì chưa có quyền source changes trong lượt này. Đề nghị phê duyệt một gói hardening source+mock trước native rehearsal; mọi artifact A0/A1 giữ nguyên làm bằng chứng.

## 5. Identity và cấu hình đề xuất

Profile mặc định stage=A2_0_STATIC_ONLY, allowNativeWrites=false, approvalRef=null; metadata thật/secret references để trống. **Không truyền profile này cho connector để “thử”; gate hiện có cũng phải từ chối trước connector.**

Full contract gồm endpoint IP/port + container host binding, UUID allow/deny, exact version/vendor/image digest, TLS verified CA/SAN/fingerprint hoặc isolated-loopback exception được duyệt, exact schema và charset/collation, full account user@host, role-specific effective grants, InnoDB/enforced checks, strict sql_mode, UTC + driver DATE/BIGINT/string semantics và initialization-only lower_case_table_names.

Source gate chưa hiện thực đủ các trường này. Tài liệu môi trường chỉ rõ phần đã có/phần cần sửa. Không sử dụng credential production để điền metadata: chủ dự án/operator có thể cung cấp bản inventory đã redaction, không mật khẩu/token/file.env.

## 6. Choreography và test readiness

Release plan mới đề xuất đi qua:
baseline/identity → expand → bootstrap/backfill sơ bộ → maintenance/drain/fence → final-tail/reconcile → contract → schema-control attestation → fences → parity/old-writer-deny → cutover chỉ trong disposable.

Bootstrap hệ thống MySQL/container tự nó tạo system data và cần quyền ghi/provisioning; việc không đặt init.sql không làm startup thành read-only. A2.0 không thực hiện bước này. Native A2.1 chỉ được phép với stage-specific approvals và instance-owned resources, không tự động cho production cutover.

Hai process Backend đề nghị bind127.0.0.1:13317 và13318, mỗi process một writer pool≤10, cùng Primary13316 và cùng test JWT/session fixtures. Tổng DB budget có migration/observer/admin reserve nằm dưới max_connections80. Launcher chưa được tạo/chạy; HTTP router chỉ có thể mount trong test app riêng sau approval, không runtime Retail Insight.

Test matrix bao gồm sale/receipt đồng thời, request identity cùng/khác branch, timeout sau COMMIT, no-negative-stock, cross-tenant, revoke/assignment, close period/policy race, midnight/month rollover, legacy parity và failure recovery. Mỗi race có barrier, hai thứ tự thắng, DB assertions và evidence. 100/500/1.000 users vẫn là các mức thử tương lai; bắt đầu correctness rồi mới pilot/throughput.

## 7. GO / NO-GO theo hành động

| Hành động | Kết luận hiện tại | Điều kiện |
|---|---|---|
| Review cấu hình/choreography/tài liệu A2.0 | GO, đã bàn giao | Không SQL/runtime changes |
| Mua tài nguyên/cài Docker/tạo VM/instance/container | NO-GO | Chủ dự án duyệt provider/host/quota/version/chi phí; chưa có quyền |
| Kết nối inventory disposable | NO-GO lúc này | Provisioning xong + approval read-only riêng; không dùng harness có SET để giả là “không SQL” |
| Native RC1 migration/write/concurrency | NO-GO | Đóng R01–R10, bind release mới, typed predicates và A2.1 approval |
| Runtime/production router/cutover | NO-GO | Ngoài A2.0/A2.1 disposable; cần gói nghiệm thu riêng |
| Load100/500/1.000 | NOT RUN / chưa đủ điều kiện | Correctness native trước, budget/metrics/arrival rate được duyệt |
| Replicas/LB/Redis/AI queue/archive B | Ngoài phạm vi | Không triển khai |

## 8. Thông tin và quyền cần xin riêng

1. Chọn host/container engine/VM độc lập và quota. Với snapshot free RAM~1,69 GiB, không đề nghị chạy local DB2 GiB ngay. Không có cam kết giá hoặc mua dịch vụ.
2. Chọn exact MySQL version+image digest. Operator cung cấp baseline version/sql_mode/collation/lower_case_table_names và UUID server thật cần denylist, không credential.
3. Duyệt IP/ports13316–13318 hoặc địa chỉ remote, network/firewall, TLS/CA/fingerprint và secure secret delivery. Không gửi mật khẩu vào chat.
4. Duyệt instance initialization, schema/accounts/grants và cleanup ownership/retention trong A2.1; tài khoản provisioning chỉ thuộc instance test.
5. Duyệt hardening source của R01–R09 và mock tests bổ sung trước cấp native-write authority; không coi 257 PASS cũ là proof đóng findings mới.
6. Chốt local journal hay DB ledger, namespace/ACL/backup/crash tests; ký phase-plan/release mới sau binding.
7. Duyệt fixture tổng hợp, hai Backend test PIDs, observer permissions, fault injection, correctness invariants, throughput/SLO và tài nguyên load generator.
8. Chấp thuận A2.1 cụ thể, theo từng hành động; approval tài liệu A2.0 không tự cho phép provisioning, SQL hoặc native writes.

## 9. Trạng thái kết thúc

Chỉ tạo artifact dưới docs; không sửa/xóa file có sẵn. RC1/draft/source/checksum A0/A1 giữ nguyên. Không SQL kể cả SELECT tới DB, không connector, không container/DB/seed, không chạy server/test Backend hoặc inference, không mount router và không thay service/hạ tầng.

Bằng chứng A2.0 là static review và host metadata snapshot, không là native PASS. Các nguồn chính thức được dùng để kiểm thiết kế: [Docker networking](https://docs.docker.com/compose/how-tos/networking/), [loopback port publishing](https://docs.docker.com/engine/network/port-publishing/), [MySQL TLS](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html), [charset/collation](https://dev.mysql.com/doc/refman/8.4/en/charset.html).

**DỪNG sau A2.0; chờ phê duyệt. Không tự chuyển A2.1.**

