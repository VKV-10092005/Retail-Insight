# Hoàn thành P1.3 — IANA ngày kinh doanh Retail Insight
Ngày 06/11/2026. Chỉ triển khai phạm vi được phê duyệt; dừng trước các gói tiếp theo.

## 1. Kết quả

Ngày/tháng báo cáo dùng Asia/Ho_Chi_Minh theo IANA. Timestamp lưu trữ, driver/session MySQL, JWT/session và timestamp JSON vẫn UTC. Không sửa timestamp cũ, tạo business_date hoặc migration.

Ví dụ start=end=2026-11-06 resolve thành [2026-11-05T17:00:00Z,2026-11-06T17:00:00Z). Quy tắc lịch sử không bị cố định+7: ngày02/01/1970 bắt đầu tại01/01 16:00Z (offset+8); ngày12/06/1975 có25giờ theo IANA của runtime kiểm tra.

Dashboard, BI, danh sách sales/receipts, movement list/chart, date filters, chi tiết/in chứng từ và formatter đã cập nhật cùng calendar metadata. Movement kinh doanh lấy ngày từ stock_documents.created_at; inventory_movements.created_at vẫn giữ để audit.

AI/FastAPI/weights/snapshots/nghiên cứu không được sửa. Dashboard nêu rõ AI vẫn giữ calendar hiện tại, chưa đồng bộ theo lịch báo cáo. Readiness không được coi là inference PASS.

## 2. Kiến trúc và dependency

Nguồn cấu hình duy nhất: [backend/src/config/business-calendar.js](../backend/src/config/business-calendar.js).
- BUSINESS_TIME_ZONE mặc định Asia/Ho_Chi_Minh; chỉ operator cấu hình phía Backend.
- Từ chối offset dạng +07:00/-... thay cho IANA, validate tên zone khi nạp module; không fallback khi cấu hình sai.
- policy_version=business-calendar-v1; timestamp_basis=UTC.
- Query timezone của client không được dùng để thay chính sách.
- Không sửa .env; default đã đáp ứng phê duyệt hiện tại.

Đã dùng npm registry để xác minh @js-temporal/polyfill0.5.1, engines Node>=12; cài --save-exact, --ignore-scripts. package.json pin0.5.1, lockfile khóa package và jsbi4.3.2. Đã kiểm thực thi trên Node24.13.0 và ICU77.1; chưa kiểm mọi phiên bản Node/container production.

[business-calendar.js](../backend/src/business/business-calendar.js):
- Temporal.PlainDate xử lý ngày lịch, zoned midnight và cộng ngày/tháng theo IANA.
- resolveBusinessRange tính cận UTC nửa kín; businessDay/businessMonth và generator businessBuckets dùng chung timezone.
- Giữ Gregorian validator P1.1 nguyên tắc0001–9999. Cận được clip vào miền TIMESTAMP(0) hiện tại trước bind SQL; ngày ngoài miền trả tập rỗng có scope, khoảng bao toàn miền vẫn all-time.
- Không emit năm0000/10000 vào SQL. Clipping có metadata range_clipped/empty, không âm thầm cắt một khoảng kinh doanh khả dụng.
- Miền hiện tại là [1970-01-01T00:00:01Z,2038-01-19T03:14:08Z), cận phải exclusive. Đây là miền kiểu cột đã khảo sát, không phải chính sách tự giới hạn lịch sử; đổi kiểu cột trong tương lai cần cập nhật helper/tests riêng.

Không đổi TZ hệ thống, MySQL global/session policy hoặc timezone tables. Backend vẫn dùng timezone:'Z'/time_zone='+00:00' từ pool hiện có.

## 3. Truy vấn và tính nhất quán

### Phạm vi ngày

common.filters giữ tenant, assignment branch và branch_id, sau đó bind:
- created_at>=startUtc khi có cận dưới cần thiết.
- created_at<endUtcExclusive khi có cận trên cần thiết.
- AND1=0 khi khoảng không giao miền timestamp.

