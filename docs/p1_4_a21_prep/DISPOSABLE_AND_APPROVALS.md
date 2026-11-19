# A2.1-PREP ? Disposable v? approval

06/11/2026. **?? xu?t, ch?a c?p ph?t; executionAllowed=false.**

## M?y ph?t tri?n

Snapshot ch? ??c trong l??t n?y: RAM 8.419.024.896 bytes (~7,84 GiB), tr?ng 1.527.287.808 bytes (~1,42 GiB); 8 CPU logic; ? C tr?ng 142.756.380.672 bytes (~132,95 GiB). C?ng TCP 13316?13319 ch?a th?y listener; kh?ng ???c coi ?? reserve.

Kh?ng t?m th?y docker/podman trong PATH; c? wsl.exe. Kh?ng kh?i ??ng Docker/WSL distro ho?c g?i daemon. Kh?ng th?y service Docker qua truy v?n t?n, nh?ng kh?ng k?t lu?n m?i b?n c?i Docker ??u v?ng m?t. MySQL97 Running v? wampmysqld64 Stopped ch? l? t?n/tr?ng th?i service, kh?ng l? version/DB inventory; tuy?t ??i kh?ng t?i s? d?ng cho disposable. Kh?ng k?t n?i b?t k? DB n?o.

CIM b? sung b?o HypervisorPresent=true nh?ng firmware virtualization/SLAT=false; ch?a x?c minh Docker/WSL2 readiness v? kh?ng s?a Windows features/BIOS.

RAM tr?ng hi?n t?i kh?ng ?? headroom ??ng tin c?y cho MySQL2GiB + hai Node process. **Khuy?n ngh? host/VM ri?ng**, ho?c gi?i ph?ng RAM v? duy?t l?i budget tr??c local provisioning. Kh?ng c?i tool, t?o VM/container hay mua t?i nguy?n trong PREP.

## C?u h?nh m?c ti?u ?? duy?t

| Th?nh ph?n | ?? xu?t |
|---|---|
| Host ri?ng | 4 vCPU, 8 GiB RAM, disk80 GiB; fixture correctness nh? tr??c, ch?a cam k?t load1000 |
| MySQL | InnoDB single Primary test, nh?nh8.4 t??ng th?ch; exact patch/vendor/image SHA256 do operator ch?n v? pin tr??c provisioning |
| Container budget | 2 vCPU, RAM2 GiB, buffer pool512 MiB, max_connections80, strict SQL mode, default isolation RR ?? ki?m R01 |
| Storage | Volume m?i theo run manifest; kh?ng mount th? m?c MySQL/backup/socket/.env hi?n c?; kh?ng reuse volume/server UUID |
| Network | Private test network, deny production/research endpoints; kh?ng public DB. N?u c?ng host: publish127.0.0.1:13316?3306 |
| TLS | ?u ti?n CA/IP SAN/fingerprint ?? duy?t. Loopback exception c?n ph? duy?t v? b?ng ch?ng host ri?ng; loopback ??n l? kh?ng ch?ng minh c?ch ly |
| Schema | Exact retail_p14_test_<runid> trong manifest; deny retail_app/retail_management/retail_datawarehouse v? UUID th?t c?c server ?? |
| Backend | Hai PID ??c l?p, 127.0.0.1:13317 /13318, account kh?c nhau, pool?10 m?i process; test app ri?ng, kh?ng runtime Retail Insight |
| Coordinator | Controller IPC ri?ng; kh?ng c?n m?13319. C? th? reserve13319 cho observer tooling sau duy?t, hi?n kh?ng listener |
| Connection budget | Backend20 + migrator1 + control1 + seed1 + observer2 + reserve20 =45/80; kh?ng ch?y m?i suite c?ng l?c |
| AI/research | Kh?ng c?u h?nh k?t n?i; kh?ng inference, LB/Replica/Redis/queue |
| Cleanup | Ch? operator sau duy?t, exact server/schema/volume/run marker; gi? evidence theo retention ?? duy?t; kh?ng wildcard |

