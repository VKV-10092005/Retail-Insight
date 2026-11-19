# P1.4 A0 — Bộ SQL migration dự thảo để review

06/11/2026 — **KHÔNG THỰC THI; KHÔNG PHẢI MIGRATION PHÁT HÀNH.**

Nằm ngoài backend/src/db/migrations để runner hiện tại không tự phát hiện. Mỗi file có statement REVIEW_ONLY đầu tiên cố ý không hợp lệ: A0_REVIEW_ONLY_DO_NOT_EXECUTE. Không xóa sentinel trong draft để thử chạy. Release tương lai phải được tạo riêng sau approval, renderer/runner/harness native đã review, không copy trực tiếp vào migration dir.

## 1. Danh mục và dependency graph

| File | Nội dung | Gate / thứ tự |
|---|---|---|
| [00_preflight.draft.sql](00_preflight.draft.sql) | Identity, engine/columns/index/FK/CHECK/trigger và integrity queries | Trước mọi ghi; metadata thực tế phải được operator xác nhận |
| [10_expand.draft.sql](10_expand.draft.sql) | Control, policy, guard, monthly period, header metadata, receipt, marker, audit | Baseline001/002 sạch; đúng metadata; từng statement checkpoint |
| [20_backfill_bootstrap.draft.sql](20_backfill_bootstrap.draft.sql) | Prepared templates seed control/policy/guard/kỳ, IANA metadata và marker legacy | Manifest riêng, repeated bounded chunks; không phải SQL tự tính IANA |
| [30_contract.draft.sql](30_contract.draft.sql) | NOT NULL/lineage checks, movement branch FK/unique, candidate DATE index | Sau final tail/markers + maintenance; không thay field cũ |
| [40_write_fences.draft.sql](40_write_fences.draft.sql) | Header epoch/period/policy fence, item/movement/receipt và finalize checks | Sau backfill/contract, control MAINTENANCE |
| [41_immutability.draft.sql](41_immutability.draft.sql) | UPDATE/DELETE guards header/item/movement/receipt/marker/audit/policy | Sau mọi backfill/legacy marker; không cài sớm |
| [50_cutover.draft.sql](50_cutover.draft.sql) | Control state transition templates/recovery alternative | Là choreography nhiều mốc, **không chạy cả file tuần tự** |
| [MANIFEST.md](MANIFEST.md) | SHA-256 bytes draft và source baseline | Static artifact manifest, không schema_migrations DB |

Thứ tự thực tế: preflight → expand → seed control/bootstrap + backfill sơ bộ → **CO_ENTER_MAINTENANCE trong50 + drain/old-principal fence** → final tail/backfill markers → contract30 → fences40/immutability41 → verify readiness/parity → **CO_ACTIVATE trong50**. CO_READ_BASIS_RECOVERY là nhánh lỗi thay thế, không là bước sau activation.

Control seed một lần trong EXPAND. Source code A1 tương thích expand phải được deploy theo kế hoạch; bundle này không cung cấp source mới nên hiện không được phép đi vào bước execution.

## 2. Render/bind và compatibility

- {{TYPE_CHARSET}}/{{TYPE_COLLATION}} lấy từ stock_documents.type; {{KEY_CHARSET}}/{{KEY_COLLATION}} từ stock_documents.request_key. Renderer chỉ chấp nhận tên metadata trong allowlist MySQL, quote identifier đúng, không nhận SQL từ client/env. Byte-equivalence/ENUM order/collation/pad semantics phải được native test.
- Không đổi request_key VARCHAR(80) hoặc payload_hash CHAR(64) cũ. Receipt type ENUM('RECEIPT','SALE') đúng thứ tự khai báo legacy; schema drift khác thứ tự/type phải dừng và tạo release mới, không ép chuyển.
- Bảng mới mặc định utf8mb4_0900_ai_ci, identifier/version labels ASCII binary; field FK ký tự riêng render theo legacy. Không CONVERT TABLE cũ. Xác minh server≥8.0.16, InnoDB, collation có thật, sql_mode strict, key byte limit và actual DDL hỗ trợ; chưa kiểm native.
- ? là prepared parameter, schema/ordering ghi cạnh statement. Không là biến phiên tự đặt để bypass fence. Không bind identifiers qua ?.
- Mỗi -- @statement ID một top-level statement; CREATE TRIGGER giữ nguyên BEGIN/END/dấu ;. Runner cũ split(';') bị cấm.
- DDL không bọc trong transaction giả; DML templates cần explicit transaction của runner/service tương lai. Không có SET GLOBAL, CREATE DATABASE, GRANT, DROP, TRUNCATE, sửa timestamp cũ hay câu lệnh triển khai LB/replication/Redis/AI.

