# A2.0 — Review RC1, phase plan và recovery

06/11/2026 — **không thực thi SQL hoặc runner; đây không phải run script.**
[Báo cáo](../P1_4_A2_0_READINESS_REVIEW_2026-11-06.md), [plan JSON](release-plan.review.json).

## 1. RC1 được bảo toàn

31 step records: expand8, contract4 (trong đó CT_SCHEMA_VERSION manual), fences19; 30 manual templates tách riêng. Digest logic91d0ccd1e3f6c495326a556cc967414ed1981ba380e763b696412a185f7b4cb1 và SHA256 file70c9ec5f4ad5d7d4d6abac7911fd41eb12aaadd0b0724350a9dc9d45cf785974 khớp; rebuild từ A0 cho cùng digest.

Tất cả31 step.sha256 khớp. 31 beforeFingerprint=null,31 afterFingerprint=null,31 tables=[]; mysqlExact/sqlMode/baselineFingerprint/rendering chưa bind. Synthetic rendering chỉ chứng minh thay token và conservative parse, không kiểm tồn tại collation/DDL syntax/native privileges.

A0 sentinel giữ nguyên; RC1 không sửa dù review có findings. Gói tiếp theo phải tạo RC2/release mới, không ghi đè artifact cũ hoặc sửa manifest A1 để che thay đổi.

## 2. Các lỗ hổng DAG/runner cần đóng

- Linear dependency EX_AUDIT → CT_HEADER thiếu bootstrap/backfill/maintenance evidence; graph acyclic không có nghĩa safe cutover.
- CT_SCHEMA_VERSION manual luôn bị throw trước checkpoint handling. FN_HEADER_INSERT phụ thuộc step này: mark VERIFIED giả không giải quyết được check và không là quy trình được phép.
- manualTemplates có CO_LOCK_CONTROL/CO_ENTER_MAINTENANCE/CO_ACTIVATE/CO_READ_BASIS_RECOVERY nhưng không có typed transaction grouping, expected affectedRows hoặc post-data predicates.
- Schema fingerprint không chứng minh policy pointer/kỳ OPEN/live_revision/marker count/chunk commit/expected control version. Bổ sung data predicates và digest manifest.
- Baseline001/002 chưa là executable phase trong RC1. Các SQL cũ không có marker theo parser mới và runner cũ hướng retail_app: phải đóng gói baseline release riêng từ source đã hash, không chạy runner cũ trong disposable.
- Early VERIFIED skip phải có release/phase final fingerprint để phát hiện drift xảy ra sau verified. So postcondition mỗi step cũ sau các ALTER sau có thể sai: dùng phase-final/schema snapshot có version, không đòi fingerprint trung gian vẫn giống.
- inspect() hiện thiếu FK action rules và một số index/trigger security metadata. Cần checksum source + actual SHOW CREATE/canonical schema, không chỉ tên objects.

## 3. Typed phase choreography đề xuất

Mọi phase có approval scope, target identity, source/release digest, precondition, postcondition và stop rule. Không lấy giá trị thật từ production credential; dùng metadata operator cung cấp và disposable inventory sau khi được phép.

