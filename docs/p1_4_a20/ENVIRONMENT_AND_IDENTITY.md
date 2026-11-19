# A2.0 — Môi trường disposable và identity contract

06/11/2026. **PROPOSAL ONLY; không provision, không kết nối hoặc SQL.**
[Báo cáo GO/NO-GO](../P1_4_A2_0_READINESS_REVIEW_2026-11-06.md).

## 1. Phương án và tài nguyên cần duyệt

Ưu tiên container trên VM/host test riêng đã được cấp, không phải service MySQL97 đang chạy. Nếu dùng host hiện tại, phải duyệt cài engine/virtualization và đủ RAM thực tế trước; snapshot free~1,69 GiB chưa đáp ứng budget đề nghị. Có mysqld.exe trên disk không đồng nghĩa đã có instance test.

| Thành phần | Correctness rehearsal ban đầu | Chưa bao gồm |
|---|---|---|
| MySQL instance riêng | 2 vCPU, memory limit2 GiB; buffer pool512 MiB; max_connections80; disk budget20 GiB | Không là sizing1.000 users; không dùng data/volume thật |
| Hai Backend test | Mỗi process memory budget512 MiB, pool≤10, IP127.0.0.1; tổng20 writer connections | Không dùng NODE_ENV/config/app runtime production |
| Observer/runner | Migrator1, observer2, seed/operator/admin tối đa7, reserve20 → tổng≤50/80 | Không cấp PROCESS/global admin cho Backend |
| Host VM trọn bộ | Đề nghị4 vCPU/8 GiB tối thiểu để rehearsal nhỏ và có OS headroom | Trước test cần xác nhận free RAM/IO; không phải benchmark host hiện tại |
| Load generator | Node/host riêng hoặc quotaCPU/RAM riêng, đo saturation | Không ngốn tài nguyên MySQL thật/production |

Nếu native Windows instance: datadir mới, auto.cnf/UUID mới, defaults-file riêng, log/temp/port/service name riêng, bind loopback. Không initialize/start với default config có thể trỏ datadir hiện tại; không copy auto.cnf/volume/SQL dump thật. Không dừng hoặc đổi config hai service đã phát hiện.

