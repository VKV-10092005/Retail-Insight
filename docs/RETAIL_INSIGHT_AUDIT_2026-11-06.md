# Kiểm tra tổng hợp Retail Insight — 06/11/2026

> **Hoàn tất P1.3 — 06/11/2026:** Báo cáo kinh doanh chuyển sang IANA `Asia/Ho_Chi_Minh`; lưu trữ/session vẫn UTC, movement dùng ngày chứng từ, AI giữ calendar cũ. Kết quả: **169 PASS, 0 FAIL, 3 SKIP** gồm 161 test Backend cô lập/regression, 5 native MySQL SELECT hằng và 3 test UI nhiều timezone. Không migration/seed/đổi dữ liệu. Xem [báo cáo triển khai P1.3](P1_3_BUSINESS_TIMEZONE_IMPLEMENTATION_2026-11-06.md). Các mô tả UTC của báo cáo cũ bên dưới là lịch sử trước P1.3.

> **Cập nhật P1 — 06/11/2026:** Đã hoàn tất đúng gói validation ngày Gregorian/start<=end và lọc danh sách sales/receipts theo category/product. Kiểm thử cô lập: **129 PASS, 0 FAIL, 3 SKIP** (ba test ghi MySQL bị tắt). Không sửa database, timezone hoặc AI. Xem [báo cáo P1](P1_DATE_AND_DOCUMENT_FILTERS_2026-11-06.md). Các mô tả lỗi ở mục 8 và đề xuất ở mục 14 là lịch sử trước khi triển khai; hai mục P1 này đã được sửa, các mục khác vẫn chờ duyệt.

> **Cập nhật P0 — 06/11/2026, 09:55 UTC+7:** AI Service đã được khởi động lại đúng `run.py`; live `/v1/readiness` với token hợp lệ trả **200**, thiếu/sai token trả **401**. Hai model vẫn thiếu weights. Người dùng đã xác nhận đăng nhập OWNER và gọi `/api/v1/ai/readiness` qua Vite bằng phiên thật trên 127.0.0.1:5173: **HTTP 200, PASS readiness**, response có models, algorithms và live_metrics:null. Đây là kiểm thử thủ công do người dùng cung cấp, chưa phải inference của 5 chức năng AI; verifier tự động login/me/reload/logout hai hostname vẫn chưa có kết quả đầy đủ. Xem [báo cáo xử lý P0](P0_AI_SERVICE_FIX_2026-11-06.md). Các kết quả 503 bên dưới là trạng thái audit **trước khi sửa**, được giữ làm lịch sử.

Phạm vi: sửa lỗi đăng nhập development; kiểm tra đọc database, nghiệp vụ, Dashboard/BI, năm chức năng AI; thiết kế Chatbot/LLM/RAG và lộ trình. Không migration, seed, tạo tài khoản, sửa giao dịch, cấp dataset, fit model, kích hoạt AI hoặc production. Thời điểm kiểm tra chính khoảng 09:32–09:45 ngày 06/11/2026, UTC+7; số liệu là ảnh chụp tại thời điểm đọc, không phải dữ liệu giám sát liên tục.

## 1. Kết luận và mức độ bằng chứng

| Kết luận | Trạng thái | Bằng chứng |
|---|---|---|
| Origin 127.0.0.1 bị chặn do allowlist một origin | Đã xác định và sửa trong development | CORS_ORIGIN thực tế là http://localhost:5173; middleware so sánh chuỗi đơn trước sửa; HTTP qua Vite sau sửa |
| Hai hostname vượt kiểm tra Origin, CSRF còn hoạt động | Đã kiểm chứng | POST rỗng 400; thiếu header 403; origin lạ 403; CORS phản chiếu đúng origin cho phép |
| Đăng nhập thủ công OWNER và readiness qua phiên thật | Người dùng xác nhận PASS trên 127.0.0.1; verifier hai hostname chưa đầy đủ | DevTools GET /api/v1/ai/readiness trả 200, có models/algorithms/live_metrics:null; không phải kiểm thử inference hoặc đủ chuỗi reload/logout |
| Database kinh doanh đang rỗng thật | Đã kiểm chứng bằng SELECT | Sáu bảng kinh doanh đều 0 toàn hệ thống |
| Dashboard/BI trả số 0 đúng với database hiện tại | Đã kiểm chứng handler + MySQL, chưa phải E2E OWNER | /bi/overview trả 200, orders 0, units 0, revenue 0.00, inventory 0 |
| FastAPI đang sống nhưng API bảo vệ bị chặn | Đã kiểm chứng HTTP thật | /health 200; /v1/readiness 503: AI service token chưa được cấu hình |
| Hybrid30/Stockout thiếu weights đang phục vụ | Đã kiểm chứng thư mục + registry trong TestClient | ai-service/models chỉ có README.md; registry trả MISSING_MODEL_ARTIFACT |
| Model tái tạo đã hoàn thành | Không đúng với bằng chứng hiện có | Manifest freeze: fit_attempts=0, models_created=0, activated=false |
| Chatbot/LLM/RAG hiện đã chạy | Chưa triển khai trong luồng ứng dụng đang dùng | /assistant là ComingSoon; không có route chat/vector/LLM backend |

Phân biệt cách kiểm tra: các handler nghiệp vụ được mount trong một Express harness tạm ở loopback, với ngữ cảnh OWNER đọc từ database, chỉ gọi GET. Harness bỏ qua bước đăng nhập để kiểm tra SQL/response có kiểm soát; nó KHÔNG chứng minh xác thực, cookie hoặc browser E2E. Không thêm đường bypass vào Backend thật. FastAPI TestClient dùng cấu hình file trong tiến trình kiểm tra riêng; kết quả này KHÔNG có nghĩa tiến trình cổng 8000 đã được sửa.

## 2. Sửa đăng nhập và kiểm thử

### 2.1. Nguyên nhân

[env.js](../backend/src/config/env.js) đọc một CORS_ORIGIN. [app.js](../backend/src/app.js) trước sửa dùng giá trị đó cho CORS và kiểm tra req.headers.origin !== config.origin. Origin gồm scheme, hostname và port; localhost và 127.0.0.1 là hai origin khác nhau. backend/.env thực tế: NODE_ENV=development, CORS_ORIGIN=http://localhost:5173, MYSQL_DATABASE=retail_app. Không in secret trong .env.

[frontend/vite.config.js](../frontend/vite.config.js) proxy /api tới http://localhost:3000. Proxy hiện hoạt động cho cả hai địa chỉ frontend; không phát hiện cần thay Vite. Trình duyệt gửi Origin của frontend và Backend kiểm tra header đó. Đây là lỗi allowlist, không phải sai mật khẩu hoặc lỗi MySQL.

### 2.2. Thay đổi

| File | Thay đổi |
|---|---|
| [backend/src/config/origins.js](../backend/src/config/origins.js) | Hàm allowlist; thêm đúng hai loopback origin chỉ khi NODE_ENV=development; từ chối wildcard hoặc chuỗi không phải origin HTTP(S) hợp lệ |
| [backend/src/config/env.js](../backend/src/config/env.js) | Xuất config.origins từ chính sách chung; giữ config.origin |
| [backend/src/app.js](../backend/src/app.js) | CORS và middleware Origin cùng dùng config.origins; giữ header X-Requested-With=retail-web |
| [backend/test/origins.test.js](../backend/test/origins.test.js) | Kiểm tra development, production/test/unset, origin sai |
| [backend/test/origin-http.test.js](../backend/test/origin-http.test.js) | Kiểm tra HTTP CORS/CSRF và từ chối origin giả mạo, không ghi DB |
| [backend/src/cli/verify-dev-login.js](../backend/src/cli/verify-dev-login.js) | Verifier Edge headless, người vận hành nhập tài khoản hiện có và mật khẩu ẩn; không lưu thông tin xác thực |
| [backend/package.json](../backend/package.json) | Thêm verify:auth:dev |

Không sửa backend/.env, Vite proxy, cookie, mật khẩu hoặc quyền. Production/test/unset không tự nhận thêm loopback alias: chỉ CORS_ORIGIN cấu hình sẵn được phép. Không dùng wildcard hoặc tắt CSRF. Không deploy production.

Cookie hiện ở [auth.js](../backend/src/routes/auth.js): host-only vì không đặt Domain; HttpOnly; SameSite=Lax; Path=/api; hết hạn 8 giờ; Secure khi production. Cookie của localhost không dùng chung cho 127.0.0.1. Phải đăng nhập riêng và dùng nhất quán từng hostname. Hai cửa sổ trên hai host có thể giữ hai phiên riêng.

