# P1 nghiệp vụ: validation ngày và lọc chứng từ — 06/11/2026

Trạng thái: hoàn tất đúng hai mục được phê duyệt. Không chuyển sang P1 khác hoặc P2.

## 1. Nguyên nhân và cách sửa

### Validation ngày

Trước sửa, period trong common.js chỉ kiểm regex YYYY-MM-DD. Do đó các chuỗi như 2023-02-29, 1900-02-29, 2024-04-31, năm 0000 và khoảng start>end vẫn được chấp nhận; lỗi có thể đến SQL hoặc trả kết quả không đúng kỳ người dùng yêu cầu.

Sau sửa:
- Xác minh số ngày từng tháng theo lịch Gregorian; năm nhuận chia hết cho 400 hoặc chia hết cho 4 nhưng không chia hết cho 100.
- Chấp nhận đúng định dạng 4 chữ số năm, từ 0001 đến 9999; từ chối năm 0000, năm 5 chữ số, thiếu zero-padding, chuỗi rỗng và phần giờ/timezone đính kèm.
- start/end vẫn tùy chọn; nếu có cả hai thì start<=end, cho phép cùng ngày.
- Lỗi trả HTTP 400, giữ response issues và đưa thông báo cụ thể về trường start/end vào message để giao diện hiện tại cũng đọc được.
- Không thay timezone, không chuẩn hóa ngày bằng Date để tránh tự cuộn ngày sai hoặc phụ thuộc timezone.

Bộ lọc thời gian dùng chung đổi end từ created_at<DATE_ADD(end,INTERVAL 1 DAY) sang created_at<=end 23:59:59.999999. Với ngày hợp lệ thông thường, ý nghĩa vẫn là trọn ngày cuối theo quy ước UTC hiện tại. Cách mới không cần cộng thêm ngày ở biên 9999-12-31, vốn có thể vượt phạm vi biểu diễn. Không sửa timestamp đã lưu hoặc thiết kế ngày nghiệp vụ.

### Bộ lọc danh sách sales/receipts

Trước sửa, handler danh sách gọi filters để lấy organization/branch/start/end và type, nhưng không áp dụng category_id/product_id dù period đã parse hai trường này. Các bộ lọc bị bỏ qua, count và list không phản ánh yêu cầu.

Sau sửa, cả COUNT và SELECT danh sách dùng chung điều kiện documentFilters và cùng mảng bind parameters. Khi có category/product, dùng EXISTS tương quan:
- item.document_id=d.id và item.organization_id=d.organization_id.
- Product nối theo cả id và organization_id.
- Category và product, nếu cùng được truyền, phải khớp trên cùng một dòng sản phẩm.
- EXISTS chỉ quyết định chứng từ có được chọn hay không; không nhân bản chứng từ theo số dòng phù hợp.
- Giữ bộ lọc organization từ user đăng nhập, branch assignment cho non-OWNER, branch_id, thời gian, type và ORDER BY id DESC.
- total là số chứng từ trước LIMIT/OFFSET; không phải số dòng item hoặc số lượng kết quả trên trang.

Không thay requireRoles, authenticate, tenantScope, branchClause hoặc quy tắc quyền. Khi chỉ lọc product/category, tổng tiền trả về vẫn là tổng của toàn bộ chứng từ được chọn, không phải tổng tiền riêng các dòng khớp; đây là API danh sách chứng từ. Không đổi công thức Dashboard/BI.

## 2. File đã sửa/thêm

| File | Nội dung |
|---|---|
| [backend/src/business/common.js](../backend/src/business/common.js) | Kiểm ngày Gregorian, thứ tự khoảng ngày, biên cuối ngày |
| [backend/src/business/ledger.js](../backend/src/business/ledger.js) | documentFilters và EXISTS cho danh sách sales/receipts, dùng chung count/list |
| [backend/src/app.js](../backend/src/app.js) | Thông báo 400 rõ ràng cho lỗi start/end; giữ issues và xử lý lỗi khác |
| [backend/test/period.test.js](../backend/test/period.test.js) | 47 unit test về ngày/bộ lọc/phân quyền branch hiện có |
| [backend/test/document-list.integration.test.js](../backend/test/document-list.integration.test.js) | 53 HTTP integration test với dữ liệu quan hệ cô lập |
| [docs/P1_DATE_AND_DOCUMENT_FILTERS_2026-11-06.md](P1_DATE_AND_DOCUMENT_FILTERS_2026-11-06.md) | Báo cáo này |
| [docs/RETAIL_INSIGHT_AUDIT_2026-11-06.md](RETAIL_INSIGHT_AUDIT_2026-11-06.md) | Ghi chú cập nhật P1 và liên kết báo cáo |

