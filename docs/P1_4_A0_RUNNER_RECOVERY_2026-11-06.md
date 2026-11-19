# P1.4 A0 — Thiết kế migration runner và recovery

06/11/2026 — chỉ thiết kế. Không sửa/chạy src/db/migrate.js. [Báo cáo A0](P1_4_A0_DESIGN_REVIEW_2026-11-06.md).

## 1. Định dạng release và đơn vị thực thi

Runner cũ split(';') không hiểu trigger BEGIN/END, không có checksum/step checkpoint, tự dùng runtime pool hướng retail_app. Runner mới tương lai là công cụ riêng, dedicated config/connection, multipleStatements=false, không import runtime pool. Không dùng câu DELIMITER vì đó là chỉ thị client, không là SQL gửi server.

SQL draft chia bằng dòng **-- @statement ID** tại đầu dòng. Mỗi block sau marker là đúng một statement hoàn chỉnh; dấu ; bên trong BEGIN/END giữ nguyên. Marker chỉ hợp lệ ngoài literal/comment; release builder dùng parser/lexer MySQL để xác minh điều này, từ chối DELIMITER, USE, multi top-level statements, token chưa render, path escape và statement ID lặp. Không tách bằng semicolon hoặc regex BEGIN/END đơn thuần. Với template backfill, một invocation chứa một statement và parameter schema riêng.

Tất cả file draft mở đầu statement REVIEW_ONLY có SQL cố ý không thực thi được. Không đưa docs/p1_4_a0_sql vào auto-discovery backend/src/db/migrations. A0 không tạo executor hoặc release runnable.

Release tương lai gồm ordered manifest: release_id, target schema contract, baseline 001/002 digest, min/max MySQL version, collation/engine fingerprint, writer epoch/min app capability, statement id/type/dependencies/pre/postconditions, exact UTF-8 bytes SHA-256, render inputs digest, parameter schema và approval reference. Checksum trước/sau render đều lưu. Không render token từ HTTP/environment tùy ý; chỉ metadata allowlist được người vận hành xác nhận.

MySQL tối thiểu đề xuất 8.0.16 để CHECK được enforce, nhưng phải rehearsal đúng phiên bản thực tế trước chọn release. Không dùng manual version 9.7 trong kế hoạch cũ để suy ra server là 9.7. Không tự nâng DB server.

## 2. Ledger checkpoint đề xuất, chưa tạo

Hai bảng migration riêng (DDL chỉ mô tả ở đây, A1 mới hoàn thiện executor/bootstrap): migration_runs(run_id,release_id,server_uuid,schema_name,baseline_fingerprint,release_sha256,status,operator_ref,started_at_utc,ended_at_utc); migration_steps(run_id,step_id,statement_sha256,render_sha256,status,attempt,last_pk,high_watermark,before_fingerprint,after_fingerprint,affected_rows,error_code,started_at_utc,verified_at_utc). PK/UNIQUE(run_id,step_id); mọi timestamp UTC. Không ghi SQL params/PII/secret vào error text. Bootstrap ledger cũng là step có expected schema/checksum, không CREATE IF NOT EXISTS để che drift.

RUNNING → VERIFIED hoặc FAILED/UNKNOWN. VERIFIED bất biến; sửa bytes của step đã VERIFIED thì runner từ chối, forward-fix bằng step ID mới được review. Resume không overwrite checksum, không replay mọi file.

Chạy có operator lock trên dedicated Primary connection qua GET_LOCK tên gồm schema/release namespace; mọi executor cần dùng cùng lock namespace cấp schema. Lock mất thì dừng; advisory lock không fence runtime writer, không thay maintenance/epoch. Không tự reconnect và tiếp tục transaction/checkpoint khi chưa xác minh identity.

## 3. Quy trình một step