[AuthContext.jsx](../frontend/src/auth/AuthContext.jsx) gọi /me khi khởi động, login rồi refresh, logout rồi xóa user state; [Login.jsx](../frontend/src/pages/Login.jsx) điều hướng về / khi đã có user. [auth.js frontend](../frontend/src/services/auth.js) dùng URL tương đối và credentials:include. Đây là bằng chứng mã nguồn; reload và logout thành công với OWNER thật còn chờ verifier.

### 2.3. Kết quả đã chạy

| Kiểm tra qua Vite cổng 5173 | localhost | 127.0.0.1 |
|---|---:|---:|
| /api/health, có kết nối MySQL | 200 | 200 |
| POST /auth/login, body rỗng + CSRF header | 400 | 400 |
| POST /auth/login, thiếu CSRF header | 403 | 403 |
| POST /auth/login, email kiểm tra không tồn tại | 401 | 401 |
| GET /auth/me, không có cookie | 401 | 401 |
| POST /auth/logout, không có cookie | 401 | 401 |
| Trình duyệt Edge mở / khi chưa đăng nhập | Chuyển /login, form hiện | Chuyển /login, form hiện |
| Edge gửi email kiểm tra không tồn tại | 401, không lỗi Origin, không cookie | 401, không lỗi Origin, không cookie |
| Login/me/logout thành công bằng OWNER thật | Chưa có kết quả verifier đầy đủ | Người dùng xác nhận login thủ công và readiness 200; chưa có kết quả đầy đủ me/reload/logout |

Origin http://evil.invalid, http://localhost:5173.evil.invalid và null bị từ chối 403 ở kiểm thử HTTP. CORS của Backend trả đúng origin được phép và Access-Control-Allow-Credentials:true; preflight trực tiếp Backend 204. Vite có middleware preflight riêng nên không dùng header OPTIONS của Vite để suy ra cookie hoạt động.

Lệnh đã chạy trong backend: node --test test/config.test.js test/origins.test.js test/origin-http.test.js — 20 kiểm thử đạt. Một lần đầu chạy HTTP test từ thư mục gốc đã bị guard MYSQL_DATABASE chặn vì .env được tìm theo cwd; chạy lại đúng backend đạt. Không bỏ guard để vượt lỗi.

Để kiểm chứng tài khoản thật, chạy tại terminal tương tác:

~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\backend'
npm.cmd run verify:auth:dev
~~~

Verifier dùng Edge đã có qua Playwright của frontend, không cài browser, không tạo tài khoản. Nó kiểm tra login 200, /me 200 và OWNER, redirect, HttpOnly/host/path/SameSite, reload, /users 200, logout 204, /me sau logout 401 cho từng hostname. Không bật trace, video hay screenshot; không ghi email/password vào fixture. Login thật sẽ tạo/thu hồi phiên và cập nhật last_login_at theo luồng xác thực. Nếu thất bại, script báo kiểm thử chưa hoàn tất và cố logout phiên còn lại. Không gửi mật khẩu vào chat.

## 3. Database vận hành

MySQL phiên bản thực tế 9.7.0. Có 13 bảng ứng dụng, tất cả InnoDB; tên bảng đối chiếu SHOW TABLES, information_schema.KEY_COLUMN_USAGE và migrations 001_auth.sql, 002_operations.sql. Không chạy migration.

| Bảng/phạm vi | Toàn retail_app | Riêng Cửa hàng Admin |
|---|---:|---:|
| organizations | 2 | 1, id 45, ACTIVE |
| branches | 2 | 1, id 48, ACTIVE |
| users | 2 | 1, id 54, OWNER, ACTIVE |
| user_branch_roles | 2 | 1, user 54 → branch 48, OWNER |
| categories | 0 | 0 |
| products | 0 | 0 |
| inventory_balances | 0 | 0 |
| stock_documents loại RECEIPT | 0 | 0 |
| stock_documents loại SALE | 0 | 0 |
| stock_document_items | 0 | 0 |
| inventory_movements | 0 | 0 |
| organization_dataset_access | 0 | 0 |

Organization 45 và branch 48 đều tên Cửa hàng Admin. Hệ thống còn organization 46 với branch 49 và một OWNER khác; giữ nguyên, không gộp hoặc chỉnh sửa. Không đưa thông tin xác thực vào báo cáo.

“Đơn hàng” hiện được biểu diễn bằng stock_documents.type=SALE; chi tiết trong stock_document_items. “Nhập kho” là RECEIPT. Không có bảng orders độc lập, trạng thái đơn, hoàn trả hoặc snapshot dự báo trong schema thực tế đang kiểm tra.

Truy vấn sử dụng: SELECT COUNT(*) trên từng bảng; GROUP BY organization_id; GROUP BY organization_id,branch_id,type trên stock_documents; SUM(quantity) trên inventory_balances. Với sáu bảng kinh doanh rỗng toàn hệ thống, mọi phạm vi tổ chức/chi nhánh hiện đều không có giao dịch; không suy ra khả năng tính đúng trên dữ liệu khác 0.

Khóa ngoại composite bảo vệ cùng organization cho user/branch, chứng từ/branch/người thực hiện, item/document/product và movement/document/product/branch. UNIQUE product_sku(organization_id,sku), document_request(organization_id,type,request_key), document_product(document_id,product_id), email toàn cục. OWNER có quyền mọi chi nhánh ACTIVE trong tổ chức; user_branch_roles bootstrap cũng khớp. Chưa thử chèn sai FK hoặc tạo dữ liệu cross-tenant trên DB này.

## 4. Nghiệp vụ và cách ly dữ liệu

| Chức năng | Backend, Frontend | Phân loại và bằng chứng |
|---|---|---|
| Danh mục | GET/POST /categories; operations/Products.jsx | Đã triển khai; GET+MySQL 200 items rỗng; POST chỉ đọc mã, chưa kiểm thử ghi |
| Sản phẩm | GET/POST /products, PUT /products/:id; Products.jsx | CRUD một phần: thêm/sửa/tìm SKU hoặc tên/lọc category, ACTIVE/DISABLED; GET 200; chưa thử ghi |
| Import CSV | POST /products/import preview/commit; ProductImport.jsx | Đã triển khai, có preview hash, giới hạn 200 dòng/60 KB, transaction; chưa chạy commit hoặc nhập dữ liệu |
| Kho chi nhánh | GET /inventory, /inventory/movements; Ledger.jsx | GET+MySQL 200 rỗng; có bộ lọc tenant/branch/category/product |
| Nhập kho | POST /receipts; Ledger.jsx | Mã có transaction, đơn giá từng dòng, tăng balance và movement; chưa kiểm thử ghi thực tế |
| Xuất kho | POST /sales trừ kho | Có xuất qua bán hàng; chưa có nghiệp vụ xuất điều chỉnh, chuyển kho hoặc hao hụt độc lập |
| Bán hàng | POST/GET /sales, GET /sales/:id; Ledger sale | Có giá bán phía server, kiểm tra tồn, khóa FOR UPDATE, idempotency, chứng từ nội bộ; GET list 200, chưa tạo hóa đơn |
| Nhân viên | GET/POST /staff, PATCH /staff/:id; Management staff | Có tạo/gán branch/khóa tài khoản; GET 200 chỉ OWNER hiện có; chưa thử thay quyền |
| Chi nhánh | GET/POST /branches, PUT /branches/:id; Management | Có API và giao diện; xác nhận bản ghi thật, chưa sửa/thêm |
| Tổ chức/tài khoản | /dashboard/overview; Account.jsx | Hiển thị thông tin thật; chưa có màn hình/API chỉnh sửa organization đầy đủ |
| Quên mật khẩu | /auth/forgot-password | Có giao diện nhưng API cố ý 503 vì chưa tích hợp email |
| Giá/thị trường, Trợ lý AI | /market, /assistant | ComingSoon, chưa có nghiệp vụ thật |
| Thông báo | AppLayout.jsx | Nút giao diện, title ghi chưa có thông báo thật |
| Trang demo cũ | frontend/src/pages, data/mockData.js | Còn mã mock/lịch sử; App.jsx hiện dùng operations, không lấy mockData cho Dashboard/AI đang chạy |