Cột timestamp không bị bọc DATE/CONVERT_TZ ở WHERE. Count/list của sales/receipts dùng cùng WHERE và parameters; giữ EXISTS category/product cùng một item, type, ORDER BY id DESC, limit/page.

### Bucket và số liệu

[calendar-aggregate.js](../backend/src/business/calendar-aggregate.js) đọc MIN/MAX trong đúng scope, tạo bucket IANA và JOIN bảng dẫn xuất UTC. Mỗi bucket gắn period date/month string cùng [start,end). Mỗi lần query tối đa128bucket; tiếp tục các batch còn lại, không truncate kết quả hoặc đổi all-time thành30ngày.

SUM tiền và số lượng vẫn do database thực hiện; không gom tiền bằng số thực JavaScript. Một period chỉ thuộc một batch, nên không cần cộng lại money trong Node. Không dùng named CONVERT_TZ/DATE_FORMAT trong query BI mới; timezone tables MySQL không phải dependency.

MIN/MAX rỗng trả [], không tạo chart/demo giả. KPI, by-branch/category, top/slow và tồn hiện tại giữ công thức cũ; chỉ thay phạm vi ngày. Tồn hiện tại không bị biến thành tồn cuối kỳ.

### Snapshot đọc

common.readSnapshot sử dụng connection riêng:
1. SET TRANSACTION ISOLATION LEVEL REPEATABLE READ.
2. START TRANSACTION READ ONLY.
3. Đọc count/list hoặc toàn bộ KPI/chart.
4. COMMIT; lỗi thì ROLLBACK nếu đã mở, luôn RELEASE.

Các lệnh này đặt đặc tính transaction đọc, không SET GLOBAL, không đổi timezone và không ghi dữ liệu. Snapshot đảm bảo nhiều batch/chart cùng một tập dữ liệu quan sát. Không dùng FOR UPDATE.

### Movement

Movement list và BI join chứng từ theo id+organization+branch, lọc/bucket theo d.created_at. API thêm document_created_at, vẫn trả nguyên m.created_at. Không đổi dữ liệu hoặc giờ ghi movement.

Việc kiểm tra branch đồng nhất giữa movement/document cũng ngăn một dòng không nhất quán bị hiển thị dưới ngày/branch của chứng từ khác. Luồng ghi hiện có vốn tạo movement cùng branch; không sửa quyền/assignment.

## 4. API thay đổi

