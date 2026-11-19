# A2.1-PREP ? Native runbook ch?a ???c ph?p ch?y

06/11/2026. **T?t c? b??c native NOT RUN.** ??y l? k? ho?ch v? giao di?n script; kh?ng c? l?nh apply t? k?ch ho?t.

## Choreography v? v?ng binding

RC2 c?n fingerprint native tr??c khi tr? th?nh bound release. PREP kh?ng gi?i b?i to?n n?y b?ng c?ch ?i?n hash gi?: ph?i duy?t m?t **rehearsal t?ch bi?t**, m?t b??c c? review/capture/stop, tr?n disposable. Ch?a c? ???ng t? th?c thi release unbound trong scripts.js.

1. Operator ???c duy?t provision instance m?i v? schema/accounts. Inventory connection c? approval ri?ng; kh?ng import .env ho?c runtime pool.
2. Capture identity/version/sql_mode/charsets/collations/engine/full CURRENT_USER/USER/grants/table/column inventories, TLS provenance v? schemaFingerprint RC2. Inventory function ch? nh?n connection ?? ???c caller c?p quy?n; kh?ng t? connect.
3. Review packaged baseline001/002 + ledgers (P01) v? expand (P02). Kh?ng ch?y runner split(';'). DDL rehearsal c?n operator executor ri?ng ???c review; PREP kh?ng cung c?p bypass ch?y candidate unbound.
4. Sau expand, tr??c P03, seed fixture qua seedFixture v?i SEED authority. Generator m?c ??nh2org?2branch,8users ??4roles,4SKU/org, stocks1/10; ba receipt legacy1970/1975/2024, balance kh?p movement. Fixture-only hash/invalid-login password kh?ng l? d? li?u production.
5. P03 bootstrapPlan:1control +4?(policy/guard/period)=13 INSERT, expected affected_rows1 t?ng d?ng, explicit IDs cho fixture. Compiler review ph?i thay group m?t-branch provisional b?ng group ?? scope; kh?ng t? s?a candidate RC2.
6. Online legacy backfill m?i document l? m?t chunk c? SELECT lock + UPDATE affected_rows1. accepted_at/policy/period/revision legacy v?n NULL, epoch0; kh?ng t?o receipt. UTC timestamps/hash/ti?n/quantity kh?ng ??i.
7. P04 ??ng ingress test, drain/fence principal c? c? attestation, MAINTENANCE TX. P05 tail recipe cho row ?? derived: UPDATE affected_rows0 r?i INSERT LEGACY marker1; raw manifest SHA d?ng UNHEX(hex) ?? tr?nh serialization Buffer/JSON. Missing lineage kh?c d? ki?n ph?i fail; kh?ng ch?p nh?n0 cho m?i UPDATE.
8. P06 contractDDL ? P07 CT_SCHEMA_VERSION TX ? P08 triggers/fences ? P09 review barrier ? P10 cutover test ? P11 native evidence. Kh?ng b? schema-control transaction hay t? VERIFIED.
9. DATA predicates select ??y ?? c?t, ORDER BY primary key theo inventory th?c; ch? b?ng ?ang t?n t?i, kh?ng SELECT b?ng t??ng lai. Schema_migrations ch? version, kh?ng applied_at bi?n ??ng. TX receipt data lo?i kh?i generic DATA hash ?? tr?nh t? tham chi?u; receipt v?n ki?m ri?ng v? schema v?n fingerprint.
10. Capture exact entry/before/after/phase-final hashes + ordered DATA query results digest, signed phase capture v? immutable source checksums. reviewBinding lu?n xu?t REVIEW_BOUND_NOT_EXECUTABLE/nativeVerified=false; ch?a t?o bound executable artifact trong PREP.
11. Operator review to?n b? rendering/typed values/affected-row semantics (clientFoundRows m?c ??nh kh?ng t? ?o?n), phase inventories v? source/PREP digests. Approval ri?ng m?i cho ph?p seal run binding v? ch?y executor ? m?i tr??ng m?i/???c reset theo manifest.
12. Directory journal v? DB receipts ph?i thu?c exact target/schema/release/run. File lock + DB lock target/schema; stale lock kh?ng auto-remove. DB crash/ACK loss: observe before/after/receipt r?i quy?t ??nh, kh?ng blind retry ho?c restore-over-live.

Timestamps fixture ???c pin t? UTC input ???c duy?t, session expiry m?t gi? ch? cho correctness run ng?n. Soak2gi? c?n fixture/session TTL m?i ???c duy?t; kh?ng silently gi? phi?n h?t h?n. DDL/native-created timestamps c? th? kh?ng deterministic gi?a rehearsal v? run: ph?i gi? approved explicit input ho?c schema/data projection ph? h?p, kh?ng sao ch?p hash rehearsal khi state m?i kh?c.

## Hai process, coordinator v? observer

nativeSpawner ch? fork worker.mjs khi authority c? signature ??ng target/release/run/actions v? exact launch plan digest. Child environment allowlist, execArgv r?ng, kh?ng NODE_OPTIONS/dotenv, secret qua IPC, kh?ng argv/log. Test authenticator ki?m test JWT v? DB writer recheck quy?n hi?n t?i; kh?ng production auth.

launchNativePair y?u c?u hai PID/account/port kh?c nhau; m?i case m?t caseId v? held stage t??ng minh. Hook c? attempt/sequence/run/case/participant, deadline?2gi?y, release/abort trace. Kh?ng gi? nhi?u hook ??ng th?i n?u controller kh?ng c? l?ch release t??ng ?ng. Case ph?i k?t th?c nhanh h?n transaction deadline5gi?y.

