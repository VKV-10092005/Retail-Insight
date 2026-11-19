# P1.4 A1 RC1 — Candidate không thực thi

06/11/2026. Candidate ở [candidate.json](candidate.json), implementation tại ../../src/p14.
Đọc [báo cáo A1](../../../docs/P1_4_A1_IMPLEMENTATION_2026-11-06.md) trước mọi bước tiếp theo.

- state=CANDIDATE_NOT_EXECUTABLE, nativeVerified=false.
- 31 step records: 30 DDL + 1 schema-control UPDATE được đánh manual; 30 preflight/backfill/bootstrap/cutover templates riêng.
- Không đặt trong src/db/migrations; không chạy bằng npm run migrate hoặc runner split(';').
- SQL A0 review-only tại docs/p1_4_a0_sql giữ nguyên; parser chỉ bỏ sentinel khi tạo artifact riêng, không chỉnh draft.
- Các charset/collation tokens, version/sql_mode, baseline và pre/post fingerprints còn chưa bind. Không đoán giá trị từ MySQL package/deployment docs.
- Candidate builder/inspection không mở DB; CLI không có apply/connect. Không coi “parser PASS” là MySQL syntax/locking PASS.
- Runner DDL không auto-run manual state transitions. Phải review phase choreography/checkpoint evidence trong A2, không mark manual step VERIFIED giả để vượt dependency.

## Kiểm tra artifact an toàn

Từ thư mục backend:

~~~powershell
node --import ./test/p14/no-network.js src/p14/candidate-cli.js
~~~

Lệnh chỉ parse/hash/inspect file, in summary sqlExecuted=false. Tùy chọn --write-candidate chỉ tạo JSON khi chưa có artifact khác digest; không chạy SQL. Không có lệnh native/production activation trong README này.

## Cổng tương thích code

createDocumentWriter mặc định từ chối trước khi lấy connection. app/server/legacy ledger không mount router mới. ISOLATED_MOCK chỉ cho test; A2_DISPOSABLE chỉ chấp nhận pool capability do createDisposableWriterPool cấp sau config/permit gate. Một object gắn nhãn a2-disposable không đủ. RUNTIME bị từ chối.

openDisposable và pool factory không có default mysql connector/config/env. Caller tương lai phải truyền connector và dedicated config/permit đã được cấp A2; account p14_test_, schema literal, IP+port+UUID, forbidden UUIDs, TLS hoặc isolated loopback, exact version/strict sql_mode/InnoDB và narrow grants đều được kiểm. Không cấp permit thật trong A1.

runMigration từ chối candidate chưa A2_APPROVED/bind/checksum đúng; denylist database độc lập chặn retail_app kể cả allowlist nhập sai. Checkpoint FileCheckpoints cần thư mục operator riêng, advisory lock và fingerprints exact để resume. Không tự reconnect/promote/replay UNKNOWN.

## Gate A2

Cần approval riêng cho disposable provisioning, native DDL/write, metadata inventory và rehearsal choreography; sau đó validate CREATE TRIGGER/BEGIN END, FK/CHECK/collation, rollback/unknown outcome và lock ranks trên MySQL thật. Chưa xác nhận bất kỳ capacity100/500/1.000 user nào.

SHA256 manifest nằm trong docs/P1_4_A1_MANIFEST_2026-11-06.md. Không có thay đổi AI/research/weights, archive B, combined BI hoặc hạ tầng phân tán.

