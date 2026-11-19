# P1.4 A2.0-H — Hardening source và RC2

06/11/2026 — **SOURCE/MOCK ONLY. A2.1: NO-GO.**

Đã tạo nhánh module cô lập [backend/src/p14/rc2](../backend/src/p14/rc2) và release [p14-a20h-rc2](../backend/releases/p14-a20h-rc2/README.md). Không sửa entry point A1 hoặc artifact lịch sử: giữ nguyên RC1/A0/A1/A2.0 để đối chiếu. Mọi file của lượt này là file mới, liệt kê kèm SHA256 trong [manifest](P1_4_A2_0_H_MANIFEST_2026-11-06.md).

## 1. Kết quả theo finding

“MOCK_VERIFIED” chỉ xác nhận hành vi qua fake driver/trace/oracle, không là nghiệm thu MySQL. Không finding nào được ghi native PASS.

| Finding | Thay đổi / file RC2 | Bằng chứng hiện tại | Điểm còn thiếu / trạng thái |
|---|---|---|---|
| R01 | disposable.beginReadCommitted: verify trước, SET SESSION lock timeout, SET SESSION RC rồi raw BEGIN liền nhau; writer dùng protocol đó | Raw-driver trace mặc định fake RR, integration transactionAttempt; không có query giữa SET RC và BEGIN | MOCK_VERIFIED / NATIVE_REQUIRED: quan sát isolation transaction thật trên server mặc định RR, driver/session reuse; không ép default RC để che lỗi |
| R02 | disposable + contracts: exact numeric host/socket peer/port/UUID, CURRENT_USER đầy đủ user@host và USER origin; TLS chain/IP SAN/fingerprint hoặc loopback exception, mode/vendor/version/charset/collation/engine/ENUM | Mismatch tests cho account host, version/modes/charset/collations, inventories; không gọi business SQL sau reject | MOCK_VERIFIED / NATIVE_REQUIRED: UUID/TLS/collation thực chưa được cấp; test fixture không là inventory |
| R03 | migration + candidate: DAG phase/step, typed DDL/TX/BACKFILL_CHUNK/BARRIER/VERIFY, CT_SCHEMA_VERSION là TX ở P07 trước P08 | Graph57 steps/12 phases; digest, thiếu CT/dependency/manual bypass bị từ chối; Ed25519 attestation + independent probe | PARTIAL / BLOCKED_BINDING: phải hoàn thiện DATA queries, parameter/affected-row contracts và pre/post fingerprints trên target được duyệt; không tự VERIFIED |
| R04 | fingerprints: engine/columns/default/precision/generated, FK keys/actions, CHECK enforcement, index visibility/expression, trigger order/definer/mode/charset; source digests; baseline + phase-final recheck | Semantic hash mutation tests, source tamper reject trước adapter; VERIFIED step vẫn phát hiện final drift | MOCK_VERIFIED / NATIVE_REQUIRED: metadata normalization/visibility/schema thật và phase-final exact hashes |
| R05 | grants: exact effective policy theo migrator/backend/control/seed/observer, column privilege parser; reject role/global/grant-option/thiếu hoặc thừa quyền | Five-principal tests, column comma syntax, balance INSERT regression; Backend không UPDATE/DELETE chứng từ/movement | MOCK_VERIFIED / NATIVE_REQUIRED: SHOW GRANTS output và locking read/trigger effective rights thực; không tự cấp grants |
| R06 | journal + migration: namespace target/schema/release/run, exclusive file owner, DB lock target/schema xuyên run/release, checksum/fsync/rename, immutable VERIFIED, TX receipt cùng transaction | Temp filesystem faults, corrupt/ownership/cross-run lock tests; DDL ACK loss và TX receipt recovery; primary error không bị cleanup che | PARTIAL / NATIVE_REQUIRED: power loss/Windows ACL/directory fsync/DB crash; stale owner.lock cần operator recovery riêng, chưa có công cụ auto-repair và không tự xóa lock |
| R07 | disposable generation/closed checks trước/sau mọi await, terminal cancellation, exclusive connection; writer deadline/late acquire destroy/UNKNOWN commit | Verify bị treo rồi hoàn tất sau destroy không gửi SQL tiếp; concurrent use/dirty release/acquire timeout/rollback tests | MOCK_VERIFIED / NATIVE_REQUIRED: mysql2/network/kill thật và thời gian InnoDB giải phóng lock |
| R08 | immutable snapshot config/permit/attestations, deep freeze, private capability WeakMap; denylist kiểm lại mỗi verify và SQL admission | Caller mutation không đổi target; fake pool tag bị chặn; mismatch không fallback | MOCK_VERIFIED / NATIVE_REQUIRED: deployment ACL/secret isolation/operator trust thực; permit là authority được inject rõ ràng, không env toggle |
| R09 | launcher/worker/router/admin/writer: hai worker account/port/PID riêng, IPC secret, signed exact native launch plan; test JWT không tin role claim; lifecycle admission/drain | Fake spawn descriptors/PID collision cleanup, auth/tenant/default-deny, inert worker import; không fork/listen native | PARTIAL / NATIVE_REQUIRED: chưa chạy hai PID, coordinator/barrier đầy đủ, fixtures/read adapters và native fault matrix còn thiếu |
| R10 | Không đổi snapshot hạ tầng A2.0; binding.review.json luôn REVIEW_ONLY | Không provision/kết nối hoặc giả metadata native | BLOCKED: host/engine/RAM/quota/network/TLS/UUID/account/approval chưa có; A2.1 vẫn NO-GO |