Bằng chứng nghiệp vụ: [catalog.js](../backend/src/business/catalog.js), [ledger.js](../backend/src/business/ledger.js), [product-import.js](../backend/src/business/product-import.js), [App.jsx](../frontend/src/app/App.jsx). Không phân loại API ghi là “hoàn chỉnh đã kiểm thử” chỉ vì có source.

[authenticate](../backend/src/middlewares/auth.js) xác minh JWT HS256/issuer/audience, session chưa hết hạn/chưa revoke, user và organization ACTIVE; vai trò lấy từ DB. tenantScope từ chối organization_id khác từ header/query/body, lấy organization thật từ user. requireRoles chặn vai trò ở Backend. branchScope/assertBranch xác nhận branch cùng organization/ACTIVE và assignment cho non-OWNER. branchClause thêm EXISTS theo assignment cho danh sách chứng từ/kho/BI. Product/category là dữ liệu catalog chung tổ chức, không phải kho riêng branch.

Harness đọc với user 54/org45: /products?organization_id=46 → 403; /research/datasets → 200 items []; /research/nckh-2022-2023/runs → 403. Đây là bằng chứng kiểm tra tenant/dataset handler, chưa phải kiểm thử đầy đủ mọi vai trò hoặc mọi cặp chi nhánh. Không tạo user/tenant khác để thử.

## 5. Dashboard và BI

Dashboard / và /reports cùng dùng [operations/Dashboard.jsx](../frontend/src/operations/Dashboard.jsx), lấy /bi/overview cho OWNER/MANAGER. /dashboard/overview chỉ trả tên organization và số branch, không phải API doanh thu. [bi.js](../backend/src/business/bi.js) dùng pool retail_app, source=OPERATIONAL; không đọc kho dữ liệu nghiên cứu.

| Chỉ số | Công thức/nguồn |
|---|---|
| Doanh thu | SUM(item.quantity * item.unit_price) cho document.type=SALE |
| Đơn hàng | COUNT(DISTINCT document.id), tránh đếm lặp theo dòng |
| Sản lượng | SUM(item.quantity) trên SALE |
| Tồn hiện tại | SUM(inventory_balances.quantity), không hồi tố theo bộ lọc ngày |
| Doanh thu ngày/tháng | DATE_FORMAT(created_at) với grain day/month |
| Chi nhánh/danh mục | SUM giá trị dòng bán, GROUP BY branch/category |
| Bán chạy | SUM quantity, ORDER DESC, tối đa 10 |
| Bán chậm | Sản phẩm ACTIVE LEFT JOIN tổng bán trong kỳ, bao gồm 0 |
| Nhập/xuất | Movement dương là incoming, âm là outgoing, nhóm theo ngày |
| Giá trị tồn | null, chưa có phương pháp định giá được xác nhận |

filters trong [common.js](../backend/src/business/common.js): tenant bắt buộc, branch assignment, created_at >= start và < end+1 ngày. BI bổ sung category_id/product_id; inventory cùng các bộ lọc danh mục/sản phẩm/chi nhánh nhưng cố ý không áp dụng start/end. Query dùng tham số cho giá trị; granularity chỉ chọn hai định dạng cố định.

Kết quả MySQL+handler thật: /bi/overview và cùng API với branch_id=48,start=2026-11-01,end=2026-11-06,granularity=month đều 200; orders=0, units=0, revenue=0.00, inventory.quantity=0; trend/by_branch/by_category/top/slow/movements đều []. Frontend chuyển số chuỗi DECIMAL sang Number khi định dạng và có empty state khi mảng rỗng. Chưa thấy bằng chứng frontend làm mất dữ liệu khác 0; chưa thể chứng minh mọi tổng khi chưa có giao dịch.

Không có trạng thái đơn hủy/return trong schema và routes; SALE được commit là giao dịch được tính doanh thu. Chưa hỗ trợ hủy/hoàn để loại/trừ doanh thu. Không được diễn giải hiện tại đã xử lý nghiệp vụ này.

Session MySQL time_zone=+00:00. Bộ lọc và group ngày theo UTC; Frontend ghi rõ mốc ngày UTC, một số thời gian chứng từ hiển thị theo local. Nếu muốn “ngày kinh doanh Việt Nam/UTC+7”, cần duyệt quy ước và sửa đồng bộ; hiện có nguy cơ lệch ngày ở khoảng 00:00–06:59 giờ địa phương. Đây không phải nguyên nhân bảng hiện rỗng.

## 6. Nguồn nghiên cứu, FastAPI và artifacts

### 6.1. Nghiên cứu

npm.cmd run check:research thực tế trả status=ok, privileges=SELECT_ONLY, cả retail_management và retail_datawarehouse. [research.js](../backend/src/db/research.js) từ chối root, quyền rộng/ghi/delegation/role; chỉ cho SELECT định nghĩa trước.

| Nguồn đọc | Số dòng thực tế |
|---|---:|
| retail_management.products | 94.867 |
| retail_management.ai_forecast_runs | 2 |
| retail_management.ai_forecast_sku_results | 54.822 |
| retail_datawarehouse.dim_product | 94.867 |

Đây là dữ liệu nghiên cứu, không thuộc Admin. organization_dataset_access không có bản ghi. Không cấp quyền hoặc sao chép. Trạng thái /research của tổ chức không được phép là đúng thiết kế, không phải mất dữ liệu.

data/research/manifest.json và các file đã vượt kiểm checksum khi TestClient gọi /v1/research/runs. Có hai archive MA2/AUTO, mỗi archive 27.411 SKU dự báo tháng 08/2023, inference_ready=false. Chúng là kết quả lịch sử, không phải Hybrid30 weights, không phải kết quả mới của Admin.

### 6.2. AI service hiện chạy

| Kiểm tra | Kết quả |
|---|---|
| Backend AI_SERVICE_URL | http://127.0.0.1:8000 |
| Token trong hai file cấu hình | Có, đủ tối thiểu 32 ký tự, khớp nhau; không xuất giá trị |
| GET live /health | 200, training_enabled=false |
| GET live /v1/readiness có token Backend | 503, “AI service token chưa được cấu hình” |
| Backend AI handlers → live service | /ai/readiness và cả 5 task /ai/forecast đều 503 |
| TestClient riêng nạp file cấu hình qua run.py | /v1/readiness 200, thiếu hai model |
| Thư mục models của registry trong kiểm tra | ai-service/models, chỉ README.md |

protect trong [main.py](../ai-service/app/main.py) chỉ phát thông báo trên khi AI_SERVICE_TOKEN ở môi trường tiến trình dài dưới 32. Do đó cấu hình file và môi trường tiến trình live không đồng nhất. Chưa xác định chính xác lệnh/parent nào đã khởi động tiến trình này; không khẳng định lý do startup ngoài bằng chứng đó. [run.py](../ai-service/run.py) có đọc .env; gọi uvicorn trực tiếp không tự có logic này. Chỉ đề xuất kiểm tra launcher và khởi động lại đúng run.py sau phê duyệt. Không thay token hoặc dừng service hiện có.

TestClient được nạp đúng cấu hình đã cho tách lớp lỗi kết nối/token khỏi lỗi model/dữ liệu. Không kích hoạt service khác hoặc model mới.

### 6.3. Weights và tái tạo

[models.py](../ai-service/app/models.py) cần hybrid.manifest.json và stockout.manifest.json, version, đúng feature_order, checksum, feature_name_ của estimator; Hybrid blend .25/.75 và Stockout threshold .3299. Không tìm thấy joblib/pkl/onnx/pt/pth trong cây dự án được kiểm tra, ngoài thư mục dependency đã loại trừ; không tuyên bố đã tìm mọi ổ đĩa/runtime bên ngoài.

[Manifest freeze](../artifacts/reproductions/historical-freeze-20261104T185832Z/manifest.json): FROZEN_TRAINING_BLOCKED_MEMORY, 0/18 fit, models_created=0, activated=false. Có frozen_features.parquet, feature_metadata, ordered_keys/splits và verification. Chúng là dữ liệu/features/splits, không phải weights. [Báo cáo trước](HISTORICAL_REPRODUCTION_REPORT.md) nêu gate RAM và chưa có reload parity/reference prediction. Không đo lại RAM để suy ra model đã được tái tạo.