1. Read-only identity gate trước DDL: endpoint/TLS fingerprint/server UUID/schema/user/grants/engine/sql_mode/DDL compatibility; đúng approval, baseline manifest và mode.
2. Kiểm dependencies và precondition expected schema: so cột/kiểu/default/collation/PK/UNIQUE/FK/CHECK/trigger definitions bằng canonical fingerprint. Presence một tên table không đủ.
3. Ghi RUNNING + checksum + before fingerprint bền; execute một statement trên một dedicated connection, SQL parameters bind, không bật multipleStatements.
4. Kiểm postcondition cụ thể: ví dụ column đủ metadata, FK đúng cột/thứ tự, CHECK enforced, trigger body/hash đúng. Không chỉ tin affectedRows hoặc tên constraint.
5. Ghi VERIFIED + after fingerprint + thời gian; release chỉ COMPLETE khi toàn step và dữ liệu invariant verified. schema_migrations cũ không ghi “P1.4 applied” ở giữa chuỗi.
6. Nếu lỗi: record sanitized error/state, dừng dependency chain; không tự DROP hoặc chạy bù đoán.

DDL có implicit commit; ledger RUNNING và DDL không atomic chung. MySQL atomic DDL của một statement không làm nguyên release atomic. Sau crash:
- Precondition còn nguyên → chưa áp dụng: operator cho retry cùng bytes.
- Postcondition khớp hoàn toàn → DDL đã xong nhưng ledger thiếu: verify rồi mark VERIFIED.
- Cả hai không khớp → UNKNOWN/drift: dừng để inspect, tạo forward-fix mới.
- Không phân biệt được vì mất server → UNKNOWN, tuyệt đối không tự retry bằng endpoint khác.

