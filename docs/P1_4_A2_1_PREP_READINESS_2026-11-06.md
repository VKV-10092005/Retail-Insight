# P1.4 A2.1-PREP ? Readiness native MySQL testing

06/11/2026 ? **SOURCE/OFFLINE ONLY. Native execution: NO-GO.**

?? b? sung source harness, fixture, observer, SQL/HTTP assertions v? quy tr?nh binding trong [native-prep](../backend/test/p14/native-prep/README.md). Gi? nguy?n RC2 v? to?n b? artifact A0/A1/A2.0/A2.0-H; kh?ng t?o RC3. Danh s?ch file v? SHA256 n?m trong [manifest PREP](P1_4_A2_1_PREP_MANIFEST_2026-11-06.md).

## 1. Ki?m k? ch? ??c v? c?u h?nh ?? xu?t

M?y hi?n c?8.419.024.896bytes RAM (~7,84GiB), tr?ng1.527.287.808bytes (~1,42GiB),8CPU logic, ?C tr?ng142.756.380.672bytes (~132,95GiB). Kh?ng th?y listener TCP13316?13319 t?i th?i ?i?m ki?m tra, kh?ng reserve c?ng.

Kh?ng t?m th?y Docker/Podman trong PATH ho?c Docker executable ? ???ng d?n Program Files ti?u chu?n; c? wsl.exe. Kh?ng g?i daemon, start WSL, c?i tool ho?c c?p ph?t. CIM b?o HypervisorPresent=true nh?ng VirtualizationFirmwareEnabled/SLAT=false; ??y kh?ng ?? ?? k?t lu?n WSL2/Docker readiness trong m?i tr??ng c? hypervisor. Kh?ng s?a BIOS/Windows features. MySQL97 Running ch? l? t?n service, kh?ng x?c nh?n phi?n b?n hay d?ng l?m target test.

?? xu?t **host/VM ri?ng4vCPU/8GiB/disk80GiB**, MySQL InnoDB single Primary test2CPU/2GiB, buffer pool512MiB, max_connections80; exact8.4patch/image digest/mode/collation c?n c?n duy?t. Hai Backend test127.0.0.1:13317/13318, MySQL private/loopback13316?3306, volume/schema/account ho?n to?n m?i, kh?ng mount .env/DB hi?n t?i. Budget45/80connections g?m reserve; ch?a l? capacity claim.

Chi ti?t v?10nh?m approval ? [DISPOSABLE_AND_APPROVALS](p1_4_a21_prep/DISPOSABLE_AND_APPROVALS.md). RAM/port l? snapshot trong l??t, c? th? thay ??i; kh?ng coi snapshot l? t?i nguy?n ?? c?p ph?t.

## 2. File t?o / s?a

Ch? t?o file m?i, kh?ng s?a file c? s?n tr??c PREP:

| Nh?m | File m?i / ch?c n?ng |
|---|---|
| Authority | authority.js: expiring signed target/release/run/action/plan capability, default-deny, kh?ng connector/env m?c ??nh |
| Coordinator | coordinator.js: IPC barrier theo run/case/participant/stage/attempt/sequence, deterministic release, timeout/abort/trace |
| Hai process | harness.js, worker.mjs: test app ri?ng, pool/account/port/PID t?ch bi?t, hook xuy?n IPC; kh?ng import runtime app/server/pool |
| Fixture | fixtures.js: deterministic org/branch/user/session/category/SKU/balance v? legacy header/items/movements; kh?ng user/research th?t |
| Inventory/binding | binding.js: inventory SELECT/SHOW plans, full-row DATA queries theo PK, per-branch bootstrap v? signed phase-capture review |
| Backfill/recovery | recipes.js: legacy chunks,0/1affected rows t??ng minh, markers kh?ng receipt gi?, recovery J01?J08 |
| Observer | observer.js: active transactions/lock edges theo connectionIDs, BigInt/DECIMAL economic oracle |
| Native scripts | scripts.js: guarded seed/migration/negative SQL/RC/row lock/deadlock/rollback/collation/HTTP oracle |
| Control | control.js: OWNER/session recheck, sorted user locks, revoke/disable/close-period c?ng audit; kh?ng m? role runtime |
| Scenarios/measurement | scenarios.js: signed test HTTP client, stock/idempotency/mixed/tenant/legacy/control races, hot/multi-branch workload v? throughput/latency summary |
| Grants | privileges.js: render proposal migrator/backend/control/seed/observer, kh?ng ch?y GRANT/CREATE USER |
| Offline evidence | prep.test.js v? README; docs runbook/config/inventory/report/evidence/manifest m?i |

T?n file source ??u n?m d??i backend/test/p14/native-prep. Kh?ng d?ng ???ng d?n n?y l?m runtime feature v? kh?ng copy SQL v?o runner c?.

