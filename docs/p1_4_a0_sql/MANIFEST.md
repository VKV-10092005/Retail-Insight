# P1.4 A0 — Static artifact manifest

06/11/2026. Review only; SQL NOT EXECUTED; native/load tests NOT RUN.

SHA-256 of exact UTF-8 file bytes; manifest excludes itself.

| File | SHA-256 |
|---|---|
| docs/P1_4_A0_DESIGN_REVIEW_2026-11-06.md | 3d97073744ea39469dfd832e9d93eb193473169043f35d66b078e5567cc69bb3 |
| docs/P1_4_A0_RUNNER_RECOVERY_2026-11-06.md | 6013d6fcd856c6305361c88839881eefec1bba6b15c17a132dab1a7da1b09188 |
| docs/P1_4_A0_TRANSACTION_CONCURRENCY_2026-11-06.md | b04a3c5dd851adc82b6eaed2c752568288c944d45b5ea61762d6300cc46e76aa |
| docs/P1_4_A0_TEST_DESIGN_2026-11-06.md | 8949662a49e82e6da651b3433171d26b716cb8298a85ef73a74f5546aa94ca9c |
| docs/p1_4_a0_sql/00_preflight.draft.sql | 8631a1750dcc0fba10a43d83cc62467f7a0c3341245d1f7bd2cc5ee6886451fb |
| docs/p1_4_a0_sql/10_expand.draft.sql | 801d3838c3d85bd7ab5f066d0230a1b41f16585586004e5e8274a1296904d92b |
| docs/p1_4_a0_sql/20_backfill_bootstrap.draft.sql | 291663c0292090b1ec38ee92f3edf675c82d2822d9e7231c5b4543ffa9b52ba1 |
| docs/p1_4_a0_sql/30_contract.draft.sql | 39d585da8e3a1b6efc3ca7a5a52c4fd09ddb6cc0a67af8896b8284db836e638a |
| docs/p1_4_a0_sql/40_write_fences.draft.sql | ad44ccd5fa750d4546a4ff3cf879d5f2e5333295393242ee2bc79f677c0d3961 |
| docs/p1_4_a0_sql/41_immutability.draft.sql | af73aff4417ea5159104e7b37f68e75f70d5c97e4019eb785ad0a19b9fff4b3b |
| docs/p1_4_a0_sql/50_cutover.draft.sql | 49dbed27632312794ef8fc66995690510ce249b1c6694cadd661f5945cb0b559 |
| docs/p1_4_a0_sql/README.md | 62070cf9e2d9e3870b70f286432b06656930bc229bfea82a96685ee96edfe6b9 |
| docs/P1_4_TECHNICAL_IMPLEMENTATION_PLAN_A_B_2026-11-06.md | b3a325894ba7b782b301e1d80f02cc48fdaee450c2a59c032b34aead465b2747 |

Original plan SHA-256 before A0 pointer: 6f72854cb9ca4c6188f3d5c77d77ff895f083417314a1bd138e60f48e3487185.

Source baseline: 96 files; aggregate SHA-256 2c3d85bba0311b789a5d3fee16996c36116a1989ff72b818ff6bb8f63b7310d8.
Roots: backend/src, backend/test, frontend/src, ai-service/app (exclude __pycache__); plus backend/package.json, frontend/package.json, ai-service/run.py, ai-service/requirements.txt, compose.yaml.
Aggregate: sorted paths; SHA256 of concatenated UTF-8 lines path + space + file SHA256 + LF.

No live database/schema/grants fingerprint obtained. Draft syntax and InnoDB behavior remain unverified.
