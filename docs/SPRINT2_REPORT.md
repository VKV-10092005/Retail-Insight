# Kết quả triển khai Sprint 2 — 04/11/2026

Trạng thái: đã triển khai và kiểm thử luồng vận hành bán lẻ bằng React → Express → MySQL thật, cùng FastAPI inference-only và các trạng thái đủ/thiếu điều kiện. Chưa tuyên bố hoàn tất suy luận Hybrid/Stockout bằng model thật hoặc triển khai production HTTPS vì thiếu artifact và chưa có Docker runtime trên máy.

## 1. Nghiệp vụ đã có mã thực thi và dữ liệu thật

| Nhóm | Backend / database | Frontend / kiểm chứng |
|---|---|---|
| Tài khoản và cửa hàng | Kế thừa register/login/logout/JWT/session/RBAC Sprint 1; đăng ký tự tạo organization, OWNER, chi nhánh; organization ID do MySQL sinh | Login/register thật, giữ phiên, logout; người dùng không khai organization ID |
| Chi nhánh và nhân viên | Tạo/sửa chi nhánh; tạo nhân viên, phân công branch, đổi role, khóa tài khoản; không sửa OWNER qua API staff | Form quản lý chi nhánh/nhân viên dùng API; cashier bị chặn trang quản trị, chỉ thấy chi nhánh được phân công |
| Sản phẩm/danh mục | Thêm danh mục; thêm/sửa/tìm kiếm/phân trang sản phẩm; ngừng bán; ràng buộc tenant và category FK | Route /products và /products/new dùng dữ liệu cửa hàng, không dùng mảng mock; tìm SKU để chọn sản phẩm khi nhập/bán |
| Nhập hàng/tồn kho | Chứng từ RECEIPT, items, inventory_balances và inventory_movements trong một transaction | Ghi phiếu nhập, xem tồn và nhật ký nhập/xuất; không coi dữ liệu NCKH là tồn hiện tại |
| Bán hàng/chứng từ | Chứng từ SALE lấy giá từ server; khóa dòng sản phẩm/tồn, chống âm tồn, rollback khi thiếu hàng; idempotency key chống ghi lặp | Bán nhiều dòng sản phẩm, xem/in hóa đơn nội bộ và lịch sử; không phải hóa đơn điện tử thuế |
| BI | Tổng tiền bán, số đơn, sản lượng, doanh thu theo ngày/tháng/branch/category; top/slow SKU; tồn và biến động theo chi nhánh | Recharts, bộ lọc thời gian/branch/category/product, responsive, loading/error/empty; có khối KPI AI điều kiện, không hardcode số liệu |

Cửa hàng chưa có giao dịch được thông báo chưa có dữ liệu; số tổng bằng 0 là tổng tính từ DB, không phải KPI giả. Tồn hiện tại độc lập bộ lọc ngày bán hàng. Giá trị tồn giữ null vì chưa có phương pháp định giá kế toán được xác nhận.

## 2. Database và quyền dữ liệu

Migration 002_operations.sql đã được người dùng phê duyệt và thực thi **chỉ trên retail_app**. Tạo thêm 7 bảng: categories, products, inventory_balances, stock_documents, stock_document_items, inventory_movements, organization_dataset_access. Không sửa cấu trúc 6 bảng Sprint 1. Migration runner hỗ trợ nhiều file theo thứ tự, có lock và chạy lại không áp migration đã ghi nhận.

Pool ghi giữ guard đúng MYSQL_DATABASE=retail_app và SELECT DATABASE(); session timezone ứng dụng là UTC để timestamp/filter nhất quán. Chỉ các fixture kiểm thử và dữ liệu vận hành trong retail_app được ghi.

Reader nghiên cứu tách riêng, không dùng root; kiểm tra SHOW GRANTS và fail closed nếu quyền ghi, role, grant option hoặc SELECT ngoài hai schema được cho phép. Đã kiểm tra thành công kết nối SELECT-only trên retail_management và retail_datawarehouse, không in mật khẩu/grants thô. Đã đọc thực tế:

- Hai run: SES_0.5_V1, test WAPE 72,3265; MA2_80_10_10_V1, test WAPE 70,4830; dự báo 08/2023.
- branch_inventory có 28.235 dòng nhãn SIMULATED; snapshot mới nhất trong bảng là 30/04/2023. Không gọi đây là tồn vận hành hiện tại.
- retail_ai_monthly_dataset có 520.809 dòng, tháng 01/2022–07/2023.