| API | Thay đổi |
|---|---|
| GET /api/v1/sales, /receipts | start/end là ngày kinh doanh; count/list cùng snapshot đọc; thêm calendar |
| GET /api/v1/sales/:id, /receipts/:id | Thêm calendar; timestamp/document/items giữ hợp đồng hiện có |
| GET /api/v1/bi/overview | Local-day/month trend, movement theo ngày chứng từ, calendar; KPI/tồn giữ công thức |
| GET /api/v1/inventory/movements | Lọc ngày chứng từ, thêm document_created_at và calendar; raw audit timestamp giữ |
| GET /api/v1/inventory | Calendar mô tả inventory_balances.updated_at; vẫn là tồn hiện tại |
| GET /api/v1/dashboard/overview | Calendar context để UI dùng cùng cấu hình |
| /auth/*, /ai/*, /research/* | Không đổi quy tắc hoặc pipeline |
| POST /sales, /receipts | Không sửa cách ghi timestamp hoặc nghiệp vụ |

Calendar additive giữ trường cũ, bổ sung:
~~~json
{
  "timezone": "Asia/Ho_Chi_Minh",
  "policy_version": "business-calendar-v1",
  "timestamp_basis": "UTC",
  "timestamp_source": "stock_documents.created_at",
  "start_date": "2026-11-06",
  "end_date": "2026-11-06",
  "start_utc": "2026-11-05T17:00:00.000Z",
  "end_utc_exclusive": "2026-11-06T17:00:00.000Z",
  "range_clipped": false,
  "empty": false
}
~~~

Date không truyền có metadata null thay vì giả ngày được chọn. Calendar của inventory sử dụng timestamp_source=inventory_balances.updated_at và không gán bộ lọc ngày vào stock hiện tại.

P1.2 vẫn phân biệt: list trả toàn chứng từ đã chọn, trong khi BI category/product tính dòng khớp. Không đánh đồng SUM(document.total) với doanh thu dòng đã lọc.

## 5. Frontend

[operations/business-time.js](../frontend/src/operations/business-time.js) dùng Intl.DateTimeFormat với timeZone từ metadata Backend; không có timezone kinh doanh hardcode trong production Frontend, không dựa host/browser timezone. Nếu metadata chưa có, instant hiển thị UTC có nhãn rõ thay vì đoán giờ máy. Raw timestamp vẫn UTC; period date/month giữ nguyên chuỗi, không parse Date thành trục thời gian theo browser.

Dashboard:
- Nhãn ngày kinh doanh và filters lấy calendar từ BI/dashboard API.
- as_of được hiển thị cùng zone.
- Biểu đồ dùng period Backend đã group địa phương.
- Có thông báo AI giữ calendar hiện tại.

Ledger:
- Thêm hai ô ngày cho lịch sử phiếu nhập.
- Bộ lọc áp dụng chứng từ/movement, ghi rõ tồn vẫn hiện tại.
- List, chi tiết/in chứng từ và updated_at có formatter tường minh.
- Movement hiện cả thời gian chứng từ và thời gian ghi movement audit.

Không đổi AI.jsx, default forecast origin, feature computation hoặc model. shared.Filters chỉ hiển thị label timezone khi có bộ lọc ngày, không gắn lịch kinh doanh vào các trang AI dates=false.

## 6. File sửa/thêm

| Nhóm | File |
|---|---|
| Backend config mới | backend/src/config/business-calendar.js |
| Helper mới | backend/src/business/business-calendar.js; backend/src/business/calendar-aggregate.js |
| Backend cập nhật | backend/src/business/common.js; backend/src/business/ledger.js; backend/src/business/bi.js; backend/src/app.js |
| Dependency | backend/package.json; backend/package-lock.json |
| Frontend mới | frontend/src/operations/business-time.js |
| Frontend cập nhật | frontend/src/operations/shared.jsx; Dashboard.jsx; Ledger.jsx |
| Unit mới | backend/test/business-calendar.test.js; backend/test/read-snapshot.test.js |
| Test hiện có cập nhật | backend/test/period.test.js; backend/test/document-list.integration.test.js |
| Native SELECT test mới | backend/test/calendar-mysql.test.js |
| UI test mới | frontend/tests/business-calendar.spec.js |
| Tài liệu | Báo cáo này, audit tổng hợp và chú thích trạng thái bản thiết kế P1.3 |

Frontend dist được build để kiểm chứng, không deploy/publish. Không sửa .env, pool.js, auth middleware/routes, migrations, AI/FastAPI/model hoặc data/research.

## 7. Kiểm thử và kết quả

Tổng cuối: **169 PASS, 0 FAIL, 3 SKIP**, tách lớp bằng chứng như bảng. Theo cách đếm Node test runner, có tính test cha khi có subtest; không cộng probe HTTP thủ công/build vào số này.

| Bộ kiểm thử | PASS | FAIL | SKIP | Loại bằng chứng |
|---|---:|---:|---:|---|
| business-calendar.test.js | 19 | 0 | 0 | Pure IANA/date/range/bucket |
| period.test.js | 47 | 0 | 0 | Gregorian P1.1 + điều kiện calendar mới |
| document-list.integration.test.js | 62 | 0 | 0 | Express thật + JWT/quyền thật trên SQLite RAM |
| read-snapshot.test.js | 4 | 0 | 0 | Read-only, rollback/release khi callback/begin/commit lỗi |
| config/origins/origin-http/bootstrap-owner | 29 | 0 | 0 | Regression an toàn hiện có |
| auth.integration, auth-rate-limit, operations.integration | 0 | 0 | 3 | Tắt do các test này có ghi MySQL |
| calendar-mysql.test.js | 5 | 0 | 0 | MySQL native, chỉ SELECT hằng |
| business-calendar.spec.js | 3 | 0 | 0 | Edge, toàn bộ API mock, ba browser timezone |
| Tổng | 169 | 0 | 3 | Không phải tất cả đều native MySQL |

Build Frontend: npm.cmd run build PASS, Vite2228modules; không triển khai production.

### Phạm vi case đã kiểm

- Cận 00:00/23:59:59.999999, end exclusive không đếm lại ngày sau; tháng/năm và leap day.
- IANA1970+8 và ngày25giờ12/06/1975; không dùng86400giây cố định.
- 0001/9999, khoảng ngoài miền rỗng, bucket đầu/cuối TIMESTAMP(0), open bounds/all-time.
- Hơn2500bucket không bị cắt, các bucket tiếp giáp không chồng lấn; native monthly batchSize1 kiểm đi qua nhiều batch.
- Scope owner/cashier/inventory, tenant override403, không session401, foreign category/product/branch, combined filters và pagination.
- KPI orders khớp danh sách, SUM trend revenue khớp KPI; monthly boundary group đúng địa phương.
- Phiếu/movement ở hai phía nửa đêm vẫn báo cáo cùng ngày chứng từ; giữ raw audit instant.
- Stock hiện tại không đổi khi đổi range; response metadata dùng đúng source.
- Snapshot rõ READ ONLY, rollback/release trên các lỗi quan trọng.
- Client timezone=UTC không thay chính sách Backend.
- Host Node TZ=UTC và America/Los_Angeles không làm đổi conversion.

Lượt integration đầu có53PASS/9FAIL do fixture SQLite so timestamp TEXT không đồng nhất precision, ví dụ17:00:00 và17:00:00.000000. Fixture được chuẩn hóa6digits trong SQLite RAM (không đụng timestamp thật), rồi62PASS/0FAIL. Không đổi expected count để che lỗi và không bỏ các test scope/Gregorian.

### Browser

Edge headless chạy riêng3contexts: UTC, Asia/Ho_Chi_Minh, America/Los_Angeles. Cùng instant05/11/2026 17:00Z đều hiển thị00:00:00 06/11/2026 tại Dashboard, list/chi tiết phiếu nhập; filters gửi date-only không chuyển giờ tại browser; audit/source columns và label/calendar AI hiện đúng.

Toàn bộ /api/* được mock, chỉ GET được phép; không có tài khoản/phiên người dùng thật. Vì vậy đây là kiểm thử Frontend với metadata, không phải E2E OWNER trên MySQL vận hành.

### MySQL native

Dùng chính calendarAggregate trên SELECT FROM derived constants; adapter test chỉ bố trí tham số hằng nguồn cho đúng thứ tự SQL. Không CREATE/INSERT/UPDATE/DELETE.
Các case: nửa đêm hiện đại, lịch sử IANA+8, cận Gregorian bao toàn miền, và tháng địa phương qua nhiều batch. Chứng minh MySQL chấp nhận SQL derived buckets/CAST(DATETIME(6))/group/parameter binding; không chứng minh queryplan hoặc tốc độ trên bảng kinh doanh lớn.

P0 live probes sau thay đổi:
- /health200, training_enabled=false.
- /v1/readiness token hợp lệ200.
- Thiếu/sai token401.
- Hybrid/Stockout vẫn UNAVAILABLE/MISSING_MODEL_ARTIFACT.
Không gọi inference hoặc khẳng định forecast đã sẵn sàng.

## 8. Tái chạy an toàn

Backend chạy mỗi file một process để mock/env không dùng chung và tránh áp lực RAM:
~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\backend'
$env:RUN_DB_TESTS = '0'
$env:RUN_CALENDAR_MYSQL_TESTS = '0'
$files = @(
  'test/business-calendar.test.js',
  'test/read-snapshot.test.js',
  'test/period.test.js',
  'test/document-list.integration.test.js',
  'test/config.test.js',
  'test/origins.test.js',
  'test/origin-http.test.js',
  'test/bootstrap-owner.test.js',
  'test/auth.integration.test.js',
  'test/auth-rate-limit.test.js',
  'test/operations.integration.test.js'
)
foreach ($testFile in $files) {
  node --max-old-space-size=128 --test --test-isolation=none --test-concurrency=1 --test-reporter=spec $testFile
  if ($LASTEXITCODE -ne 0) { throw "Test failed: $testFile" }
}
# Chỉ SELECT hằng; không bật RUN_DB_TESTS.
$env:RUN_CALENDAR_MYSQL_TESTS = '1'
node --max-old-space-size=128 --test --test-isolation=none --test-reporter=spec test/calendar-mysql.test.js
~~~

Frontend chỉ chạy file UI mới, không bộ E2E cũ có đăng ký/xóa fixture:
~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\frontend'
npm.cmd run test:e2e -- tests/business-calendar.spec.js --workers=1 --reporter=list
npm.cmd run build
~~~

Các lệnh không chứa secret; credentials DB hiện có được đọc từ .env ở tiến trình native test nhưng không xuất ra log.

## 9. Bảo vệ dữ liệu và giới hạn

SELECT post-check trên retail_app: categories0, products0, balances0, documents0, items0, movements0. Session timezone vẫn+00:00, global vẫnSYSTEM. Đây là bằng chứng các bảng kinh doanh vẫn rỗng tại lúc kiểm tra, không phải hash toàn bộ DB hoặc chứng minh không có hoạt động khác của người dùng.

Không thực hiện migration, seed, bootstrap, POST giao dịch, chỉnh user/org/branch/role hoặc ghi MySQL. INSERT/UPDATE trong test chỉ diễn ra trong SQLite :memory:. Không thay timestamp cũ, precision, kiểu cột hoặc timezone tables. Không restart AI hoặc sửa dữ liệu/nghiên cứu.

Chưa kiểm chứng:
- Native MySQL fixture có bảng/records và HTTP OWNER đầy đủ trên dữ liệu vận hành.
- EXPLAIN/index selection và hiệu năng thực tế khi có nhiều năm/nhiều giao dịch, concurrent load/MVCC snapshot lâu. WHERE giữ bare timestamp/index-friendly nhưng không cam kết optimizer dùng index.
- Docker/production và mọi phiên bản ICU/Node; runtime IANA dựa tzdata/ICU, cần pin/kiểm môi trường khi release.
- Write-path/concurrency, session TTL trên tài khoản thật ở lượt này; auth code/UTC không thay, regression có DB write bị tắt.
- Inference hoặc chất lượng5AI, upstreamJan17/weights/snapshot/calendar AI. AI giữ nguyên, không tự coi đã đồng bộ vì BI đổi.
- Giới hạn TIMESTAMP2038 vẫn là hạn chế schema hiện có; chưa migration.
- Người dùng có thể thấy doanh thu từng ngày/tháng thay đổi do đổi cách chia lịch, dù raw timestamp và tổng toàn thời gian cùng tập giao dịch không đổi.

Khoảng all-time dài sinh nhiều batch128bucket; không có cutoff ngầm nhưng latency/read-snapshot cost phải benchmark trước release. Nếu cần index/schema/giới hạn khoảng mới phải duyệt riêng.

## 10. Dừng sau P1.3

Hoàn tất triển khai và kiểm thử trong phạm vi phê duyệt. Các mục tiếp theo chờ duyệt: kiểm queryplan/performance trên MySQL test cô lập, calendar AI, ngày hồi tố, hủy/hoàn, chuyển kho, giá vốn, snapshot/model hoặc Chatbot/RAG. Không tự triển khai hoặc tạo dữ liệu để kiểm tiếp.