Hook RC2: after-auth-lock, after-guard, after-product-balance-lock, after-header, before-commit, after-commit-before-response. Coordinator c?ng nh?n stage cho direct native lock scripts. Startup connectionId ch? l? th?ng tin startup; **kh?ng ???c coi l? active transaction ID c?a request sau ??**. Observer l?y IDs ?ang ho?t ??ng t? verified principal/threads ho?c direct script connections, sau ?? ki?m requesting/blocking connection pair ch?nh x?c.

| Case | Interleaving v? proof b?t bu?c |
|---|---|
| STOCK A th?ng/B th?ng | A gi? after-guard, g?i B, observer th?y B?A guard wait; release A r?i release B hook. M?t201/m?t409, balance0 v? m?t delta |
| IDEMPOTENCY | C?ng body/key tr?n A/B; m?t201/m?t200 c?ng frozen ID; DB receipt/delta/audit/revision m?t l?n; timeout replay gi? key |
| MIXED SALE/RECEIPT | Hai th? t?, stocks0/1/max boundary theo fixture m?i; oracle ki?m no lost increment/negative/overflow, kh?ng ?p sale lu?n th?nh c?ng |
| TENANT | CASHIER org11 g?i branch1201, hai Backend ??u deny; count/list/receipt kh?ng leak |
| RC | Hai connection m?i defaultRR, BEGIN qua protocol RC2; observer transaction active ph?i READ COMMITTED, kh?ng ch? @@session |
| LOCK | A kh?a product, B ??i c?ng h?ng; exact thread/connection edge tr??c release, kh?ng d?ng sleep l?m b?ng ch?ng |
| DEADLOCK | Direct test adapter kh?a product1/product2 ng??c th? t?; observer th?y wait, t?o chu k?; ??ng m?t1213, survivor rollback; kh?ng s?a production lock order |
| CHECK/FK/TRIGGER | Fresh connection ri?ng m?i negative SQL; ??ng MySQL error code, kh?ng ch? b?t k? l?i. UPDATE total c?a legacy ?? finalized ph?i trigger reject, kh?ng ??nh PASS v? thi?u quy?n |
| COLLATION | D?ng request_key collation th?c ???c inventory; case/space semantics theo DB v? request contract, kh?ng t? ??i collation |
| REVOKE | control-first gi? target user X/session, poster b? block r?i deny; poster-first gi? user S tr??c revoke. controlMutation d?ng sorted user locks v? current OWNER |
| PERIOD | control-first gi? guard tr??c close, poster ch? r?i409; poster-first commit tr??c close. runControlRace d?ng actual lock observation callback |
| LEGACY | checksum original timestamps/hash/total/items/movements tr??c/sau backfill, dates IANA; replay receipt c? kh?ng t?o receipt m?i |
| RECOVERY | J01?J08 recipes: fsync/rename, DDL ACK loss, TX receipt ACK loss, crash rollback, stale owner, drift, competing runs v? missing CT |

Observer kh?ng b?t global instrumentation. N?u Performance Schema kh?ng th?y ?? active transactions/locks ? BLOCKED, kh?ng fallback sleep hay ?kh?ng c? lock ngh?a l? pass?. Negative immutable SQL c?n migrator/test adversarial account t?ch bi?t; Backend account DENIED ch?ng minh grants, kh?ng ch?ng minh trigger. Nguy?n t?c n?y ?p d?ng t??ng t? FK/CHECK.

assertOracle ??i chi?u balance delta ch?nh x?c b?ng BigInt, header/item money, positive quantity, movement sign/branch, one receipt/marker/audit cho native, no orphan/extra movement. Snapshot ??u/cu?i ph?i quiescent tr?n m?t consistent snapshot/connection; truy?n before.movements ?? tr? committed baseline. Lu?n ??i chi?u th?m branch live_revision v? tenant-specific lists/counts t? DATA query plan; kh?ng d?ng HTTP201 l?m oracle kinh t? duy nh?t.

## T?i v? bottleneck sau correctness

Ch?a ch?y load. B?t ??u pilot10users, ledger-only g?n nh?n; sau ?? hot-branch/hot-SKU, kh?cSKU c?ngbranch, c?ngSKU nhi?ubranch, nhi?uorg v? multi-branch. workload t?o100/500/1000 users l? plan, kh?ng requests/s hay n?ng l?c ?? ??t.

Warmup5ph?t/ramp5/steady20, spike/cooldown, soak2gi? sau duy?t resource/TTL. C?n c? closed-user think-time2?5s v? open-arrival-rate generator v?i offered rate ???c duy?t; module workload kh?ng t? c?i ho?c ch?y load engine. BI/catalog adapters ch?a c? native workload nghi?m thu; kh?ng import runtime singleton ?? l?p ch? tr?ng. AI kh?ng g?i th?t.

?o offered/completed/accepted-new/replayed RPS, p50/p95/p99, business409 v?429/503 ri?ng, unresolved/timeouts trong denominator; kh?ng gi? latency ??p b?ng drop t?i. summarize kh?ng l?y replay l?m accepted-new write. Thu server duration, pool acquire, auth/guard/product/balance wait, lock wait/hold,1213/1205/retry/UNKNOWN, connections/CPU/RSS/eventloop/DBIO/query digest; native metrics ??u NOT RUN.

SLO ?? xu?t live-write p95?1s/p99?2s, zero correctness/tenant violations; accepted floor/rejection budget v? BI SLO c?n duy?t. Kh?ng t?t gate/guard ho?c m? pool v??t budget ?? ??t s? user. Report actual stable throughput v? bottleneck, kh?ng h?a1000users.