Không sửa calendar/hash/business contract legacy: RC2 tái sử dụng các pure module/repository A1 có digest pin, thay entry writer/gate/migration/router/admin riêng. Isolation RC, lock rank và tính đúng InnoDB vẫn là phương án cần chứng minh native. Transaction atomicity/idempotency/tenant/revoke/kỳ được kiểm qua oracle tuần tự trong RAM, không gọi đó là concurrency proof MySQL.

## 2. File bàn giao và RC1 → RC2

- 13 source files mới dưới backend/src/p14/rc2: contracts, grants, disposable, fingerprints, journal, migration, writer, administration, router, candidate, candidate-cli, launcher, worker.
- 6 test/support files dưới backend/test/p14/rc2: fixtures và gate/migration/writer/launcher/controls tests. No-network guard A1 vẫn nguyên vẹn.
- Release gồm candidate.json, README.md, DIFF_AND_CONTRACT.md và binding.review.json. Choreography/pre/postcondition/dependency/recovery chi tiết ở [DIFF_AND_CONTRACT](../backend/releases/p14-a20h-rc2/DIFF_AND_CONTRACT.md).
- Báo cáo này, STATIC_EVIDENCE.json của RC2 và manifest mới. Manifest ghi từng file, hash exact bytes và loại bằng chứng.

RC1 giữ digest 91d0ccd1e3f6c495326a556cc967414ed1981ba380e763b696412a185f7b4cb1. RC2 digest e3184de4ff673a0351cdf721eeb19df3a837912cfbf7ee9fab3ff2bc49ca5071, 12 phases/57 steps, CANDIDATE_NOT_EXECUTABLE, nativeVerified=false. CLI chỉ inspect/write JSON offline, không có apply. Null fingerprint và unbound SQL tokens/parameters là blocker có chủ ý; không thay bằng metadata synthetic để cho chạy.

RC2 còn thiếu executable binding, không phải release “sẵn chạy chỉ cần đổi flag”. Seed/fixture/bootstrap approval không ngầm bao gồm trong phase metadata. Legacy source SQL vẫn REVIEW_ONLY. Migration runner cũ không được dùng cho RC2.

## 3. Kiểm thử đã chạy

| Suite | PASS | FAIL | Loại bằng chứng |
|---|---:|---:|---|
| RC2 controls | 9 | 0 | Lifecycle/router/admin mock |
| RC2 gate | 24 | 0 | Fake metadata/grants/raw trace/deadline |
| RC2 migration | 17 | 0 | Fake adapter + filesystem journal tạm cô lập |
| RC2 writer | 28 | 0 | Repository/service + oracle RAM A1 |
| RC2 launcher/candidate | 9 | 0 | Mock descriptors/JWT/offline graph; không spawn native |
| A1 original | 102 | 0 | Pure/mock, file cũ không sửa |
| Config/origins/period/business-calendar/read-snapshot | 84 | 0 | Pure/mock regression P0/P1.1–P1.3 phù hợp |
| Document-list integration + bootstrap-owner | 71 | 0 | SQLite HTTP fixtures + mock; không MySQL |
| **Tổng final suites** | **344** | **0** | Không cộng lặp các lần debug/re-run |

Các suite được chạy với preload test/p14/no-network.js; dotenv/config bị thay bằng module rỗng. SQLite suite chỉ được mở HTTP loopback ephemeral do chính test sở hữu; không được gọi endpoint MySQL hay dịch vụ đang chạy. Không dùng RUN_DB_TESTS=1. SQL trong fake driver chỉ là chuỗi, không gửi server MySQL.

13 source RC2 qua node --check. Offline candidate build/inspect deterministic, không SQL. Đã kiểm 13 entry A0, 20 entry A1 và 8 entry A2.0: không mismatch; bảy SQL draft còn REVIEW_ONLY. Không sửa manifest lịch sử hoặc RC1. Không có Git diff đáng tin ở workspace này; phạm vi file mới được chứng minh bằng artifact manifest, không quảng cáo git clean.