Không đổi package/dependencies, frontend, .env, migrations, AI hoặc cấu hình production.

## 3. API bị ảnh hưởng

| API | Thay đổi |
|---|---|
| GET /api/v1/sales | Category/product nay được áp dụng cùng tenant/branch/date; count và pagination nhất quán |
| GET /api/v1/receipts | Tương tự sales, giữ các vai trò được phép xem phiếu nhập |
| GET /api/v1/bi/overview | Nhận validation ngày và điều kiện end mới từ common.js; không đổi KPI hoặc timezone |
| GET /api/v1/inventory/movements | Nhận validation ngày và điều kiện end mới từ common.js |
| GET /api/v1/products, GET /api/v1/inventory | Dùng period chung nên ngày sai trong query bị từ chối; không thêm chức năng lọc ngày cho catalog/tồn hiện tại |

POST bán hàng/nhập kho và API chi tiết chứng từ không được sửa. Không tự bổ sung tìm kiếm, ngày hồi tố, hủy/hoàn, chuyển kho hoặc giá vốn.

Ví dụ lỗi HTTP sau sửa: start=2023-02-29 trả 400 với message nêu ngày bắt đầu không tồn tại; start=2024-03-01&end=2024-02-29 trả 400 với message nêu start<=end. issues vẫn chỉ ra field tương ứng. Những lỗi này được chặn trước câu SQL nghiệp vụ; việc xác minh session vẫn diễn ra trước như cơ chế hiện có.

## 4. Môi trường và cách ly kiểm thử

Node local 24.13.0, dùng node:sqlite tích hợp sẵn ở chế độ :memory:, không thêm thư viện. SQLite hiện có cảnh báo experimental; nó chỉ dùng trong test, không thay MySQL của ứng dụng.

Unit test chặn pool.query, pool.execute và pool.getConnection. Integration test:
- Tạo organization/user/branch/product/document/item/session tổng hợp trong RAM, không đọc dữ liệu nghiên cứu hoặc tài khoản thật.
- Chạy ứng dụng Express thật trên loopback/cổng tạm, qua JWT/session authentication, tenantScope và requireRoles thật.
- JWT dùng secret chỉ dành cho test, cấu hình trong tiến trình test; không lưu password hoặc cookie thật.
- Thay pool.execute bằng adapter chỉ cho SELECT trên SQLite trong RAM; pool.query/getConnection bị chặn. Cấu hình MySQL trong tiến trình test đặt host loopback/port 1 như lớp bảo vệ bổ sung.
- SQLite có hàm UTC_TIMESTAMP cho kiểm tra session; adapter dịch DATE_ADD cũ chỉ để chạy case trước sửa. SQL mới không còn DATE_ADD. Không kết nối MySQL thật trong test mới.
- Mọi dữ liệu fixture mất khi đóng :memory:. Không tạo file SQLite hoặc chứng từ trên retail_app.

Giới hạn: đây là integration HTTP + truy vấn SQL trên fixture SQLite, không phải kiểm thử native MySQL đang vận hành, không thay thế đánh giá query plan/performance MySQL hoặc write-path/concurrency. Việc dùng fixture cô lập đáp ứng yêu cầu không ghi database hiện tại; không tuyên bố đã tạo/bán hàng thật.

## 5. Kết quả trước/sau và regression

Hai bộ test mới được chạy trước khi sửa production source để xác nhận tái hiện lỗi.

