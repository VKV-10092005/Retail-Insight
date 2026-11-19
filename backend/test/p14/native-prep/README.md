# P1.4 A2.1-PREP ? isolated native harness preparation

Importing these modules does not connect, fork, listen, seed or migrate. No native CLI is enabled. All native catalog/recovery cases are NOT_RUN.

Offline check from backend:
```text
node --import ./test/p14/no-network.js --test test/p14/native-prep/prep.test.js
```

- authority.js: expiring, operator-signed action/target/release/plan capability.
- coordinator.js: scoped IPC latch, deterministic releases, deadlines and sanitized trace.
- harness.js / worker.mjs: two distinct process/account/port descriptors; authorized native adapters, request hooks. Mock tests inject fake children, driver and listener only.
- fixtures.js: deterministic two-tenant fixtures, no password capable of normal login; test JWT authenticator only.
- binding.js / recipes.js: full-row DATA query plans, bootstrap per branch, legacy backfill/final-tail affected-row contracts and signed capture workflow; output remains review-only.
- observer.js: exact active transaction / requesting-blocking connection observations and economic oracle.
- scripts.js / control.js / scenarios.js: callable native SQL/HTTP/control race assertions, row locks/deadlock/rollback, legacy replay, hot/multi-branch workloads and honest throughput summaries.
- privileges.js: render proposed schema-local grants; never execute them.

[Report](../../../../docs/P1_4_A2_1_PREP_READINESS_2026-11-06.md), [execution runbook](../../../../docs/p1_4_a21_prep/NATIVE_EXECUTION_RUNBOOK.md).

No RC2 source/candidate changes and no RC3. Future execution must pin both historical RC2 digest and the PREP artifact manifest. Test-signing keys in unit tests are ephemeral and provide no native approval.