## 3. M?c s?n s?ng v? k?t qu? ki?m th?

**Source harness ?? c? c?c th?nh ph?n ?i?u ph?i v? assertion ?? review/offline testing; ch?a ???c nghi?m thu end-to-end native.** Actual target, channels, bound release/predicates, observer visibility v? native rehearsal v?n BLOCKED/NATIVE_REQUIRED.

| Suite final | PASS | FAIL |
|---|---:|---:|
| PREP offline/mock m?i |26|0|
| RC2 mock/static regression |87|0|
| A1 original pure/mock |102|0|
| Config/origins/period/calendar/read-snapshot |84|0|
| SQLite HTTP/document-list + bootstrap mock |71|0|
| **T?ng** |**370**|**0**|

PREP final26PASS; c?c suite regression344PASS ?? ch?y l?i. T?ng370l? final distinct tests, kh?ng c?ng l?p run debug. C?c l?i c? ph?p/mock adapter ph?t hi?n trong qu? tr?nh chu?n b? ?? s?a tr??c final; kh?ng b? qua test fail. Source PREP qua node --check. Native matrix15cases v? recovery8cases ??u NOT_RUN; kh?ng n?m trong370PASS.

D?ng preload test/p14/no-network.js, kh?ng dotenv/config. SQLite regression ch? cho HTTP ephemeral do ch?nh test s? h?u; kh?ng k?t n?i DB/service th?t. Mock worker d?ng fake driver/listener/EventEmitter, kh?ng fork process native ho?c bind c?ng13317/13318.

C?c b?ng ch?ng m?i:
- Capability m?c ??nh t? ch?i tr??c connector/spawn; signature/action/plan/expiry binding; candidate kh?ng t? enabled.
- Barrier release/abort/deadline v? IPC listener cleanup; fake pair PID/account ri?ng; worker wires hook v?o test app qua injected adapters.
- Fixture c?ng seed/UTC t?o c?ng digest,2tenant/4branch/8users/4SKU m?i org m?c ??nh, stock1/10 v?3receipt legacy; legacy balance kh?p movements.
- Backend test auth v?n recheck DB; control service c? channel ri?ng, OWNER v? sorted user locks, audit c?ng transaction.
- RC script y?u c?u server/session kh?i ??uRR v? observer th?y activeRC. Session-only/RR evidence b? t? ch?i.
- Lock oracle ch? nh?n ??ng requesting/blocking connection pair, kh?ng m?t wait b?t k? trong schema ho?c sleep.
- DATA query plan SELECT full columns ORDER BY PK; reject identifier kh?ng h?p l?/thi?u PK; kh?ng d?ng generic DATA hash t? tham chi?u TX receipt.
- Seed/control m?t COMMIT ACK l? UNKNOWN; kh?ng t? xem l? rollback hay blind reseed/retry.
- Metrics t?ch offered/completed/accepted-new/replay/409/503, kh?ng t?nh retry th?nh giao d?ch kinh t? m?i.

## 4. Binding, DATA predicates v? migration

[Runbook](p1_4_a21_prep/NATIVE_EXECUTION_RUNBOOK.md) m? t? P00?P11 v? dependency RC2. Candidate RC2 v?n digest e3184de4ff673a0351cdf721eeb19df3a837912cfbf7ee9fab3ff2bc49ca5071, CANDIDATE_NOT_EXECUTABLE/nativeVerified=false,12phases/57steps; kh?ng thay checksum ho?c t?o candidate m?i.

Seed n?m sau expand/P02 tr??c bootstrap/P03, theo approval ri?ng; kh?ng ?n economic fixture trong DDL. Bootstrap g?m1control+4?policy/guard/period=13INSERT c? ID/time/affected_rows r?. Legacy online update1; final tail ?? derived update0 r?i LEGACY marker1. SQL source v? original timestamp/hash/ti?n/quantity kh?ng b? s?a; kh?ng gi? policy/receipt/accepted_at legacy.

Kh?ng th? l?y phase fingerprints native khi ch?a ???c ch?y SQL. C?n operator duy?t rehearsal m?t b??c m?t l?n ?? capture exact schema/data/source/entry/pre/post/final states. PREP **kh?ng c? executor bypass ch?y release unbound**. reviewBinding ch? t?o REVIEW_BOUND_NOT_EXECUTABLE trong b? nh?/test, c? blockers v? nativeVerified=false. Ch?a c? signed capture ho?c bound executable artifact ???c ghi ra.

DATA predicates ???c sinh t? actual inventory trong t??ng lai, ?? b?ng ?ang t?n t?i/c?t/PK; phase inventories ph?i kh?p grants/engine/charset/collation. Timestamps volatile ph?i c? approved deterministic input ho?c projection ph? h?p, kh?ng copy fingerprint rehearsal sang state m?i kh?ng kh?p.

