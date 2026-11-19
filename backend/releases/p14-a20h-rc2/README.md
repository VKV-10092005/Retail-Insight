# P1.4 A2.0-H — RC2

06/11/2026. **CANDIDATE_NOT_EXECUTABLE; nativeVerified=false.**

Separate implementation: [src/p14/rc2](../../src/p14/rc2). RC1, A0, A1 and A2.0 remain historical evidence. Neither runtime app/server/ledger imports RC2. No apply CLI exists.

Offline inspection (from backend): `node --import ./test/p14/no-network.js src/p14/rc2/candidate-cli.js --inspect`. This reads source only; it does not connect to MySQL. The write-candidate command writes JSON only and refuses overwriting a changed existing digest.

Candidate contains 12 ordered phases, 57 typed steps, statement checksums, source hashes and parameter contracts. All database fingerprints remain null. SQL tokens/parameters remain unbound where inventory or approved data is needed. Do not extract SQL and send it to the old runner.

[RC1 → RC2](DIFF_AND_CONTRACT.md), [binding review](binding.review.json), [implementation report](../../../docs/P1_4_A2_0_H_IMPLEMENTATION_2026-11-06.md), [manifest](../../../docs/P1_4_A2_0_H_MANIFEST_2026-11-06.md).

A2.1 remains **NO-GO**. Preparation of this artifact grants no provisioning, connection, migration, fixture, native process or runtime permission.

