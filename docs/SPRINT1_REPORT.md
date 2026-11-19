# Kết quả Sprint 1 — 04/11/2026

## Phạm vi và tái sử dụng

Frontend/backend được sao chép từ retail-ai-system sang workspace hiện tại, bỏ qua node_modules, dist và file môi trường bí mật. Giữ React 18, Vite, cấu trúc routes, layout/sidebar, CSS cũ, chart, hooks, helpers và các trang nghiệp vụ tham khảo. Backend mở rộng scaffold Express/Helmet/CORS; không chỉnh sửa dự án gốc. Chỉ đọc tham khảo thư mục nghiên cứu AI và phần đầu hai SQL dump; không import dump, không thực thi pipeline, không huấn luyện mô hình.

## Đã triển khai

- Migration 001_auth, khóa ngoại ghép chống phân công user/branch khác organization, migration lock và bảng phiên bản.
- Đăng ký transaction: organization + OWNER + chi nhánh + assignment; xử lý email trùng.
- bcrypt cost 12, JWT HS256 có issuer/audience/expiry/jti, HttpOnly SameSite=Lax cookie; Secure khi production.
- Phiên trong auth_sessions, đăng xuất thu hồi token; trạng thái user/organization và vai trò được đọc lại từ DB khi xác thực.
- RBAC API và kiểm soát phạm vi branch; organization lấy từ người dùng đã xác thực, từ chối header/query/body khai organization khác.
- Validation, rate limit auth, header bảo vệ request ghi, kiểm tra Origin, lỗi JSON có cấu trúc và không trả hash mật khẩu.
- Frontend đăng ký/đăng nhập thật, AuthContext khôi phục phiên, protected routes, báo lỗi, logout, dashboard và chi nhánh thật.
- Tailwind được bổ sung bên cạnh CSS cũ. Các dashboard/chi nhánh mẫu được giữ ở route nghiên cứu riêng.

## Database đã xác minh

Backend kết nối thành công với `retail_app` qua `retail_app@127.0.0.1`. Migration chạy thành công và chạy lặp thành công. SHOW TABLES trả đủ:

1. organizations
2. users
3. branches
4. user_branch_roles
5. auth_sessions
6. schema_migrations (version 001_auth)

Không thực hiện câu lệnh ghi hoặc migration trên database nghiên cứu. Các test chỉ tạo, cập nhật và dọn fixture thuộc organization do test tạo trong retail_app.

## Kiểm chứng

- Backend: chạy test với RUN_DB_TESTS=1 trên HTTP và MySQL thật, bao gồm đăng ký lưu DB/hash mật khẩu, email trùng, login đúng/sai, cookie HttpOnly/SameSite, /me, JWT bị sửa/hết hạn/sai audience, logout vô hiệu token cũ, tài khoản bị khóa.
- RBAC/tenant: chặn user chưa đăng nhập, CASHIER vào API OWNER, chặn management tại branch, chặn chi nhánh organization khác, giả mạo organization trong header/query, khóa ngoại ghép chặn assignment chéo organization; xóa assignment làm mất quyền ngay.
- Guard cấu hình: chặn retail_management, retail_datawarehouse, tên database khác/thiếu và JWT_SECRET quá ngắn trước kết nối.
- Edge headless + Vite proxy + backend + MySQL thật: redirect protected route, đăng ký, báo sai mật khẩu, login, dashboard đúng tên cửa hàng/email, cookie không đọc được qua document.cookie, reload giữ phiên, danh sách chi nhánh thật, logout và chặn truy cập lại. Không có pageerror trong lượt chạy đạt.
- Frontend production build đã thành công; có cảnh báo chunk lớn hơn 500 kB do giữ các trang/chart cũ.
- Cập nhật Zod và React Router để xử lý cảnh báo bảo mật dependency. Không thay React 18.

## Các nhóm file bàn giao

- backend/src/config/env.js; backend/src/db/pool.js, migrate.js, migrations/001_auth.sql.
- backend/src/routes/auth.js; backend/src/middlewares/auth.js; backend/src/utils/http.js; backend/src/app.js và server.js.
- backend/test/config.test.js, auth.integration.test.js.
- frontend/src/auth/AuthContext.jsx, ProtectedRoute.jsx; frontend/src/services/auth.js, api.js.
- frontend/src/pages/Login.jsx, Register.jsx, ForgotPassword.jsx, Dashboard.jsx, Branches.jsx; ResearchDashboard.jsx và ResearchBranches.jsx giữ bản cũ.
- frontend/src/app/App.jsx, components/layout/AppLayout.jsx, styles/global.css; tailwind.config.js, postcss.config.js.
- frontend/playwright.config.js, tests/auth.spec.js; package.json và lockfiles của frontend/backend.
- README.md, .gitignore, .env.example ở từng ứng dụng và báo cáo này. File backend/.env do người dùng cấu hình, không in nội dung và không ghi đè.

## Chưa hoàn thành / giới hạn

Quên mật khẩu trả 503 rõ ràng do chưa có email provider; chưa có reset token/email verification. Các màn hình nghiệp vụ ngoài dashboard/chi nhánh còn là demo, chưa có CRUD sản phẩm/kho/bán hàng hoặc API AI. Nhân sự/cài đặt giữ UI tham khảo; backend đã có RBAC nhưng chưa có API cấp tài khoản/phân công qua UI. Bộ chọn chi nhánh chưa lọc các bảng demo. Chưa cấu hình CI/CD hosting; kiểm thử hiện chạy cục bộ. Chưa kiểm chứng HTTPS/Secure cookie hoặc tải đồng thời trong môi trường production. Bundle cần chia nhỏ ở sprint tối ưu giao diện.

Lệnh khởi động và kiểm thử được ghi trong README. Sprint tiếp theo: sản phẩm/tồn kho thật theo Phase 0; email và CI/CD cần cấu hình riêng trước khi tuyên bố hoàn tất.

## Kết quả chốt sau cập nhật dependency

- Backend: **14/14 test đạt**, không fail/skip, có kiểm thử JWT giả mạo/hết hạn/sai audience.
- Frontend Edge: **1/1 kịch bản đầu-cuối đạt** sau nâng React Router.
- Production build: thành công; JavaScript bundle 682.53 kB (gzip 198.16 kB), còn cảnh báo chunk >500 kB.
- npm audit backend và frontend: **0 cảnh báo bảo mật được báo cáo tại thời điểm kiểm tra**.
- Kiểm tra dọn fixture cuối: **0 tài khoản thử, 0 organization thử còn lại**.
- Migration chạy lần đầu và chạy lại đều thành công, phiên bản 001_auth.

## Làm rõ nhận xét về dữ liệu demo — khảo sát tiếp theo

Nhận xét “sản phẩm/kho/AI còn là demo” ở trên chỉ nói về các màn hình chưa kết nối nguồn dữ liệu/API trong ứng dụng mới. Nghiên cứu AI đã có mã và kết quả thực nghiệm; không cần xây dựng lại công trình từ đầu. Khảo sát notebook, artifact và kế hoạch tái sử dụng được ghi tại `docs/AI_SURVEY_AND_SPRINT2_PLAN.md`. Đây là kế hoạch để xem xét, chưa triển khai Sprint 2.