## 3. Schema decisions và enforcement map

| Invariant | DB | Service / runner cần thêm |
|---|---|---|
| Tenant/branch đúng | Composite FK numeric trên guard/policy/period/header/receipt/audit/marker/movement | Authorize actor/org/branch trên Primary; FK không là ACL |
| Policy/kỳ | Monthly CHECK + unique start, active pointer FK3cột; header period/policy FK3cột | effective pointer dưới guard, period range/OPEN và clock IANA |
| Header mới vs legacy | CT_HEADER explicit lineage; UNIQUE native branch revision (legacy NULL) | No forged legacy insert sau fence; epoch0 là LEGACY_UNKNOWN |
| Idempotency | Header unique cũ + receipt unique org/type/key, doc-specific FK | Hash version/legacy normalizer, replay rights và UNKNOWN handling |
| Posted bất biến | Triggers no update/delete và append check sau marker | Receipt/audit/finalization cùng transaction; không deferred commit hook |
| Kho | Balance PK/CHECK legacy, movement unique và FK branch, sign trigger | Row locks, price/total/overflow/delta và reconciliation |
| UTC / business_date | UTC session fence, accepted↔created_at microsecond interval; DATE CHECK | Pin IANA, take accepted after locks; không đổi created_at cũ |
| Audit | FK actor/org/branch/policy, USER/SERVICE shape, append-only | Redaction/real actor, success same transaction, denied event separate |
| Period policy_id | FK policy cùng branch | Là policy tại tạo kỳ, không bắt mọi doc trong kỳ dùng policy đó nếu pointer đổi; doc giữ active policy thực |

active_policy_id guard NULL ở expand/provision để tránh circular bootstrap; readiness và posting fail closed khi NULL, không ngầm OPEN. archive_revision tồn tại cho compatibility B, SQL A không tạo archive/staging/queue/snapshot hoặc bật flags.

Legacy header có policy/period/accepted/revision NULL có chủ ý, không contract NOT NULL các field đó cho legacy. business_date/timezone/date_policy_version/origin/epoch bắt buộc sau contract. Có thể legacy doc tất cả cùng revision NULL; không dùng revision0 dưới unique để tạo collision.

Không bật trigger finalization trước tạo LEGACY markers: trigger chỉ nhận NATIVE sau cutover. Triggers không kiểm đủ chống arbitrary direct DML; runtime grants/transaction protocol là assumption cần duyệt, stored procedure hardening là nhánh riêng.

## 4. Những việc phải hoàn tất ngoài SQL trước release

Live schema/grants/version inventory, backup/restore drill, operator/bootstrap manifest thật; native syntax/engine/FK/CHECK/trigger/parser tests; compare schema pre/post fingerprints; original data digest, P1.3 parity; old-writer credential fence; runtime principal grants và compatibility readiness. Không có seed actor/org IDs/period thật được điền trong draft này.

[Index có sẵn và thay đổi](../P1_4_A0_DESIGN_REVIEW_2026-11-06.md), [runner/recovery](../P1_4_A0_RUNNER_RECOVERY_2026-11-06.md), [transaction](../P1_4_A0_TRANSACTION_CONCURRENCY_2026-11-06.md), [test harness](../P1_4_A0_TEST_DESIGN_2026-11-06.md).

Chỉ rà soát DDL B trong báo cáo; B0 phải hoàn thiện full SQL archive riêng sau duyệt source/approval/limits. Bộ này là migration draft **giai đoạn A**, không tự nhận là migration B hoàn chỉnh.