Không thực thi SQL dump, migration, INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE trên nguồn nghiên cứu. Không chạy ETL hoặc notebook cũ. Không cấp quyền dataset cho organization nào; các endpoint nghiên cứu trả 403 cho tổ chức chưa được cấp quyền, kể cả OWNER.

## 3. AI đã triển khai và giới hạn được giữ rõ

| Chức năng | Mã/API đã triển khai | Điều kiện / trạng thái thực tế |
|---|---|---|
| AI-1 SKU | 30 features, specialist mask, blend 25% General + 75% Specialist; feature pipeline từ sản lượng/giá/thuộc tính vận hành; manifest/hash/version/category/feature checks; API Express/FastAPI và bảng/biểu đồ React | Chưa có weights Hybrid đúng phiên bản. Trả UNAVAILABLE, không thay MA2/SES vào rồi gọi là Hybrid. Inference-only unit test dùng estimator kiểm thử để xác minh math; không phải model sản phẩm |
| AI-2 tổng | Thuật toán cell 329 dùng actual/predicted tháng trước, clip 0,8–2,0, không lấy actual tháng đang dự báo; /v1/total và UI so sánh actual/base/corrected | Vận hành còn cần model và dự báo tháng trước được chốt đúng thời điểm. Không dựng lại dự báo quá khứ bằng thuộc tính hiện tại; trả MISSING_PREVIOUS_FORECAST_SNAPSHOT khi thiếu. Chưa lưu lịch sử run AI vận hành bằng bảng riêng; cần migration được phê duyệt thêm cho run/snapshot trước khi kích hoạt calibration thực tế |
| AI-3 bổ sung | Đúng max(0,ceil(pred)+ceil(0,2×pred)−stock); missing stock/prediction → null; lọc/tìm/sắp xếp; không tạo đơn nhập | Phụ thuộc dự báo hợp lệ; stock đầu kỳ tái dựng từ movements theo timestamp chứng từ, kiểm tra độ phủ branch. Không lấy tồn hôm nay thay tồn đầu kỳ và không điền thiếu bằng 0 |
| AI-4 thiếu hàng | 7 features, LightGBM classifier loader, threshold 0,3299, endpoint và trang cảnh báo; ưu tiên hiển thị khi có output model | Chưa có classifier artifact đúng phiên bản. Không thay bằng quy tắc đơn giản rồi gắn F1 68,69%. Nhãn nghiên cứu là stockout proxy |
| AI-5 nhiều tháng | Seasonal cùng tháng năm trước × trend 3 tháng/3 tháng trước, clip 0,85–1,15; horizon 1/2/3; tổng hợp tháng từ MySQL vận hành; chart React | Thuật toán chạy khi đủ 12 tháng quan sát liên tục. Cửa hàng mới trả INSUFFICIENT_HISTORY. Đã đối chiếu bằng Parquet thật từ gói bàn giao, không phải mô hình SKU đệ quy |

Không có API train. Không huấn luyện hoặc thay đổi weights/kết quả nghiên cứu. Feature build chỉ tính tháng đã quan sát đầy đủ, không điền 0 cho thời gian trước khi cửa hàng/sản phẩm tồn tại. Group/brand lag không thay đổi sai chỉ vì lọc một SKU. Category ngoài tập đã được xác nhận bị từ chối.

Metrics vận hành null; không gán 95,53%, F1 68,69% hoặc các chỉ số khác của nghiên cứu cho cửa hàng mới. Hiệu năng thật của model trên dữ liệu khách hàng chưa được xác nhận. Inference SKU giới hạn 100 sản phẩm/request; bộ lọc cho phép chọn phạm vi nhỏ hơn. AI-5 được tổng hợp trực tiếp nên không cần chuyển toàn bộ dữ liệu SKU sang service.

## 4. Gói artifact mới

Đã đọc Retail_Forecasting_Results-20261104T114659Z-1-001.zip và sao chép **7 CSV/Parquet** được whitelist vào data/research của ứng dụng mới. Manifest có hash file và hash ZIP `451895872d27f354d7d1f8176eb66d877276b7014ac0de790f74a9081e51b863`.

- Dự báo MA2 08/2023: 27.411 dòng.
- Dự báo Auto 08/2023: 27.411 dòng, giữ selected_model ở từng dòng.
- MA2 test predictions: 54.822 dòng.
- History Parquet: 520.809 dòng, product_id/sale_month/target.
- Các CSV so sánh và test chính sách giữ nguyên.
- import_ma2_forecast.sql trong ZIP không được thực thi hoặc dùng để ghi nguồn nghiên cứu.