Lỗi attestation variable và BOM reader phát hiện khi kiểm thử đã sửa trước kết quả final. Không có test fail bị bỏ qua; suite native/load/replication/failover đều **NOT RUN**, không nằm trong 344 PASS. Không chạy frontend/browser/model inference vì không thay các thành phần đó.

Lệnh kiểm lại RC2 từ backend (không native):
```text
node --import ./test/p14/no-network.js --test test/p14/rc2/controls.test.js test/p14/rc2/gate.test.js test/p14/rc2/migration.test.js test/p14/rc2/writer.test.js test/p14/rc2/launcher.test.js
node --import ./test/p14/no-network.js src/p14/rc2/candidate-cli.js --inspect
```

## 4. Giới hạn và recovery phải giữ

SESSION RC loại bỏ lỗi next-only SET bị query verification tiêu thụ, nhưng trace không chứng minh active isolation. Full verification trước mỗi SQL tăng metadata overhead, chưa đo throughput/latency; không bỏ gate trong run nghiệm thu để tăng RPS.

DB advisory lock chỉ điều phối client hợp tác; DBA ngoài protocol vẫn cần fence/quyền/operational control. Journal file-fsync không được gọi là bảo đảm mất điện; ownership stale sau crash giữ trạng thái chặn. Receipt transaction mất do restore/failover cũng không được suy ra “chưa từng commit”.

DDL có thể đã commit dù mất ACK. Không rollback toàn release bằng transaction, không tự DROP hoặc sửa checksum; observe/reconcile exact before/after/receipt, ký retry cần thiết hoặc forward-fix được duyệt. COMMIT UNKNOWN giữ cùng request_key và tra authority; không tạo key mới.

Các factories mới không tự bảo vệ trước người có quyền chỉnh source/giả operator permit; OS/network/secret isolation và approval binding là ranh giới bắt buộc ở môi trường thật. TLS validation và loopback policy chưa được nghiệm thu native. Không dùng service MySQL97 hiện có hoặc tài khoản production để “kiểm nhanh”.

## 5. Điều kiện GO / NO-GO trước A2.1

**GO:** review source RC2, pure/mock/static tests và artifact preparation trong gói này.

**NO-GO:** provisioning/kết nối DB/native DDL/DML/seed/load/two-Backend run hoặc runtime activation hiện tại.

Cần phê duyệt và hoàn thiện riêng:
1. Host/instance hoàn toàn độc lập, engine/version/image digest, RAM/disk/quota và network deny production/research. Snapshot RAM/Docker của A2.0 là dữ liệu cũ, chưa đo lại hay cấp phát.
2. Quyền inventory read-only trước; cung cấp UUID thật denylist và test UUID/port/TLS/schema, CURRENT_USER/grants thực; secret delivery qua kho riêng, không qua chat.
3. Bind release mới từ metadata/fixture được duyệt: render tokens, typed parameter values, affected-row counts, DATA predicate queries, complete entry/before/after/final fingerprints và phase inventory states. Không bind đè candidate lịch sử.
4. Chốt journal ACL/durability/stale-lock operator recovery, operator public key, signed authority/evidence, source/release digests và stage-specific permits.
5. Hoàn thiện synthetic fixture, two-PID launcher orchestration/barriers/observer và test read adapters. Native N01–N22 ở [matrix A2.0](p1_4_a20/CONCURRENCY_TEST_MATRIX.md) cần kế hoạch thực thi cụ thể; không gọi launcher mock là native-ready harness.
6. Chạy native active RC với default RR, grants/trigger/FK/collation, rollback/deadlock/revoke/period/legacy-parity và crash/UNKNOWN trước khi xét load.
7. Sau correctness mới pilot và duyệt offered rate/accepted-throughput/rejection budget/SLO; 100/500/1.000 là mức tải thử, chưa đạt. Không có kết luận capacity.

## 6. Phạm vi kết thúc

Không kết nối database thật hoặc chạy SQL server nào; không DDL/migration/backfill/seed/native write tests. Không đọc credential production, không tạo container/VM/MySQL hoặc process Backend native. Chỉ test SQLite/mock/pure và journal file trong thư mục tạm test.

Không sửa/mount runtime app.js/server.js/ledger.js, không sửa database/account/config production; không đổi AI pipeline/weights/research; không LB/Replica/Redis/AI queue/archive B/hồi tố kho. Historical A0/A1/RC1/A2.0 giữ nguyên.

**DỪNG sau A2.0-H. Chờ phê duyệt bước tiếp theo; không tự kích hoạt RC2 hoặc chuyển sang A2.1.**