## Principal least privilege

privileges.js render GRANT proposal t? RC2 principalPolicy, ch? v?i schema test v? user@host t??ng minh. Kh?ng t?o account/password ho?c th?c thi GRANT.

- Migrator: schema-local SELECT/INSERT/UPDATE/CREATE/ALTER/INDEX/REFERENCES/TRIGGER; kh?ng global/DROP/GRANT OPTION. Ch? b?t ? window migration.
- Backend A/B: SELECT reference tables; INSERT document/items/movements/receipt/finalization/audit/balance; UPDATE quantity v? live_revision theo c?t. Kh?ng economic UPDATE/DELETE ho?c period/user mutation.
- Control: SELECT reference, UPDATE c?t quy?n/session/policy pointer/k?, assignment INSERT/DELETE v? audit INSERT. Kh?ng ledger DML. controlMutation d?ng channel ri?ng, kh?ng ?p control account v?o pool Backend RC2.
- Seed: SELECT/INSERT reference v? audit, ch? sau expand tr??c bootstrap/backfill; kh?ng DELETE/UPDATE economic, kh?ng d?ng ?? ?reset? posted data.
- Observer: SELECT business/control/receipt/audit v? performance_schema tables allowlist; kh?ng t? c?p PROCESS/SYSTEM_USER ho?c b?t instrumentation global.
- Provisioner n?m ngo?i runtime/harness: ch? operator tr?n instance m?i, account/secret/grants c?n duy?t ri?ng; kh?ng c?p root cho test code.

Native MySQL c? th? gi?i h?n nh?n transaction/thread c?a account kh?c khi thi?u PROCESS. ??y l? **NATIVE_REQUIRED/BLOCKED** n?u quan s?t kh?ng ??: b?o l?i, kh?ng fake lock evidence v? kh?ng ?m th?m c?p quy?n global. Operator c?n nh?c observer ??c bi?t ch? tr?n instance ??c l?p ho?c adapter visibility ???c duy?t; quy?n n?y kh?ng t? th?m v?o RC2 gate.

## Approval b?t bu?c, theo th? t?

1. Ch?n host/local hay VM ri?ng; quota CPU/RAM/disk v? quy?n c?i Docker/engine n?u c?n. Kh?ng m?c ??nh ???c ph?p v? ?? duy?t PREP.
2. Exact image/version/digest, config/mode/charset/collation/engine; volume/network/port/TLS v? firewall deny server th?t.
3. Provisioning scope: initialization h? th?ng MySQL, schema test, account/grants/secret delivery. Startup MySQL c?ng ghi system data; kh?ng g?i l? read-only.
4. Inventory connection ri?ng sau provisioning: target/schema/user/UUID/grants/TLS v? denylist UUID th?t do operator cung c?p ngo?i b?ng; kh?ng g?i secret v?o chat.
5. Duy?t fixture seed/digest/UTC test instant, bootstrap per branch v? evidence retention; kh?ng d? li?u th?t/research.
6. Duy?t rehearsal m?t b??c m?t l?n ?? thu native metadata/poststates tr??c binding; r? quy?n DDL/DML/seed v? stop points, kh?ng ??i flag candidate ?? ch?y.
7. Duy?t bound review/digest/pre/post/final predicates/affected rows, source/PREP hashes, operator signing key/permits, journal ACL/stale-owner recovery.
8. Duy?t hai PID test, IPC/HTTP loopback, observer visibility, correctness/fault scenarios v? kill/network-cut khi c?n. Kh?ng bao g?m runtime deploy.
9. Sau correctness, duy?t ri?ng load budget, offered rate/accepted floor/rejection budget/SLO v? th?i gian; 100/500/1000 ch?a ???c ch?ng nh?n.
10. Duy?t cleanup v? disposal exact resources sau gi? evidence; production cutover/archive/replication lu?n ngo?i g?i n?y.

Kh?ng t?o native permit/key hay c?p b?t k? approval n?o b?ng t?i li?u n?y.