API/thư viện lịch sử đã chuẩn bị, có quyền dataset riêng, source_file/checksum/run/kỳ rõ ràng. MA2/Auto không bị đổi nhãn thành Hybrid. Việc có artifact trong filesystem không cấp quyền đọc nó cho mọi tổ chức.

## 5. Kiểm thử đã chạy

| Nhóm | Kết quả | Nội dung chính |
|---|---:|---|
| Backend Node + HTTP + MySQL | 22/22 đạt, không skip | Hồi quy Sprint 1; tenant FK; RBAC; category/product; receipt; replay key; bán đồng thời không oversell; rollback; invoice; BI; staff khóa/branch scope |
| FastAPI / thuật toán | 12/12 đạt | Auth service; schema; model thiếu/hash/features; blend/mask; threshold; rounding; null stock; causal correction; no future leakage; minimum history; regression Parquet thật |
| Edge end-to-end | 2/2 đạt | Đăng ký/login/reload/logout; thêm category/product; nhập 10, bán 3, tồn 7, doanh thu 37.500; BI; cả 5 API AI qua Express/FastAPI; dataset deny; tạo branch/staff, login cashier, chặn quản trị, viewport mobile |
| Production build React | Đạt | React.lazy chia theo trang; entry khoảng 204,91 kB, Dashboard/chart chunk khoảng 402,59 kB; không còn cảnh báo chunk >500 kB |
| npm audit frontend/backend | 0 cảnh báo tại thời điểm kiểm tra | Không đại diện cho kiểm toán bảo mật toàn hệ thống |
| Research SELECT-only | Đạt | Kiểm tra quyền và SELECT thật trên cả hai schema; không dùng root |
| Compose | Kiểm tra cấu trúc YAML đạt | Private ports, read-only mounts, migration profile, service dependencies; chưa có Docker runtime để build/start |

Test thực tế tạo và dọn fixture riêng trong retail_app. Lỗi pool dùng chung và locator trong quá trình viết test đã được sửa; đây không phải trạng thái kiểm thử cuối. Không giữ tài khoản test hoặc dữ liệu giao dịch mẫu làm dữ liệu cửa hàng thật.

Đối chiếu AI-5 trên history Parquet qua API FastAPI, không huấn luyện lại:

| Horizon | Số phép thử | WAPE tính lại | 100−WAPE tính lại |
|---|---:|---:|---:|
| 1 tháng | 7 | 23,97724276% | 76,02275724% |
| 2 tháng | 6 | 22,34011306% | 77,65988694% |
| 3 tháng | 5 | 27,62998625% | 72,37001375% |

Khớp các mốc notebook 76,02 / 77,66 / 72,37 khi làm tròn. Đây là kiểm chứng lịch sử, không thay kết quả nghiên cứu gốc hoặc chứng nhận hiệu năng trên khách hàng mới.

Ảnh docs/sprint2-operational-dashboard-test.png chụp từ fixture E2E trên MySQL thật trước khi dọn. Số liệu trong ảnh là giao dịch kiểm thử đã ghi qua UI/API, không phải doanh thu của khách hàng hoặc KPI NCKH được dùng thay số thật.

## 6. Nhóm file bàn giao

- backend/src/db/migrations/002_operations.sql, migrate.js, pool.js, research.js, check-research.js, check-schema.js.
- backend/src/business/common.js, catalog.js, ledger.js, bi.js, ai.js; app.js/server.js; password validation trong routes/auth.js.
- backend/test/operations.integration.test.js, auth-rate-limit.test.js, các test hồi quy Sprint 1 giữ nguyên mục tiêu; scripts và cấu hình mẫu bổ sung.
- ai-service/app/algorithms.py, features.py, models.py, main.py; run.py, requirements.txt, models/README.md; tests/test_ai.py và test_delivered_research.py; môi trường .venv riêng.
- frontend/src/operations/shared.jsx, Products.jsx, Ledger.jsx, Management.jsx, Dashboard.jsx, AI.jsx, Research.jsx, Account.jsx; app/App.jsx lazy routes; AuthContext refresh; layout/sidebar và CSS.
- frontend/tests/operations.spec.js và sửa cách cô lập pool trong auth.spec.js; các route nghiệp vụ cũ giữ source tham khảo, không được dùng làm nguồn dữ liệu cho route vận hành mới.
- scripts/prepare_research_artifacts.py; data/research/manifest.json và bản sao CSV/Parquet (ignored); không copy/sửa model nguồn cũ.
- Dockerfiles/.dockerignore của 3 service, frontend/Caddyfile, compose.yaml, deploy/.env.example; README.md, docs/API.md, DEPLOYMENT.md, MODEL_HANDOFF.md và báo cáo này.