| Phase | Step group dự kiến | Precondition | Postcondition/evidence |
|---|---|---|---|
| P00 Provision/identity (ngoài runner release) | Instance init, schema/accounts/secrets/network mới | Approval tài nguyên+init riêng; fresh datadir/no production mounts | Approved image/UUID/port/TLS/account profiles, forbidden UUID proof; chưa có app data |
| P01 Baseline | Packaged001_auth/002_operations + baseline migration ledger theo review | Exact empty test schema, expected engine/collation/mode, schema identity allowlist | SHOW CREATE fingerprints001/002, sources digests, schema_migrations baseline; không .env/old runner |
| P02 Expand | EX_CONTROL→EX_POLICY→EX_GUARD→EX_PERIOD→EX_HEADER→EX_RECEIPT→EX_FINALIZATION→EX_AUDIT | Baseline invariant sạch, source+target hashes, native grammar approved | Additive schema only; UTC created_at/economic fields giữ nguyên |
| P03 Bootstrap/backfill sơ bộ | BF_CONTROL_SEED; policy/guard/current+next period seed; BF page/lock/derive chunks | Bootstrap manifest actor/service/policy/range rõ; controlEXPAND; writer mới chưa nhận ghi | Control/policy/period hợp lệ, partial backfill/checkpoints; no receipt giả; import/combined flagsfalse |
| P04 Maintenance barrier | CO_LOCK_CONTROL + CO_ENTER_MAINTENANCE trong TX; stop test ingress/drain/fence legacy test principal | Inventory đúng hai test PIDs/CLI/jobs; real runtime untouched | ControlMAINTENANCE và expected version; test writers drain; old bypass path denied; không chỉ env flag |
| P05 Final-tail/reconciliation | Capture final high watermark, remaining BF chunks, BF_LEGACY_FINALIZATION | Không writer bypass; original data digest known | Zero missing metadata/legacy markers, no movement duplicates/branch mismatch, sums/counts/original timestamps/hash parity |
| P06 Contract | CT_HEADER→CT_MOVEMENT_IDENTITY→CT_DATE_INDEX | Verified P05 + maintenance fence vẫn giữ, index choice reviewed | Lineage/CHECK/FK/UNIQUE/index đúng; no NULL required; originals unchanged |
| P07 Control attestation | CT_SCHEMA_VERSION typed TX, expected version/data CAS | ControlMAINTENANCE/schema1, verified P06 | schema2, version+1 exactly once; reader chưa đổi; journal ghi data receipt thật |
| P08 Fences | FN_HEADER_INSERT→FN_ITEM_INSERT→FN_MOVEMENT_INSERT→FN_RECEIPT_INSERT→FN_FINALIZATION_INSERT +14IMM triggers | schema2/MAINTENANCE; legacy markers đã có | Trigger definitions/definer/security/grants đúng; old writer metadata/epoch rejected in native tests |
| P09 Pre-cutover verify | Full phase fingerprint, invariants, P1.3/legacy parity, privilege negative tests | All phases verified, no partialDDL/UNKNOWN/unresolved drift | Evidence bundle signed/ref approval; test app readiness schema/epoch; chưa mở ingress |
| P10 Disposable cutover | CO_LOCK_CONTROL + CO_ACTIVATE typed TX | Final approval native test-only, expected control version, epoch1/capability exact | ENFORCED + BUSINESS_DATE + version increment atomically, then open test ingress only |
| P11 Native cases/evidence | Two Backend tests + faults, matrix assertions | P10 proof, bounded test run approval | Correctness report, throughput pilot nếu được duyệt; no production deployment |

“Expand → bootstrap/backfill → maintenance → contract → fences → cutover” có **final-tail** sau maintenance; không bỏ final pass chỉ vì online backfill từng đủ tại một thời điểm. Đóng bootstrap policy/kỳ theo manifest hiện tại không tạo policy/accepted_at/revision giả cho legacy. Revision legacyNULL, epoch0 chỉ LEGACY_UNKNOWN.

Nếu fresh disposable không có legacy writer traffic, vẫn cần synthetic baseline fixture trước expand để kiểm backfill. Legacy racing-tail/fence test cần service hoặc adapter riêng có contract cũ dưới dedicated config; gọi vài câu SQL tương tự không thay bằng chứng binary/API cũ. Chưa tạo fixture/launcher trong A2.0.

## 4. Pre/postconditions phải được bind

Schema predicate: engine, default/column charset+collation, ENUM values/order, types/precision/default/nullability, indexes (order/prefix/unique/visibility/type), FK referenced columns **và actions**, CHECK enforced/expression, trigger timing/event/order/definer/body/sql_mode/charset, relevant grants. Canonicalize bằng version-specific rules, giữ raw SHOW CREATE để audit. Không bind fingerprint từ synthetic render.

Data predicate: counts/no orphan, economic sums DECIMAL, delta/balance reconciliation, metadata coverage, marker/receipt coverage theo lineage, control mode/version/epoch/basis, guard/policy effective pointer, period shape/OPEN/flags, high-watermark/chunk receipt and input/output hashes. Không dùng raw IDs MAX làm revision, không SELECT Replica.