Recovery journal/receipt s? d?ng RC2, gi? source/target/schema/release/run binding v? target/schema exclusion lock. UNKNOWN ch? ??ng sau exact observations/receipt, stale owner.lock v?n c?n operator recovery ri?ng, kh?ng t? x?a theo PID/age. DDL rollback to?n release kh?ng t?n t?i trong source n?y; kh?ng drop data hay restore-over-live ?? ?l?m l?i?.

## 5. BLOCKED / NATIVE_REQUIRED

| ?i?m | Tr?ng th?i v? c?ch x? l? |
|---|---|
| Docker/host/quota/network | BLOCKED: ch?a c?p t?i nguy?n, local RAM th?p, ch?a ki?m engine; c?n approve host v? provisioning |
| Actual identity/credentials | BLOCKED: kh?ng inventory DB; ch?a UUID/deny UUID/TLS/account/grants/version/collation th?t; kh?ng d?ng fixture metadata |
| Initial inventory/rehearsal | BLOCKED: connection/DDL capture c?n approval ri?ng v? operator adapter/executor ???c review; scripts kh?ng t? v??t gate |
| Active READ COMMITTED | NATIVE_REQUIRED: observer active transaction defaultRR; mock trace kh?ng ?? |
| SQL grammar/trigger/FK/CHECK/collation | NATIVE_REQUIRED: negative code ph?i ??ng constraint; DENIED ch? ch?ng minh grants, kh?ng ch?ng minh trigger |
| Observer cross-account visibility | NATIVE_REQUIRED: c? th? c?n quy?n visibility ??c bi?t; kh?ng t? c?p PROCESS ho?c s?a instrumentation/global grants |
| Two actual PIDs / HTTP / IPC / kill | NATIVE_REQUIRED: source/fake-child tests ch?a ch?ng minh process/network lifecycle th?t |
| Final binding/fingerprints/affected rows | BLOCKED ??n actual captures, signed review v? source digest approval; no synthetic replacement |
| Transaction/lock/deadlock/revoke/period/legacy | NATIVE_REQUIRED: ch?y c? hai th? t?, native DB oracle v? source parity; RAM/mock kh?ng ch?ng minh InnoDB |
| Journal disk/ACL/rename/power loss | NATIVE_REQUIRED: local fault tests kh?ng ch?ng minh m?t ?i?n, stale lock repair v?n operator-only |
| Load/BI adapters/AI | NOT_RUN: ledger workload source c?, mixed BI/catalog native adapters ch?a b?n giao; kh?ng import singleton runtime ?? l?p; AI ngo?i ph?m vi |

Phi?n b?n PREP kh?ng ph?i c?ng c? ?b?m ch?y t?t c?? v? kh?ng c? native execution approval. Ph?n c?n thi?u ch? y?u l? target/binding/native evidence, c?ng operator rehearsal adapter v? BI/catalog load integration ngo?i ledger correctness.

## 6. Nhi?u Backend, contention v? capacity

Hot-branch v? multi-branch plans c? seed ?n ??nh, ph?n ph?i A/B v? users100/500/1000; ??y l? m?c t?i th? ch?a ch?y. Direct case script kh?a ng??c product ?? g?y deadlock ch? l? negative test, kh?ng thay production lock rank. C?ng SKU nhi?u branch c?n c? product lock xuy?n branch c?n ?o; branch guard serialize writes theo branch l? bottleneck d? ki?n.

Correctness tr??c; pilot10users r?i m?i offered-rate/closed-user, p95/p99/accepted writes/s/rejections, pool acquire/guard/product/balance waits,1213/1205/UNKNOWN, DB/host IO/CPU/RSS. M?i s? latency/throughput native c?n tr?ng. Kh?ng kh?ng ??nh1000users, kh?ng b? gate/guard ?? ??t t?i.

## 7. Approval v? ?i?m d?ng

C?n ph? duy?t l?n l??t: host/quota/engine; exact version/image/network/TLS/volumes; instance/schema/principals/grants/secret delivery; inventory; synthetic seed/UTC/digest; stepwise rehearsal; source/PREP hashes v? bound review/signatures; hai process/observer/correctness/faults; load ri?ng sau correctness; cleanup exact resources. Chi ti?t t?ng m?c n?m trong DISPOSABLE_AND_APPROVALS.

Kh?ng ?? ngh? ng??i d?ng cung c?p password qua chat. Kh?ng xin m?t approval chung bao tr?m production cutover, import/archive B, replication hay AI.

**?? d?ng sau A2.1-PREP. Ch?a c? quy?n t?o/ch?y MySQL, k?t n?i DB k? c? SELECT, ch?y DDL/DML/seed/backfill/migration, launch Backend native ho?c activate RC2. Ch? ph? duy?t b??c ti?p theo.**