| Bộ kiểm thử | Trước sửa PASS/FAIL | Sau sửa PASS/FAIL | SKIP sau sửa |
|---|---:|---:|---:|
| period.test.js | 25 / 22 | 47 / 0 | 0 |
| document-list.integration.test.js | 25 / 28 | 53 / 0 | 0 |
| Regression config.test.js | Không dùng làm baseline lỗi P1 | 5 / 0 | 0 |
| Regression origins.test.js | Không dùng làm baseline lỗi P1 | 9 / 0 | 0 |
| Regression origin-http.test.js | Không dùng làm baseline lỗi P1 | 6 / 0 | 0 |
| Regression bootstrap-owner.test.js | Không dùng làm baseline lỗi P1 | 9 / 0 | 0 |
| auth.integration.test.js | Không chạy DB | 0 / 0 | 1 |
| auth-rate-limit.test.js | Không chạy DB | 0 / 0 | 1 |
| operations.integration.test.js | Không chạy DB | 0 / 0 | 1 |
| Tổng lượt cuối | — | **129 / 0** | **3** |

Số lượng theo Node test runner, bao gồm test cha khi có subtest.

Các trường hợp đã kiểm:
- Ngày nhuận 2000/2024/2400 hợp lệ; 1900/2100 không nhuận; 29/02 năm thường, 30/02, 31/04, tháng/ngày 0 hoặc vượt giới hạn.
- Năm 0001 và 9999, ngày đầu/cuối năm, định dạng và khoảng đảo, start=end, bỏ một hoặc cả hai cận.
- Danh sách cả sales và receipts: không lọc; category; product; branch; ngày đơn; chỉ start/end; kết hợp toàn bộ.
- Category/product phải khớp cùng item; category/product/branch tenant khác không lộ dữ liệu.
- Chứng từ có hai dòng cùng category vẫn xuất hiện một lần; total=3 trong fixture ở mọi trang limit=1, kể cả trang vượt cuối rỗng.
- COUNT và SELECT có toàn bộ WHERE và bind parameters giống nhau.
- Giữ assignment CASHIER/INVENTORY, từ chối sai role 403, tenant override 403 và không có session 401.
- Ngày sai trả 400 cùng thông báo cụ thể, không chạy SQL stock_documents.

Lần chạy mặc định ban đầu gặp lỗi cấp phát bộ nhớ Windows/Node (VirtualAlloc/OOM), kể cả một lượt chạy concurrency=1. Thử --jitless không dùng được fetch/Undici do WebAssembly bị tắt; đây là lỗi cách chạy test, không sửa ứng dụng để né. Lượt cuối chạy từng file với --max-old-space-size=128, --test-isolation=none và --test-concurrency=1 đều đạt như bảng trên. Không dừng tiến trình khác hoặc sửa cấu hình hệ thống để giải phóng bộ nhớ.

### Lệnh tái chạy an toàn

Chạy từng file trong process riêng để các mock/env test không dùng chung với nhau:

~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\backend'
$env:RUN_DB_TESTS = '0'
$files = @(
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
~~~

Không bật RUN_DB_TESTS=1 hoặc chạy frontend E2E có đăng ký/DELETE fixture trên database hiện tại. Không cài SQLite server; chỉ test module tích hợp của Node.

## 6. Bảo vệ dữ liệu và phần chưa kiểm chứng

Không chạy migration, seed, bootstrap, API ghi hoặc câu INSERT/UPDATE/DELETE trên MySQL. Fixture/schema test chỉ được tạo trong SQLite RAM. Không thay tài khoản OWNER, organization, branch hoặc quyền. Không thay database nghiên cứu, AI Service, weights, snapshots, pipeline hoặc kết quả nghiên cứu. Không nhập bộ dữ liệu kiểm thử đã đề xuất trong audit.

Không thực hiện kiểm thử ghi hoặc kiểm thử native MySQL để lấy thêm bằng chứng, vì không thuộc phạm vi được duyệt. Không có truy vấn đo count trước/sau trên DB thật ở lượt P1 này; xác nhận không thay đổi DB dựa trên các thao tác thực hiện và cơ chế chặn kết nối của test, không trình bày là đã audit hash toàn bộ database.

Các mục tiếp tục chờ phê duyệt: timezone ngày kinh doanh; ngày nghiệp vụ/hồi tố; hủy/hoàn; chuyển kho/xuất điều chỉnh; định giá tồn/giá vốn; dữ liệu kiểm thử kinh doanh; MODEL_UNAVAILABLE/snapshot AI và mọi công việc AI/Chatbot/RAG. Việc thiếu weights hoặc lịch sử AI không được xử lý trong gói này.

Hoàn tất hai mục đã duyệt và dừng tại đây, không tự chuyển giai đoạn.