[Phương án nghiên cứu](MODEL_REPRODUCTION_PLAN.md) ghi General L1 và Specialist L1 (regression_l1), cặp Hybrid30 và Jan17 riêng. File V3 đã từng audit ở nguồn bên ngoài là L2, 20 features, không tương đương Hybrid30 hoặc Stockout. Lần này không nạp, thay thế hoặc kích hoạt V3. Không có bằng chứng weights gốc Hybrid30/Jan17/classifier đã tìm lại hoặc weights tái tạo đã hoàn thành.

## 7. Bảng bảy thành phần và nguyên nhân

Mọi /api/v1/ai/* ở Backend đều qua authentication và requireRoles OWNER/MANAGER. Frontend không giữ service token. Endpoint /v1/* FastAPI cần Bearer service token; /health không kiểm tra model.

| Thành phần | Dữ liệu đầu vào | Model/weights | Backend API | FastAPI | Frontend | Nguyên nhân chưa có dữ liệu | Hướng xử lý, trạng thái |
|---|---|---|---|---|---|---|---|
| Dashboard | SALE/items, balances/movements của tenant | Không cần | /bi/overview và /dashboard/overview | Không dùng cho KPI bán hàng | / → Dashboard.jsx | Sáu bảng kinh doanh 0 thật | Đã triển khai, thiếu giao dịch; giữ empty state |
| BI | Cùng dữ liệu, bộ lọc tenant/branch/date/category/product | Không cần | /bi/overview | Không dùng cho biểu đồ BI | /reports → Dashboard.jsx | SQL trả 0 và [] đúng dữ liệu hiện tại | Handler+DB đã kiểm chứng rỗng; số khác 0 chưa kiểm chứng |
| SKU | ≥6 tháng đầy đủ, thuộc tính/category contract, feature giá/cohort | Hybrid30 General/Specialist thiếu | /ai/forecast?task=sku | /v1/operational → sku_forecast; có /v1/sku | /forecast | Live 503 token; độc lập còn thiếu weights, sản phẩm, lịch sử/attributes | Đã triển khai adapter, chưa inference thật; bàn giao model và dữ liệu hợp lệ |
| Tổng nhu cầu | SKU forecast + actual tháng trước + snapshot forecast đóng băng | Phụ thuộc Hybrid, không có weights riêng cho phép hiệu chỉnh | task=total | /v1/operational; có /v1/total | /forecast/total | Token; thiếu Hybrid, lịch sử và snapshot; operational code luôn báo thiếu snapshot sau khi có SKU forecast | Chưa có lưu/đọc snapshot; cần thiết kế/migration riêng được duyệt |
| Bổ sung | Forecast SKU và tồn ở đầu kỳ dự báo | Thuật toán không cần weights, nhưng forecast cần Hybrid | task=replenishment | /v1/operational → recommend; /v1/replenishment | /replenishment | Token; thiếu forecast, tồn và lịch sử | Đã có công thức; chưa hoạt động end-to-end với input thật |
| Thiếu hàng | 7 feature, tồn, 6 tháng, forecast upstream đã kiểm chứng | Classifier Stockout V1 và upstream Jan17 thiếu | task=stockout | /v1/operational → stockout; /v1/stockout | /alerts | Token, model/data thiếu; adapter dùng Hybrid30 chưa tương đương Jan17 | Chưa sẵn sàng; chặn kích hoạt, cần xác minh upstream riêng |
| Nhiều tháng | 12 tháng tổng nhu cầu liên tục đã quan sát, origin là tháng hoàn tất | Seasonal+Trend không cần weights | task=multi | Backend gọi /v1/multi trực tiếp | /forecast/multi | Token live; TestClient đúng config trả INSUFFICIENT_HISTORY; cửa hàng mới chưa có lịch sử | Thuật toán có, thiếu dữ liệu; không phải lỗi weights |

### 7.1. Hybrid30

Thứ tự HYBRID_FEATURES trong [algorithms.py](../ai-service/app/algorithms.py) và feature builder có 30 phần tử đúng danh sách nghiên cứu. Inference dựng DataFrame theo đúng thứ tự; feature category lấy từ manifest, từ chối category chưa biết. Specialist gate: tổng clean_lag_1/2/3 >0 và zero_ratio_6<.5. Trong gate: .25*general+.75*specialist; ngoài gate: general; prediction clip không âm.

Chưa thể xác minh weights dùng objective L1, category levels/dtypes và parity thật vì không có weights. Registry hiện không kiểm chứng objective regression_l1 hoặc đầy đủ upstream/category contract; tên feature đúng chưa đủ chứng minh model đúng. Hằng CATEGORICAL có launch_year trong khi recipe nghiên cứu xếp launch_year numeric; inference thực tế dùng manifest.categories, nên đây là điểm cần thống nhất hợp đồng trước activation, không phải bằng chứng đã suy luận sai hôm nay.

Backend lấy origin mặc định tháng trước; chỉ dùng tháng đầy đủ bắt đầu sau tháng organization/product được tạo. Admin tạo tháng 11/2026 nên observation_start của tổ chức là 2026-12; origin mặc định hiện 2026-10 không có lịch sử. SKU còn cần 6 tháng đầy đủ theo product và 10 attributes thật; không tự ánh xạ category mới sang category nghiên cứu.

Trạng thái thực thi hiện là UNAVAILABLE + reason MISSING_MODEL_ARTIFACT, chưa có mã literal MODEL_UNAVAILABLE như yêu cầu. Không fallback MA2 hoặc V3. Đề xuất chuẩn hóa mã API/UI sau phê duyệt; không sửa trong lượt này.

### 7.2. Tổng nhu cầu

corrected_totals dùng actual/predicted của tháng trước liên tiếp, clamp hệ số [0.8,2.0], nhân dự báo tháng hiện tại; không dùng actual tương lai. Thiếu tháng trước/forecast trước hoặc mẫu số không dương thì corrected=null. Endpoint /v1/total thực hiện công thức nhưng operational task=total chưa có đường lấy snapshot, trả MISSING_PREVIOUS_FORECAST_SNAPSHOT sau khi SKU forecast sẵn sàng. Schema retail_app hiện không có forecast run/snapshot. Vì vậy chỉ sửa token và thêm vài hóa đơn chưa đủ làm AI-2 hoạt động.

### 7.3. Bổ sung

Công thức hiện tại: target=ceil(predicted)+ceil(0.2*predicted), recommended=max(0,target-stock). Không hoàn toàn giống ceil(1.2*predicted) ở mọi trường hợp; code/test bảo vệ cách làm tròn theo notebook. Thiếu forecast/stock giữ null với lý do, không gợi ý giả.

Tồn AI là tổng movement trước đầu tháng dự báo, không phải tồn hiện tại. Nếu thiếu bản ghi của một branch thuộc phạm vi thì stock=null. Chưa có tham số lead time/MOQ/lô đặt hàng do người dùng cấu hình hoặc quy trình duyệt đề xuất thành phiếu nhập. Không tự đổi chính sách 20%.

### 7.4. Stockout V1

Đúng 7 tên feature theo thứ tự: risk_score_2, risk_score_3, sales_volatility_6, active_months_6, inventory_days_cover, historical_mean_3, stock_units. Hàm tính có std ddof=1, active count, mean3; classifier dùng predict_proba và threshold .3299, nhãn STOCKOUT_PROXY.

Nghiên cứu Stockout V1 yêu cầu forecast Jan17: 17 feature đầu của danh sách Hybrid, category khác, hard switch General/Specialist, không blend 25/75 Hybrid30. Adapter operational hiện gọi SKU Hybrid30 trước rồi tạo stockout_features; không có Jan17 endpoint/registry riêng hay gate upstream_pipeline_id. Tên 7 feature khớp không chứng minh phân phối input hoặc F1 lịch sử tương đương. Cần giữ chưa sẵn sàng đến khi có đúng upstream, classifier, threshold đầy đủ và reference input/output. Không gọi F1 lịch sử là độ chính xác trên Admin.

### 7.5. Seasonal+Trend

Cần 12 tháng liên tục kết thúc tại origin; dự báo 1–3 tháng dùng tháng cùng kỳ năm trước nhân trend=mean3 gần nhất/mean3 trước đó, clamp [0.85,1.15]. Nếu mean trước bằng 0, trend=1. Không cần file model. TestClient với lịch sử rỗng trả INSUFFICIENT_HISTORY, required_months=12, items=[]; không phát hiện lỗi thực thi trên case này.

Năm kiểm thử Algorithms đã chạy đạt: bổ sung/làm tròn/missing, hiệu chỉnh nhân quả/clamp, seasonal horizons/không dùng tương lai, schema stockout, không padding lịch sử trước khi sản phẩm được quan sát. Test sử dụng dữ liệu trong bộ nhớ; không đưa dự báo kiểm thử lên giao diện/database. Không phải xác nhận độ chính xác model thật.

### 7.6. Tích hợp và frontend

[operations/AI.jsx](../frontend/src/operations/AI.jsx) gọi /ai/forecast, /ai/readiness, products, research/datasets; có loading/error/empty và status UNAVAILABLE, INSUFFICIENT_HISTORY, INSUFFICIENT_DATA, SELECT_PRODUCT, READY. /ai/summary tổng hợp cả 5 task bằng Promise.all: một task lỗi HTTP khiến toàn summary thất bại; các KPI bán hàng vẫn từ /bi/overview riêng.

Nếu chọn origin lịch sử, operational SKU/total/replenishment/stockout trả HISTORICAL_PRODUCT_ATTRIBUTE_SNAPSHOTS_NOT_AVAILABLE; không tự dùng giá/thuộc tính hôm nay để tạo forecast quá khứ. Multi có đường riêng dùng lịch sử aggregate.

Không phát hiện mockData được import trong các component operations đang chạy. Đồ thị trend tổng/multi lấy month; BI lấy period. Model vắng hiện không bị biến thành số 0. Chưa chạy giao diện AI với OWNER thật ở lượt này; không tuyên bố đã kiểm thử đủ mọi interaction.

## 8. Các lỗi/thiếu sót phát hiện, chưa sửa

| Ưu tiên | Vấn đề | Bằng chứng và phương án xin duyệt |
|---|---|---|
| P0 AI | Live token không được nạp đúng | protect trả 503 dù file khớp; kiểm tra launcher/env và restart đúng run.py, rồi gọi readiness; không đổi secret tùy tiện |
| P0 model | Thiếu Hybrid30, Jan17, Stockout weights | Models chỉ README; ưu tiên tìm lại/export weights đã có, kiểm hash/category/objective/reference; mọi fit/activation phải duyệt riêng |
| P0 model | Stockout adapter chưa tương đương Jan17 | main.py operational dùng Hybrid30; thiết kế gate upstream và adapter đúng, không đổi ngầm |
| P1 AI-2 | Thiếu schema/logic snapshot forecast | Không có bảng run/snapshot; cần migration được duyệt và pipeline chốt snapshot nhân quả |
| P1 API | Model unavailable chưa có mã MODEL_UNAVAILABLE | Response hiện UNAVAILABLE/MISSING_MODEL_ARTIFACT; thống nhất contract Backend/FastAPI/UI |
| P1 nghiệp vụ | Lọc category/product trên danh sách sales/receipts chưa áp dụng | ledger.js list dùng filters tenant/branch/date nhưng không thêm category/product, dù period nhận hai trường; cần join/EXISTS và kiểm thử không đếm trùng |
| P1 thời gian | Ngày BI theo UTC, nhu cầu kinh doanh có thể UTC+7 | common.js/DATE_FORMAT, UI hiển thị UTC; cần chốt timezone trước sửa |
| P1 validation | Bộ lọc ngày chỉ regex, chưa kiểm ngày lịch hoặc start<=end | common.js period; cần validation hợp lệ và response 400, không đổi DB |
| P1 vận hành | Chưa có ngày nghiệp vụ nhập từ người dùng | documentSchema strict không có created_at/date; không thể nhập hợp lệ hóa đơn nhiều ngày quá khứ qua API hiện tại |
| P1 nghiệp vụ | Thiếu hoàn trả/hủy/chuyển kho/xuất điều chỉnh và valuation | Không có routes/schema tương ứng; cần thiết kế đối ứng ledger trước dọn giao dịch thử |
| P2 BI | Phân nhóm category theo catalog hiện tại | bi.js JOIN products hiện tại; đổi category sẽ phân loại lại lịch sử; cần chốt yêu cầu snapshot |
| P2 AI | ModelRegistry chưa gate objective/category/upstream đầy đủ | models.py mới kiểm hash/name/order/blend/threshold; bổ sung hợp đồng sau duyệt |
| P2 UX | Summary AI all-or-nothing; selector limit 100; reset trang theo một số bộ lọc chưa đồng nhất | Source AI summary/operations; cần cải thiện riêng khi được duyệt |
| P2 docs | Phần bootstrap DEPLOYMENT.md trước đây bị mất dấu | Do lần ghi qua pipeline encoding trước, không phải MySQL; sẽ giữ hướng dẫn có dấu trong báo cáo này, việc chỉnh phần cũ chỉ là tài liệu |

Không coi thiếu dữ liệu là lỗi query. Cũng không coi mã nguồn tồn tại là đã hoàn tất nghiệp vụ. Không sửa bất kỳ mục nghiệp vụ/AI nào ở bảng trên.

## 9. Kế hoạch dữ liệu kiểm thử — chưa nhập

Chỉ dành cho organization 45, branch 48 sau khi được phê duyệt. Không cấp dataset nghiên cứu. Prefix TEST-RI-<run>- trong category, SKU, note/request_key để nhận diện; lưu danh sách ID được tạo trong manifest kiểm thử sau này. Schema hiện chưa có test_run flag; dashboard mặc định sẽ cộng giao dịch test vào tổng, cần công bố rõ và dùng bộ lọc category/product/khoảng ngày riêng. Không trình bày thành số liệu kinh doanh thật.

| SKU mẫu, tiền tố sẽ chốt sau | Danh mục kiểm thử | Giá nhập | Giá bán | Phiếu nhập mở đầu |
|---|---|---:|---:|---:|
| ...-A, Áo A | Áo | 60.000 | 100.000 | 20 |
| ...-B, Quần B | Quần | 120.000 | 200.000 | 15 |
| ...-C, Vớ C | Phụ kiện | 30.000 | 50.000 | 30 |
| ...-D, Mũ D | Phụ kiện | 40.000 | 80.000 | 10 |

Tồn ban đầu trước phiếu nhập là 0; không ghi trực tiếp inventory_balances. Một RECEIPT mở đầu tổng 75 đơn vị, 4.300.000đ; phiếu RECEIPT tiếp theo A10+C20, 30 đơn vị, 1.200.000đ. Tổng nhập 105 đơn vị, 5.500.000đ.

| Ngày thực hiện dự kiến | Một SALE qua API hợp lệ | Doanh thu | Units |
|---|---|---:|---:|
| D1 sau phê duyệt | A3+B1+C2 | 600.000 | 6 |
| D2, ngày kế tiếp | A2+C5 | 450.000 | 7 |
| D3, ngày tiếp theo | B2+C1 | 450.000 | 3 |

Kỳ vọng toàn bộ ba ngày: 3 đơn, 16 units, doanh thu 1.500.000đ. Doanh thu SKU A500.000, B600.000, C400.000, D0; bán chạy theo units C8,A5,B3; D không bán. Tồn A25,B12,C42,D10, tổng 89. Hai phiếu nhập có 6 dòng, ba phiếu bán có 7 dòng; tổng 5 documents, 13 items và 13 movements. By-category: Áo500.000, Quần600.000, Phụ kiện400.000. Không lấy giá nhập để gọi là lợi nhuận FIFO/valuation vì chưa có phương pháp được triển khai.

API không hỗ trợ backdate; D1/D2/D3 phải là các ngày thực khác nhau và thống nhất mốc UTC hiện tại, không UPDATE created_at để giả lịch sử. Nếu cần kiểm nhanh nhiều ngày quá khứ, xin duyệt thiết kế import lịch sử từ nguồn thật với ngày nghiệp vụ/audit trước, không thực hiện lần này.

Bước thực hiện sau duyệt: tạo category/product qua API hoặc CSV preview→commit; ghi RECEIPT; đối chiếu kho; ghi SALE theo ngày; thử idempotency bằng cùng request_key (không tạo đơn thứ hai), thử thiếu tồn trong môi trường kiểm thử đã duyệt; GET chi tiết, BI và query đọc để đối chiếu các tổng trên. Mọi thao tác ghi đều cần phê duyệt bộ dữ liệu trước.

Dọn dẹp an toàn: chưa có delete/reversal hợp lệ cho chứng từ. Không đề xuất SQL DELETE hoặc reset. Mặc định giữ lịch sử có nhãn và ngừng bán sản phẩm test sau duyệt; việc này không xóa doanh thu test. Nếu yêu cầu dữ liệu sạch sau thử, ưu tiên môi trường DB tách biệt được duyệt hoặc triển khai nghiệp vụ đảo chứng từ rồi lập kế hoạch rõ ràng. Không tự tạo môi trường hay backup chứa dữ liệu nhạy cảm lần này.

Dữ liệu AI tách khỏi bộ nghiệp vụ nhỏ: 6 tháng đầy đủ cho SKU, 12 tháng cho seasonal; thuộc tính thật phù hợp category contract; tồn theo thời điểm và snapshot dự báo chốt trước kỳ. Không thể dùng ba ngày test để xác nhận AI sẵn sàng. Dùng fixture/reference trong test cô lập để kiểm logic mà không giả lịch sử cửa hàng. Chỉ nhập lịch sử thật có nguồn gốc sau duyệt, không sao chép NCKH. Đánh giá WAPE/F1 trên bộ reference độc lập được chủ model duyệt, không gắn metric nghiên cứu cho kết quả tích hợp.

## 10. Chatbot và LLM — hiện trạng và thiết kế đề xuất

Hiện trạng: /assistant là ComingSoon trong App.jsx. File pages/AIAssistant.jsx và các component cũ không được route hoạt động sử dụng. Không có route chat/conversation, SDK LLM trong package backend, vector retrieval hay bảng hội thoại/tài liệu trong SHOW TABLES. Không có bằng chứng chatbot/RAG đang vận hành. Không dò/in API key; không gọi LLM trả phí.

Luồng đề xuất:

~~~mermaid
flowchart LR
 U[React chatbox] --> E[Express: session, tenant, branch, rate limit]
 E --> C[AI Chat Service: provider adapter]
 C --> L[LLM API đã được phê duyệt]
 C --> T[Tool gateway chỉ đọc]
 T --> B[BI, sản phẩm, kho, bán hàng]
 T --> F[FastAPI inference đã được kiểm chứng]
 C --> R[RAG retrieval có ACL]
 R --> V[Vector index]
 R --> M[MySQL metadata và quyền tài liệu]
~~~

Express là nơi xác thực; Chat Service nhận context nội bộ đã xác minh, không nhận organization_id/user_id do model tự chọn. Nếu tách process, dùng service identity riêng cho chat, timeout và allowlist tool; không tái sử dụng AI_SERVICE_TOKEN công khai. Frontend chỉ nhận nội dung/nguồn, không nhận API key hoặc token nội bộ.

Chatbox mở/đóng, responsive, tiếng Việt, lịch sử theo user+organization; trạng thái gửi/stream/loading/retry/no-data/model-unavailable/cancel. Tách hội thoại khi đổi tài khoản; quyền branch được kiểm lại mỗi lượt. Không cache chung kết quả giữa tenant hoặc giữa hai user có quyền khác nhau. Mọi câu trả lời có scope thời gian/chi nhánh/timezone/as_of/source.

Công cụ dự kiến: get_sales_summary, compare_periods, get_top_products, get_inventory, get_ai_readiness, get_forecast, get_replenishment, get_stockout, search_authorized_docs. Chỉ GET/SELECT thông qua service nghiệp vụ đã kiểm chứng; zod/JSON schema strict, giới hạn range/limit/tool calls. Không cung cấp execute_sql, shell, quyền admin hoặc công cụ ghi. Branch/tenant được server chèn từ session và kiểm quyền trên từng call. Model chỉ đề nghị tool; Backend quyết định và thực hiện. “Sắp hết hàng” phải phân biệt rule tồn thấp với Stockout V1; chưa có model thì trả rõ chưa sẵn sàng, không tự dựng xác suất.

Ví dụ: “Hôm nay bán bao nhiêu?” gọi BI theo ngày và timezone đã chốt; “Tháng này so tháng trước?” gọi hai khoảng có định nghĩa MTD hay full-month; “Tồn A tại B?” resolve product/branch trong scope; “Vì sao chưa có dự báo?” trả readiness + thiếu lịch sử/weights/snapshot. Doanh thu/tồn tính ở API, không tính bằng vector search hoặc LLM tự ước lượng.

API đề xuất, chưa tạo: POST /api/v1/chat/conversations; GET danh sách/chi tiết có owner/tenant scope; POST /conversations/:id/messages hoặc SSE; GET /chat/capabilities. Model config server: CHAT_PROVIDER, CHAT_MODEL, CHAT_API_KEY và endpoint allowlist, EMBEDDING_PROVIDER/MODEL/KEY; cấu hình thật do operator quản lý, không hardcode/source/frontend.

Timeout tổng ví dụ 30 giây, tool 10 giây, tối đa 4 tool calls/lượt; retry tối đa 2 cho lỗi mạng/429/5xx có backoff/jitter, không retry lỗi quyền/validation. Giới hạn ví dụ 10 lượt/phút/user, concurrency/tenant, max input/output tokens, hard budget theo tenant/ngày/tháng; các con số là đề xuất cần chốt. Lưu usage/cost metadata, redact secrets/PII; không mặc định lưu nguyên prompt/tool payload. Không có provider fallback ra ngoài khi chưa được phép chuyển dữ liệu.

Bảng lựa chọn công nghệ dưới đây là đánh giá thiết kế, chưa benchmark tiếng Việt hoặc hiệu năng trên máy hiện tại:

| Phương án LLM | Chi phí và triển khai | Điểm phù hợp/giới hạn |
|---|---|---|
| OpenAI Responses API + model hỗ trợ function calling | Phí input/output/cached tokens theo model; không cần host weights | Có function calling/strict schema; cần duyệt outbound data và ngân sách; model cụ thể chọn qua bộ câu hỏi tiếng Việt trước khi ký cấu hình |
| Anthropic Messages API + model có tool use | Phí token theo model và cache; cần adapter request/response riêng | Có client tools do ứng dụng thực thi; cần cùng policy scope/redaction, không mặc định tốt hơn khi chưa benchmark |
| Ollama local + model hỗ trợ tools | Chi phí RAM/CPU/GPU, điện, vận hành; không mặc định miễn phí về tổng chi phí | Dữ liệu có thể giữ local, cần benchmark tài nguyên, tiếng Việt và độ đúng tool; không nên mặc định đủ tài nguyên trên máy từng thiếu RAM |

Nguồn chính thức: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling). Không chốt tên model “mới nhất” hoặc đơn giá dài hạn; cần kiểm tra model được account hỗ trợ và bảng giá tại thời điểm duyệt.

Ước tính ngân sách bằng usage: C_chat=(T_input*P_input+T_output*P_output+T_cache*P_cache)/1.000.000, cộng embeddings/index/storage và hạ tầng. Ví dụ lập sizing 1.000 lượt × (2.000 input + 300 output) là 2 triệu input và 0,3 triệu output tokens trước các lượt tool; không phải báo giá hoặc mức tiêu thụ đã đo. Kiểm soát hard budget trong ứng dụng, không chỉ dựa dashboard nhà cung cấp.

## 11. RAG — thiết kế, chưa cài đặt

Nguồn cho phép đề xuất: tài liệu sử dụng Retail Insight, quy trình kho/bán hàng, chính sách tổ chức và tài liệu nội bộ được chủ sở hữu cấp quyền. Không tự index toàn repo, .env, tài khoản, logs, notebook/weights hoặc database nghiên cứu. Tài liệu dùng chung hệ thống phải có namespace và chính sách publish được duyệt; không mặc định tổ chức khác được đọc.

Pipeline: upload có quyền → kiểm MIME/kích thước/virus/quyền sở hữu → trích xuất trong worker giới hạn tài nguyên (PDF scan cần OCR có kiểm soát) → chunk theo heading, đề xuất 500–800 tokens/overlap80 → embeddings phiên bản cố định → index vector + metadata → truy xuất với filter quyền bắt buộc → xác minh lại ACL/version/tombstone trong MySQL → cấp context trích đoạn cho LLM → trả nguồn doc/title/page/section/version. Các kích thước chunk là giả thuyết khởi đầu cần đánh giá trên tài liệu Việt.

Metadata tối thiểu: organization_id, document_id, document_version, chunk_id, branch scope, ACL policy, owner, checksum, embedding_model/version/dimension, page/section và trạng thái active/deleted. Không nhận org/ACL filter tự do từ model. Tenant filter bắt buộc trước vector search, sau đó kiểm lại quyền từng candidate trước gửi LLM; không chỉ lọc quyền sau khi đã gửi context. Quyền bị thu hồi phải vô hiệu cache và chặn ngay ở relational ACL, không đợi job xóa index.

Tài liệu là dữ liệu không đáng tin: nội dung “bỏ qua chỉ dẫn/gửi secret/chạy SQL” không được coi là instruction. Tách system/tool context, không trao quyền tool từ đoạn trích, không tải URL tùy ý, khóa outbound và kiểm danh sách nguồn. Kiểm quyền cả endpoint mở tài liệu theo citation. Không đủ nguồn thì nói không tìm thấy bằng chứng, không bịa nguồn hoặc dùng nghiên cứu thay thế.

Cập nhật: mỗi version có checksum, job idempotent; chỉ publish sau index thành công. Xóa: tombstone relational trước, ngừng retrieval/citation, enqueue xóa mọi chunk/vector/cache; audit không lưu nội dung nhạy cảm không cần thiết. Kiểm batch reconciliation để tránh vector mồ côi. Rate/quota theo upload, tổng bytes, số trang/chunks, embeddings tokens và lịch reindex.

| Embedding/index | Ưu điểm thiết kế | Chi phí, giới hạn và bảo trì |
|---|---|---|
| OpenAI text-embedding-3-small/large | API embeddings, version/dimensions cấu hình được | Phí theo input token, dữ liệu ra ngoài cần duyệt; đánh giá truy xuất tiếng Việt trước chọn small/large |
| BAAI/bge-m3 local | Phương án embeddings đa ngôn ngữ tự host | Cần RAM/CPU/GPU, pin revision, đánh giá tiếng Việt; không nạp lên service AI dự báo hiện có trong lượt này |
| Qdrant + MySQL metadata/ACL | Vector service riêng, payload filters/tenant support | Thêm service, backup/auth/index lifecycle; filter tenant không thay xác thực ở Express |
| PostgreSQL + pgvector | SQL/vector trong một engine, có HNSW/IVFFlat | Thêm một RDBMS ngoài MySQL; vận hành phức tạp hơn với stack hiện tại |
| MySQL metadata + vectors BLOB/JSON, similarity ở app | Có thể làm POC nhỏ sau migration được duyệt | Scan có giới hạn, không phù hợp mở rộng không kiểm soát; chưa kiểm chứng native vector index của server MySQL 9.7 hiện tại |

Nguồn chính thức: [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings), [BGE-M3 model card của BAAI](https://huggingface.co/BAAI/bge-m3), [Qdrant multitenancy](https://qdrant.tech/documentation/manage-data/multitenancy/), [pgvector](https://github.com/pgvector/pgvector). Đề xuất ban đầu: MySQL giữ ACL/metadata; chọn Qdrant nếu chấp nhận service riêng và nhu cầu vector; nếu POC rất nhỏ, đo scan local có quota trước. Không giả định đã có vector search trong MySQL chỉ từ version string.

Schema dự kiến, chưa migration: chat_conversations/chat_messages (tenant+user ownership), chat_usage; knowledge_documents, document_versions, document_acl, knowledge_chunks, ingestion_jobs; index vector ngoài DB nếu chọn Qdrant. Khóa tenant phải có trong quan hệ/citation và truy vấn. API dự kiến /knowledge/documents upload/list/detail, /versions, /acl, /delete, /ingestion-status; retrieval chỉ nội bộ hoặc endpoint có cùng ACL.

Nghiệm thu RAG: truy vấn tổ chức A không trả đoạn/title/citation tổ chức B; user không được branch không đọc tài liệu branch; revoke có hiệu lực ngay; doc xóa/cập nhật không còn citation lỗi thời; prompt injection không đổi quyền/tool; không gửi PII ngoài khi chưa được phép; nguồn kiểm tra mở được và hỗ trợ câu trả lời. Đo retrieval recall/precision, groundedness, latency và cost trên tập câu hỏi/tài liệu được duyệt; không lấy F1 Stockout/WAPE để đánh giá RAG.

## 12. Lộ trình và quyết định cần duyệt

| Giai đoạn/ưu tiên | Đã có → cần làm; kiến trúc | API/schema cần bổ sung | Phụ thuộc, rủi ro/chi phí | Tiêu chí nghiệm thu và phê duyệt |
|---|---|---|---|---|
| 1 — P0 nền tảng | Origin đã sửa; chốt E2E OWNER, tiếp tục audit/write-path trong môi trường được duyệt | Không schema cho auth; nghiệp vụ date/filter/reversal chỉ khi duyệt | Cần người dùng nhập mật khẩu tại terminal; dữ liệu thật không được sửa để thử | Hai host login200/me200/reload/logout204/me401; cấp quyền test nghiệp vụ riêng nếu muốn tạo giao dịch |
| 2 — P0/P1 năm AI | Có FastAPI/adapter/algorithms; sửa startup token; thu hồi/kiểm model gốc; chốt Hybrid/Jan17/category | Readiness contract/upstream gate; forecast_runs, forecast_snapshots/feature snapshots dự kiến | Cần quyền restart/cấu hình AI; thiếu weights; training và activation là quyết định riêng; RAM/compute | API bảo vệ hoạt động, thiếu model trả mã rõ; parity reference/model đúng; không tự fallback; duyệt lần lượt token, model, schema và activation |
| 3 — P1 dữ liệu kiểm thử | Có catalog/receipts/sales/BI; chạy bộ 4 SKU/5 chứng từ theo kế hoạch | Không cần schema để giao dịch ngày thật; ngày nghiệp vụ/test_run/reversal cần thiết kế riêng | Phụ thuộc phê duyệt test dataset; có ảnh hưởng tổng BI; chưa có dọn sạch qua nghiệp vụ | Đối chiếu 1.500.000đ/3 đơn/16 units/89 tồn; idempotency và thiếu tồn; chỉ test AI đủ điều kiện, không tuyên bố độ chính xác |
| 4 — P2 Chatbot | Hiện ComingSoon; thêm chatbox, provider adapter, tool gateway read-only | /chat/conversations/messages/capabilities; conversation/message/usage | Cần provider/model/budget và quyền gửi dữ liệu; chống cross-tenant/tool abuse; phí token | Trả lời có scope/source; từ chối SQL/write/ngoài quyền; hội thoại tách user/tenant; rate/budget enforced |
| 5 — P2 RAG | Chưa có ingest/vector/ACL; chọn embeddings/index và worker | /knowledge/*; doc/version/ACL/chunk/job, index | Phụ thuộc phase4 + tài liệu được phép; phí embed/storage/OCR; injection và ACL lifecycle | Các test deny/citation/revoke/delete/index version đạt; duyệt schema, tài liệu, outbound, hạ tầng |
| 6 — P3 Chatbot + forecasting | Tích hợp tool readiness/forecast/replenish/stockout có gate từng model | Tool schemas/result provenance; không training endpoint | Phụ thuộc từng AI đã được kiểm chứng và kích hoạt riêng; không thể bỏ qua Jan17 hoặc snapshots | Trả đúng model version/origin/source/limitations; unavailable nói rõ; không suy đoán/copy metric nghiên cứu |

Thứ tự xử lý tại audit ban đầu là hoàn tất verifier tài khoản thật và xử lý startup AI. Cập nhật: P0 token đã sửa và người dùng xác nhận readiness qua OWNER HTTP 200. Đề xuất hiện tại: duyệt gói validation ngày/lọc sales-receipts tại mục 14; chốt timezone và các nghiệp vụ/schema riêng; bộ dữ liệu test, weights/reference/upstream, forecast schema và Chatbot/LLM/RAG vẫn cần phê duyệt riêng.

Không yêu cầu người dùng gửi secret. Không thực hiện bất kỳ bước chưa duyệt trong roadmap. Kết quả đang thiếu không được đánh dấu thành công chỉ để hoàn tất báo cáo.

## 13. Các lệnh tái kiểm tra an toàn và giới hạn

~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\backend'
node --test test/config.test.js test/origins.test.js test/origin-http.test.js
npm.cmd run check:research
npm.cmd run verify:auth:dev
~~~

Hai lệnh đầu không ghi dữ liệu kinh doanh; verifier chỉ đi qua authentication và GET kiểm tra, tạo/thu hồi session theo luồng bình thường. Không chạy bộ test E2E cũ frontend/tests/auth.spec.js hoặc RUN_DB_TESTS=1 ở DB hiện tại: chúng có tạo fixture và DELETE cleanup, trái phạm vi lượt này.

Người dùng đã xác nhận login OWNER thủ công và readiness HTTP 200 qua phiên thật trên 127.0.0.1. Chưa kiểm chứng đầy đủ verifier tự động login/me/reload/logout trên hai hostname; đường ghi business và concurrency thực tế; số liệu BI khác 0; inference của 5 chức năng AI, weights thật và độ chính xác; mọi vai trò/tenant/branch matrix; production/HTTPS; LLM/RAG. Readiness PASS không được dùng làm bằng chứng inference PASS.

## 14. Xác nhận readiness qua OWNER và đề xuất P1 — 06/11/2026

### Bằng chứng mới do người dùng cung cấp

Tại http://127.0.0.1:5173/, trong DevTools Console của phiên OWNER đang đăng nhập, người dùng thực hiện:

~~~javascript
fetch('/api/v1/ai/readiness', { credentials: 'include' })
~~~

Kết quả được người dùng xác nhận: HTTP 200; response có models, algorithms và live_metrics:null; không còn lỗi 401/503 cho yêu cầu này. Ghi nhận **PASS thủ công: Vite proxy → Backend xác thực phiên OWNER → FastAPI readiness**. Không tự thu thập cookie/token hoặc chạy lại bằng phiên người dùng.

Đây chỉ là kiểm thử readiness. Chưa kiểm thử inference của cả 5 chức năng AI, chất lượng dự báo, weights hoặc độ đầy đủ dữ liệu. Không dùng HTTP 200 này để gán READY cho các model. Các kết luận thiếu weights/lịch sử/snapshot của audit trước vẫn là các điều kiện cần xử lý riêng. Chưa có bằng chứng mới hoàn tất verifier tự động login/me/reload/logout cho cả hai hostname.

### Danh sách P1 nghiệp vụ và thứ tự đề xuất — chưa thực hiện

Các mục được phân biệt thành lỗi mã đã phát hiện, quyết định nghiệp vụ cần chốt và chức năng còn thiếu. Không coi tất cả là lỗi đã tái hiện trên dữ liệu có giao dịch.

| Thứ tự | Mục P1 và phân loại | Phạm vi đề xuất | Tiêu chí nghiệm thu | Cần phê duyệt |
|---|---|---|---|---|
| 1 | Validation ngày — thiếu kiểm tra | common.js kiểm ngày lịch thực và start<=end; thống nhất xử lý ngày không hợp lệ | Ngày không tồn tại hoặc khoảng đảo trả 400; ngày nhuận và biên kỳ hợp lệ; kiểm thử không ghi DB | Sửa validation và kiểm thử; không migration |
| 2 | Bộ lọc sales/receipts — lỗi triển khai | ledger.js áp dụng category_id/product_id bằng EXISTS hoặc truy vấn tương đương, cùng điều kiện cho count/list; giữ tenant/branch scope | Khớp category/product/branch/date; không nhân đôi documents do nhiều items; total khớp danh sách | Sửa query và kiểm thử; không sửa dữ liệu |
| 3 | Ngày kinh doanh UTC+7 — cần chốt quy ước | Quyết định timezone cửa hàng, chuyển khoảng ngày sang UTC khi query và group theo ngày nghiệp vụ; giữ nguyên timestamp đã lưu | Mốc 00:00/23:59 giờ cửa hàng khớp BI, danh sách và biểu đồ; UI nêu timezone | Duyệt quy ước timezone trước khi sửa; việc đổi metadata/schema nếu cần sẽ trình riêng |
| 4 | Ngày nghiệp vụ chứng từ — chức năng thiếu | Thiết kế ngày phát sinh tách created_at ghi nhận; quyền backdate, kỳ khóa, audit trail; chốt bộ lọc/BI dùng ngày nào | Không sửa created_at để giả lịch sử; không cho backdate tùy ý; ngày nghiệp vụ và nhật ký nhất quán | Duyệt thiết kế/API/schema/migration riêng; chưa nhập lịch sử |
| 5 | Hủy/hoàn trả — chức năng thiếu | Thiết kế chứng từ đảo/hoàn liên kết hóa đơn gốc, giới hạn lượng hoàn, idempotency, kiểm tồn và quyền; không DELETE hóa đơn | Không hoàn vượt lượng bán, không đảo hai lần; tổng doanh thu/units/tồn đối chiếu được | Duyệt nghiệp vụ và schema trước triển khai; không tự sửa giao dịch cũ |
| 6 | Chuyển kho/xuất điều chỉnh — chức năng thiếu | Thiết kế movements đối ứng, lý do điều chỉnh, quyền duyệt, khóa transaction và chống lặp | Không tạo tồn âm; hai vế chuyển kho atomic, tổng lượng toàn tổ chức được bảo toàn khi chuyển | Duyệt quy trình/API/schema và kiểm thử trên môi trường riêng |
| 7 | Định giá tồn/lợi nhuận — chức năng thiếu, cần chính sách | Chọn FIFO hoặc bình quân; xác định xử lý hàng hoàn/điều chỉnh và nguồn giá vốn; phụ thuộc các quy trình phía trên | Giá trị tồn và giá vốn đối chiếu được; không lấy giá vốn tham khảo làm kế toán đã xác nhận | Duyệt phương pháp, thiết kế và schema riêng |

Bằng chứng mã nguồn của thứ tự 1–2: [common.js](../backend/src/business/common.js), [ledger.js](../backend/src/business/ledger.js). Quy ước UTC và công thức BI: [bi.js](../backend/src/business/bi.js). Phần ngày nghiệp vụ/hủy/hoàn/chuyển kho/valuation là thiếu thành phần theo schema và routes trong audit, không phải các nghiệp vụ đã triển khai rồi thất bại.

**Gói bước tiếp theo được đề xuất để duyệt:** chỉ thực hiện mục 1–2 (validation ngày và lọc danh sách sales/receipts), thêm kiểm thử phù hợp không ghi DB hiện tại. Không migration, không tạo giao dịch hoặc thay đổi timezone trong gói này. Phần kiểm chứng số liệu khác 0 phải dùng fixture/mock hoặc môi trường tách biệt được duyệt riêng; không tự tạo fixture trên retail_app hiện tại.

Mục 3 cần quyết định timezone; mục 4 cần quyết định ngày nghiệp vụ trước thiết kế schema. Mục 5–7 nên duyệt và thực hiện từng gói vì ảnh hưởng ledger/BI và có thể cần migration. Bộ dữ liệu test đã đề xuất ở mục 9 vẫn chưa được phép nhập.

P1 liên quan AI giữ riêng: chuẩn hóa MODEL_UNAVAILABLE và thiết kế lưu forecast snapshot cho AI-2. Chúng không nằm trong gói P1 nghiệp vụ 1–2; không sửa pipeline, weights hoặc triển khai snapshot schema khi chưa được duyệt.

Lượt cập nhật này chỉ sửa hai báo cáo. Không đổi source, cấu hình, database, weights, pipeline hoặc tiến trình service; không gọi inference, tạo dữ liệu hay thực hiện P1/P2.

## 15. Hoàn tất gói P1 ngày và danh sách chứng từ — 06/11/2026

Đã sửa đúng hai mục người dùng phê duyệt: ngày Gregorian, start<=end, thông báo 400; category/product trên danh sách sales/receipts kết hợp scope và thời gian, EXISTS không đếm trùng và count/list dùng cùng điều kiện. Giữ UTC hiện tại; end bao gồm đến microsecond cuối ngày, tránh cộng vượt ngày tối đa.

Hai bộ test mới tái hiện lỗi trước sửa: 50 PASS/50 FAIL; sau sửa 100 PASS/0 FAIL. Regression an toàn hiện có thêm 29 PASS; 3 test cần ghi MySQL được SKIP. Tổng 129 PASS/0 FAIL/3 SKIP. Integration dùng Express thật và SQLite :memory: qua mock pool chặn MySQL; không phải kiểm chứng native MySQL hiện tại hoặc giao dịch thật.

Xem [báo cáo chi tiết P1 và danh sách file](P1_DATE_AND_DOCUMENT_FILTERS_2026-11-06.md). Không migration/seed/API ghi, không thay database, tài khoản/quyền, timezone, AI hoặc nghiên cứu. Không triển khai mục P1 tiếp theo hoặc P2; tiếp tục chờ phê duyệt riêng.