Parameters: bind ?, schema/ids/types/bounds và expected affectedRows; chỉ metadata allowlisted mới được render identifiers. Phase data changes phải dùng transaction trên một connection, không tách UPDATE control khỏi receipt/checkpoint evidence.

Native authorizer không thể dựa một field nativeVerified=true tự chỉnh; approval phải bind target tuple+UUID+releaseDigest+action scope+expiry+operator ref và evidence. Phiên bản release đổi → fingerprint/approval mới; không tự lấy dữ liệu A2 để mở production.

## 5. Journal/checkpoint và recovery

Đề xuất namespace:
operator-journal/<target-id-hash>/<schema>/<release-digest>/<run-id>/...
path literal đã resolve, directory operator-owned, ACL Windows hoặc chmod phù hợp, không symlink/junction, không dùng chung runtime. Local process lock/journal file lock cần thêm bên cạnh DB advisory lock vì DB lock theo schema không bảo vệ hai target cùng ghi một file.

GET_LOCK name có độ dài hợp lệ, hash schema/UUID nếu cần; cùng dedicated connection, không tự reconnect. Verify ownership trước/sau step; mất authority/lock thì UNKNOWN. Không coi advisory lock là fence old API writer.

File journal A1 chỉ fsync file trước rename. Trước native cần review atomic replace/parent-dir durability trên OS, stale tmp files, corruption/partial JSON, disk full, mất quyền, concurrent writers và backup. Không overwrite row VERIFIED/checksum cũ; mọi repair phải audit action/evidence. SQL-ledger alternative cần thiết kế bootstrap riêng và phê duyệt DDL, chưa tạo.

| Tình huống | Xử lý đề xuất sau approval | Tuyệt đối không |
|---|---|---|
| DDL xong nhưng checkpoint chưa VERIFIED | Inspect actual postpredicate, verify, ghi recovered evidence | Execute lại ALTER/CREATE mù quáng |
| DDL chưa chạy, prepredicate còn nguyên | Retry exact bytes theo approval sau inspect | Dùng IF NOT EXISTS để bỏ qua drift |
| Không khớp cả pre/post | UNKNOWN, dừng chain, forward-fix release mới | Tắt FK/CHECK hoặc xóa dữ liệu để qua gate |
| Chunk DML COMMIT mất ACK | Tra chunk receipt/input/output digest cùng target; check exact updated metadata | Suy từ NULL metadata rằng mọi audit/checksum đã commit |
| Writer COMMIT mất ACK | Receipt Primary cùng request_key, UNKNOWN khi authority không rõ | Key mới, duplicate delta, replay qua server khác UUID |
| Journal mất/truncated | Quarantine bản lỗi, khôi phục có evidence/schema+data reconcile | Tự dựng VERIFIED từ tên table |
| Read basis sai sau contract | Maintenance, parity, recovery CO_READ_BASIS_RECOVERY có expected version | Re-enable writer binary cũ/hạ epoch |
| Post-cutover incident | Close test ingress, preserve data/evidence, forward-fix hoặc restore instance riêng theo runbook | DELETE docs/receipts để “rollback”; reset volume có UNKNOWN chưa giải quyết |

Backfill chunk checkpoint phải atomic với DML/chunk receipt trong DB hoặc có receipt bền để reconcile nếu journal local ở transaction khác. A1 chưa có backfill worker/chunk-receipt implementation; cần review riêng trước thực hiện BF templates. Template không phải worker đã hoàn chỉnh.

DDL có implicit commit; không có rollback nguyên gói. Snapshot/backup disposable trước destructive fault test giữ bên ngoài volume test, có synthetic-only manifest. Không backup/dump real DB ở A2.0.

Nguồn: [MySQL implicit commit](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html), [FK constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html).

## 6. Quyết định A2.0

Choreography semantic đã được chuẩn bị, **chưa biên dịch thành release thực thi**. RC1 cần một gói hardening+RC2 sau approval để dùng typed phases, full gate và journal/data receipts. Không cung cấp lệnh apply và không dùng sửa checksum/manual VERIFIED như cách vượt chặn.