Image phải pin exact patch+digest do operator duyệt; không dùng mysql:latest hay floating8.4/9.7. Chọn compatibility version sau inventory baseline đã redaction; có thể cần hai profile Linux/Windows cho khác lower_case_table_names. Thư mục cài9.7 không chứng minh VERSION thật. [MySQL identifier case](https://dev.mysql.com/doc/refman/8.4/en/identifier-case-sensitivity.html).

## 2. Namespace và network đề nghị

Run proposal: a21_run001; schema literal retail_p14_test_a21_run001 (chưa tạo). Bất kỳ đổi run/schema phải tạo manifest/approval riêng; prefix không thay literal allowlist.

- DB published port127.0.0.1:13316 → container3306; hai Backend host-process127.0.0.1:13317/13318. snapshot không thấy listener, không giữ chỗ.
- Dedicated bridge internal và volume run-labeled riêng; không external network, host network, host.docker.internal, Docker socket, production volumes hoặc project compose network.
- Hai Backend ở host nhìn cùng endpoint loopback; trong container không dùng127.0.0.1 để gọi container khác. Nếu chuyển Backend vào container phải pin literal IP theo run và TLS, thay network/account-host plan; gate hiện không nhận hostname.
- Docker port publishing chỉ expose loopback; internal network không tự chứng minh host-to-container connectivity hay firewall isolation. A2.1 phải xác nhận route và firewall sau provisioning đã duyệt.
- Cấm outbound production/research endpoints ở firewall/VM/network policy. Không có research/AI config, không mount .env/source data thật.
- TLS ưu tiên CA test riêng, SAN đúng IP endpoint, rejectUnauthorized=true, fingerprint SHA256 pin. Với loopback isolated có thể xin exception no-TLS rõ ràng; không tự bật exception bằng flag để qua lỗi TLS.
- Starting container/MySQL sẽ initialize system data/users và tạo volume/network; đây là provisioning ghi, chưa được cho phép ở A2.0.
- Compose review không đặt MYSQL_DATABASE/MYSQL_USER, không init scripts hoặc health SQL, restart=no và profile requires-a21-approval. Placeholder image/secret bắt buộc vẫn chặn chạy nếu chưa chuẩn bị. Không chạy compose kể cả “up để thử”.

Nguồn: [Docker networks](https://docs.docker.com/compose/how-tos/networking/), [loopback publishing](https://docs.docker.com/engine/network/port-publishing/). Không coi network name khác là bằng chứng server UUID khác.

## 3. Tài khoản và grants tối thiểu đề xuất

Không tạo account/grant SQL trong A2.0. Không lưu mật khẩu, chỉ secret references sẽ được operator cấp sau duyệt. Bootstrap instance bằng principal quản trị **chỉ thuộc instance test**, không runtime/root production; thu hồi/khóa bootstrap sau provisioning. Test runner/Backend không dùng root.

| Principal | Quyền cần thiết | Quyền cấm |
|---|---|---|
| p14_test_migrator_run001 | SELECT,CREATE,ALTER,INDEX,REFERENCES,TRIGGER trên đúng schema test; INSERT/UPDATE cho bootstrap/backfill/audit đã duyệt | Global admin, GRANT OPTION, research, FILE, REPLICATION, DROP/cleanup tự động |
| p14_test_backend1_run001 / backend2 | SELECT các bảng org/user/session/branch/roles/control/policy/period/catalog/balances/doc/items/receipt/marker; INSERT doc/items/movements/receipt/audit/marker; UPDATE(quantity) balances và UPDATE(live_revision) guard | DDL, DELETE, UPDATE kinh tế/header/receipt/audit, policy/kỳ/quyền, archive tables |
| p14_test_control_run001 | SELECT scope test; UPDATE state/version kỳ, active_policy_id guard, user status/role, session revoked_at; INSERT/DELETE assignments cho test revoke; audit INSERT | DDL, chỉnh inventory/header/receipt, UPDATE archive_revision, production/global admin |
| p14_test_seed_run001 | Chỉ trong setup window: INSERT synthetic fixture/session/catalog/legacy docs vào test schema, SELECT để reconcile | Không dùng cho Backend; credential không giữ sau setup/fence |
| p14_test_observer_run001 | SELECT đúng bảng test assertions và performance_schema.threads, events_transactions_current, data_locks, data_lock_waits, statement summary/connection metrics đã allowlist | INSERT/UPDATE/DELETE, SET GLOBAL instrumentation, PROCESS mặc định, raw PII/SQL params logging |

Privileges trên performance_schema cần account/adapter observer riêng và approval; không nới backend grant gate để nhận wildcard system SELECT. Tránh INNODB_TRX nếu cần PROCESS; dùng bảng Performance Schema mục tiêu trên instance isolated. Metadata information_schema không là quyền SELECT dữ liệu tenant.

Account host phải pin nguồn thực của kết nối; Docker NAT có thể khiến user@host không là localhost dù published loopback. Phải xác định approved gateway/IP hoặc subnet hẹp sau cấp network, không mặc định user@'%' hoặc chỉ kiểm username. MAX_USER_CONNECTIONS có thể giới hạn Backend12 mỗi account, tổng native pool10; kiểm cấu hình đúng version/grants syntax sau duyệt.

**Gap R05:** gate A1 chỉ chấp nhận schema.* và không hỗ trợ table/column grants/observer exceptions. Bảng này là target contract cần implement+review; không tự cấp schema-wide DML chỉ để code hiện tại chấp nhận.

## 4. Identity gate đầy đủ, fail closed

| Gate | Target / bằng chứng cần bind | Trạng thái A1 / bổ sung |
|---|---|---|
| Authority | Stage/scope/run/approval ref, action allowlist, provisioning/write flags riêng; A2.0=false | Có native-write flag nhưng không chia hành động; profile review đóng tất cả |
| Endpoint | Numeric IP+external port, transport TCP, no socketPath/DNS/env fallback, TLS target; actual socket remote tuple | Có config literal IP/port; thêm observed tuple, freeze permit/config |
| Server | Exact UUID allowlist + forbidden UUID mỗi verify; server port3306 khác host13316, connection identity | Có UUID equality; denylist hiện chỉ config-time, cần recheck |
| Version/vendor | Exact VERSION/version_comment, MySQL supported CHECK/DDL, approved image digest/provenance | Có exact version/string check; chưa pin vendor/digest thực |
| TLS | CA validation, server IP SAN, cipher/transport, approved fingerprint; no-TLS chỉ approved isolated-loopback | Có CA+fingerprint code path; mysql2 local source có SecureSocket, chưa handshake native |
| Schema | DATABASE exact literal; default character_set/collation; known-schema inventory; no production names | Có exact schema denylist; chưa default charset/collation check |
| Account | Exact CURRENT_USER user@host và USER connection origin/role inventory | Chỉ username từ CURRENT_USER; cần host và effective grants |
| Grants | Role-specific required+forbidden sets, table/column matching, no role/global/grant option escape | Current schema-wide parser chưa đủ least privilege |
| Engine/CHECK | All application tables InnoDB, inventory coverage manifest, enforced CHECK, no unreviewed objects | Có engine reject; empty result vacuously passes, phải distinguish approved empty bootstrap from ready schema |
| Collation | Server/database/connection/columns; request_key+type actual charset/collation/ENUM order/padding | Chưa có gate. Bốn rendering tokens không đủ metadata validation |
| sql_mode | Exact approved canonical set + parser lexical modes; STRICT and zero-date policy pinned | Có exact string + strict presence; cần canonical signed binding và mode-specific parser cases |
| Time/driver | session UTC, microsecond string datetime, DATE strings, BIGINT strings, no multipleStatements, clock skew | Có UTC/driver flags, chưa native proof |
| Initialization | lower_case_table_names, datadir/container provenance, fresh UUID, no cloned real volume | Chưa có binding; cấu hình trước initialize, không SET lên server thật |
| Session protocol | writer effective RC, no verify query consumes SET TRANSACTION; clean session on checkout/release | Gap R01, trước native tests phải sửa/check trace |
| Cancellation | Closed/timeout/generation check sau verify và trước raw command; rollback/destroy handling | Gap R07; deadline timeout không tự cancel await chain |
| Lifecycle | Verify checkout/critical commands, stable release/source digest; local monotonic epoch/readiness | Có phần cơ bản, cần typed gate per phase và native evidence |

Các mismatch đều dừng trước SQL tiếp theo, hủy connection khi authority không còn đáng tin, trả sanitized code; không fallback production/Replica/DNS/credential khác. Không viết password/cookie/SQL parameters/raw grants vào journal/log.

A2.1 inventory read-only đầu tiên cần adapter riêng không SET session, GET_LOCK, DDL hay implicit write setup. Không gọi openDisposable A1 và mô tả là “chỉ SELECT”: hàm đó có SET time_zone. Native-write permit chỉ phát hành sau operator bind metadata. Không thu thập thông tin từ production bằng credential của agent.

[MySQL TLS](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html), [charset/collation nhiều tầng](https://dev.mysql.com/doc/refman/8.4/en/charset.html).

## 5. Quy tắc bindings/secret/provisioning

Profile JSON không phải harness config executable: chứa configProposal thay config và không password/CA private key. serverUuid/version/host principal/rendering đều null cho phần chưa biết; không tự điền UUID “có vẻ đúng”. Synthetic metadata trong lint chỉ có nhãn SYNTHETIC, không được dùng làm permit.

Provisioning admission phải tách khỏi runtime gate: instance mới chưa có schema nên DATABASE() có thể NULL. Chỉ bootstrap-inventory profile trên fresh instance UUID/container đã được duyệt mới được phép quan sát trạng thái đó; không dùng openDisposable hiện tại để lách kiểm schema. Sau inventory/approval, operator test-instance tạo schema/accounts đúng literal action allowlist; từ đó migrator/backend phải dùng exact DATABASE gate. Không cho bootstrap account tồn tại trong Backend hoặc biến retail_app thành schema bootstrap.

Secret phải mới, riêng từng principal, từ secret file/OS secret store operator-owned, ACL riêng; không truyền password argv, không đọc .env runtime, không in environment dump. Không đặt root secret hoặc JWT test vào Git/tài liệu. Compose dùng reference đường dẫn test secret, file chưa tạo.

Cleanup chỉ exact run-owned resources sau đối chiếu UUID/labels/datadir/approval; không wildcard, không dùng project retail-insight, không down -v dự án thật, không xóa volume giữ evidence UNKNOWN. Retention đề nghị7 ngày sau báo cáo test; incident/UNKNOWN giữ đến khi đối soát và phê duyệt.