Tham khảo [MySQL implicit commit](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html), [atomic DDL](https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html) và [trigger syntax](https://dev.mysql.com/doc/refman/8.4/en/trigger-syntax.html). Không coi tài liệu tham khảo là native validation.

## 4. Backfill checkpoint và bảo toàn dữ liệu

Không thể làm IANA backfill chính xác bằng fixed +7 cho 1970; không dựa named timezone tables của MySQL. Worker tương lai dùng Temporal 0.5.1 đã pin + runtime/tzdata digest, đọc raw created_at với DB UTC và tính date trong app. File 20 chứa prepared statement template, không tự tính ngày bằng SQL và không có giá trị thật.

Manifest per run/chunk: exact server/schema, PK high-watermark, interval, document IDs/raw UTC timestamp/hash, expected derived DATE, algorithm/tzdata, before checksum kinh tế, target checksum, operator ref. Không lưu PII. Field dữ liệu gốc gồm header created_at/payload_hash/request_key/total, items, movement timestamps/delta/balance và balances giữ nguyên.

Mỗi chunk:
- SELECT bằng keyset (last_id,high_watermark], giới hạn rows, không OFFSET, schema UTC; không đọc Replica.
- Transaction đọc/khóa row cần bổ sung rồi conditional UPDATE khi **mọi metadata mới NULL** và created_at vẫn bằng raw expected; nếu metadata partially populated thì kiểm đối chiếu từng field, không ghi đè.
- UPDATE chỉ metadata mới; legacy epoch=0, posting_revision/policy/period/accepted_at NULL, origin DERIVED. Không backfill receipt hoặc thời điểm accepted giả.
- Check affectedRows đúng expectation, digest trước/sau của field gốc; dữ liệu mismatch thì rollback/quarantine/NO-GO.
- Checkpoint last_pk và digest cùng DML transaction (hoặc lưu chunk receipts idempotent nếu ledger ở storage khác). COMMIT mất ACK → lookup chunk receipt trước phát lại; conditional NULL alone chưa chứng minh chunk kiểm đủ.
- Giới hạn lock time/chunk, pause/resume giữa chunk; không giữ lock toàn backfill.

Online sơ bộ có thể còn writer cũ tạo NULL sau high-watermark; final tail thực hiện dưới maintenance, drain và fence. Legacy marker chỉ tạo sau đối chiếu header/items/movements, cùng manifest, không tạo receipt giả. Live_revision bắt đầu 0 ở bootstrap; không dùng MAX(id) làm lịch sử revision.

## 5. Compatibility, epoch và cutover có kiểm soát

Các capability đề xuất: schema expand=1, enforced=2; reader RECORDED_TIME/BUSINESS_DATE; epoch 0 dành legacy provenance, epoch 1 là writer mới thử nghiệm release đầu. Nếu đổi semantic writer về sau phải tăng epoch, không tái dùng. Số cụ thể còn cần duyệt.

EXPAND: old writer còn có thể ghi NULL; reader cũ, flags import/combined OFF. New binary có thể dual-populate nhưng final fence chưa bật. Guard/policy/kỳ bootstrap bằng job/operator manifest riêng, không trigger tự tạo org/branch policy.

Đề xuất cutover:
1. Preflight + backup/restore drill + approve release; deploy binary tương thích expand nhưng chưa nhận ghi.
2. Ingress maintenance, dừng mọi writer job/CLI. Transaction quản trị lấy schema control FOR UPDATE và đổi MAINTENANCE; chờ writer SHARE holders drain. Nếu binary cũ chưa có control lock thì inventory connections và kill/revoke đúng principal sau drain đã duyệt.
3. Final tail backfill, invariant/checksum, legacy markers; bootstrap manifest (guards/policies/current + next period) và compatibility check.
4. Apply contract DDL; tạo toàn bộ trigger fences sau backfill. Control MAINTENANCE nên header INSERT fail closed; không kích hoạt immutable UPDATE trigger trước backfill xong.
5. Revoke principal writer cũ, đóng các connection cũ, không giữ credential cũ trên instance. Kiểm exact grants và test binary cũ bị chặn trên disposable.
6. Kiểm new binary readiness/schema epoch/query paths, read-only parity. Một transaction chuyển required epoch, schema version, reader basis, mode ENFORCED theo expected control version. Quyền cập nhật control chỉ operator, không runtime.
7. Mở traffic từng instance, quan sát; import/combined/AI pipeline vẫn giữ nguyên. Rollout không được để writer epoch cũ và mới đều được chấp nhận khi đã ENFORCED.

Control shared lock là giao thức A1, không bảo vệ khỏi binary cũ không tuân thủ; trigger metadata/epoch + credential fence là bắt buộc. Đổi epoch không làm rollback được DDL hay posted documents.

## 6. Recovery matrix

| Điểm thất bại | Việc làm sau duyệt | Điều cấm |
|---|---|---|
| Expand partial DDL | Stop, inspect pre/post fingerprints, resume đúng step hoặc forward-fix | Chạy lại toàn file CREATE/ALTER một cách mù quáng |
| Backfill chunk | Tra checkpoint/chunk receipt, kiểm expected raw timestamp và invariant, resume | Đổi created_at, overwrite metadata khác hoặc gán today cho legacy |
| Bootstrap thiếu/khác manifest | Giữ maintenance/fail closed, đối soát source policy/actor | Auto mở kỳ, tạo OWNER ẩn hoặc gán policy tùy ý |
| Contract/trigger fail | Giữ maintenance, xem constraint vi phạm/drift, sửa release step mới | Tắt foreign_key_checks/check constraints để “cho qua” |
| New reader sai, writer mới chưa mở | Đổi read basis về RECORDED_TIME sau parity/approval | Rollback binary writer cũ sau fence |
| Đã có writer epoch mới | Giữ metadata/receipt/audit, forward-fix; có thể rollback reader riêng | Xóa chứng từ/receipt để retry, hạ epoch |
| Mất Primary trong DDL/DML | UNKNOWN, freeze, runbook fence/reconcile; chọn đúng authority | Auto nối Replica rồi coi migration/receipt đã tồn tại |
| Data disaster | Restore backup vào instance khác, PITR, so invariants, sign-off đổi endpoint | Restore đè live hoặc coi Replica là backup |

RPO/RTO và địa điểm backup chưa được nghiệm thu. A0 không backup/dump/restore hay cấp account.

## 7. Acceptance của runner tương lai

Native disposable tests phải cover semicolons trong literal/comment/BEGIN END, trigger có nhiều câu, checkpoint crash trước/sau DDL, checksum edit, partially applied schema, stopped connection/advisory lock loss, mismatched UUID/schema/grants, epoch incompatible, backfill ACK loss và final tail race. Chưa triển khai parser/ledger/runner/harness trong A0; tất cả là tiêu chí A1/A2 sau approval.