backend/.env chỉ bổ sung service token nội bộ khi cần, không ghi đè cấu hình MySQL người dùng. Token không in ra terminal; ai-service/.env giữ token tương ứng, được ignore. Các file bí mật không nằm trong Docker build context hoặc báo cáo.

## 7. Còn cần trước khi khẳng định hoàn tất AI/production

1. Bàn giao/khôi phục đúng weights Hybrid và Stockout, category mapping và reference input/output; kiểm chứng inference thật theo MODEL_HANDOFF.md. Chưa có model thật nên chưa thể nghiệm thu chất lượng dự báo trên dữ liệu khách hàng.
2. Thêm cơ chế lưu run/feature snapshot/prior forecast vào retail_app bằng migration được duyệt riêng nếu kích hoạt AI-2 calibration và lịch sử so sánh run vận hành. Hiện có run selector cho kết quả nghiên cứu, không giả lịch sử run mới.
3. Quyền dataset nghiên cứu vẫn 0. Chỉ cấp khi chủ dự án xác nhận; không cản trở chức năng bán lẻ.
4. Docker/HTTPS chưa chạy thực tế do máy không có Docker CLI; cần build và smoke test trên server có domain/secrets theo DEPLOYMENT.md. Chưa triển khai lên server từ phiên này.
5. Chưa có hóa đơn điện tử thuế, định giá tồn kế toán, email reset password, cổng thanh toán, trả hàng/chuyển kho/chiết khấu. Chỉ phần bán hàng và chứng từ nội bộ đã được kiểm chứng.

Không đánh dấu toàn bộ 5 chức năng suy luận AI hoặc production deployment là hoàn tất khi các điều kiện này còn thiếu. Luồng vận hành cốt lõi đã có backend/database thật và đã chạy E2E.

Rà soát bundle: URL legacy research-demo/research-branches chuyển tới thư viện có quyền dataset; Market/Assistant chưa triển khai hiển thị trạng thái chuẩn bị. File UI cũ được giữ trong source, không import vào bundle vận hành và không đưa dữ liệu mẫu ra production qua các route đó.

## Chốt kiểm chứng cuối

Lượt cuối: 22/22 backend, 12/12 FastAPI/AI và 2/2 Edge đạt; build thành công, không còn module mockData/trang demo trong dist. Đã sửa rate limit để GET /auth/me không làm cạn hạn mức đăng nhập/đăng ký; kiểm thử 110 lần kiểm tra phiên và phản hồi 429 JSON đã đạt. organization_dataset_access có 0 bản ghi; tài khoản thử còn lại 0; migrations 001_auth/002_operations đầy đủ. Backend, FastAPI và Vite đang chạy cục bộ để người dùng xem kết quả tại http://localhost:5173.


## Cập nhật 05/11/2026: nhập CSV và phân tích model

Hoàn thiện nhập sản phẩm CSV bằng API thật và giao diện xem trước/xác nhận. Hỗ trợ Unicode, trường có dấu phẩy/xuống dòng đặt trong dấu nháy, giới hạn kích thước/số dòng, kiểm SKU trùng và danh mục cùng organization; ghi atomic, không ghi đè SKU hoặc thay đổi tồn. Không cần migration mới.

Kiểm thử: 25/25 backend đã đạt, gồm preview không ghi, hash thay đổi, dữ liệu sai, phân quyền và commit đồng thời; 2/2 Edge E2E đạt sau khi thêm luồng CSV preview/commit rồi nhập kho/bán hàng/BI thật; frontend build đạt. Dữ liệu thử dùng fixture riêng, được dọn theo organization. Không tuyên bố đã deploy Docker/HTTPS hoặc có weights Hybrid/Stockout.

Phân tích model và đề xuất tái tạo tại [MODEL_REPRODUCTION_PLAN.md](MODEL_REPRODUCTION_PLAN.md). Audit không gọi fit/predict, không kích hoạt model. V3 bàn giao là model 20 feature khác Hybrid30; Stockout V1 có upstream Jan17 hard switch riêng. Chưa có huấn luyện, migration mới hoặc cấp quyền dataset trong đợt này.
