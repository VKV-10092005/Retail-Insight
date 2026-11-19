# Triển khai Retail Insight

## Chạy cục bộ

Giữ backend/.env hiện có. Không copy đè file này. Mật khẩu và token không ghi vào README/terminal/log. Backend dùng MySQL retail_app, đã có migration 001_auth và 002_operations trong lần triển khai hiện tại.

```powershell
cd backend
npm.cmd ci
npm.cmd run check:schema
npm.cmd run dev
```

Terminal AI:

```powershell
cd ai-service
# Lần đầu: python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe run.py
```

Backend AI_SERVICE_TOKEN và ai-service/.env phải trùng nhau, tối thiểu 32 byte. Token cục bộ đã được tạo an toàn trong đợt triển khai, không hiển thị ra terminal. MODEL_DIRECTORY mặc định ai-service/models. Artifact nghiên cứu được sao chép/kiểm tra hash trong data/research, không kích hoạt quyền dataset.

Terminal frontend:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Mở http://localhost:5173; backend 127.0.0.1:3000; FastAPI 127.0.0.1:8000. Trình duyệt gọi /api qua Vite; không gọi trực tiếp AI. AI /v1/* cần Bearer service token; /health chỉ kiểm tra tiến trình.

## Tài khoản MySQL nghiên cứu chỉ đọc

Trong Workbench, đăng nhập bằng tài khoản quản trị của người vận hành. Administration → Users and Privileges → Add Account; đặt research_reader, host 127.0.0.1 nếu DB cùng máy; nhập mật khẩu trong form. Không chọn administrative roles. Schema Privileges: chỉ SELECT trên hai schema retail_management và retail_datawarehouse, không Grant Option, không quyền global SELECT hoặc role có quyền khác. Apply.

Tự điền 4 biến trong backend/.env: RESEARCH_MYSQL_HOST, RESEARCH_MYSQL_PORT, RESEARCH_MYSQL_USER, RESEARCH_MYSQL_PASSWORD. Không đưa mật khẩu vào lệnh shell hoặc gửi trong chat.

```powershell
cd backend
npm.cmd run check:research
```

Lệnh kiểm tra SHOW GRANTS và SELECT, chỉ in trạng thái/quyền/tên database, không in mật khẩu/grant thô. Kết nối ghi ứng dụng vẫn chỉ chấp nhận retail_app; không dùng root cho reader.

Nếu MySQL nghiên cứu ở server khác, giới hạn host theo địa chỉ backend thực tế và firewall riêng. Không dùng tài khoản ứng dụng vận hành để đọc nghiên cứu. Không cấp dataset cho organization nào cho đến khi chủ dự án xác nhận; code đăng ký không có bước cấp quyền này.

## Docker Compose trên server

Đã chuẩn bị 5 services: mysql riêng cho retail_app, backend, ai, web/Caddy và migrate chạy thủ công theo profile tools. Chỉ web mở port 80/443; MySQL/backend/AI không publish ra Internet. Models và artifact mount read-only. Volume MySQL giữ dữ liệu qua các lần restart.

1. Chuẩn bị server có Docker Engine/Compose, domain và DNS trỏ tới server. Mở port 80/443 cho Caddy cấp chứng chỉ HTTPS.
2. Tạo deploy/.env từ deploy/.env.example và điền PUBLIC_HOST, PUBLIC_ORIGIN=https://domain, MYSQL_APP_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET, AI_SERVICE_TOKEN bằng secret mới của server. Không in hoặc commit file này. Không sử dụng backend/.env cục bộ làm secrets production.
3. Kiểm tra cấu hình bằng chế độ không in secrets:

```bash
docker compose --env-file deploy/.env config --quiet
docker compose --env-file deploy/.env up -d mysql
```

4. Khi được phép tạo/cập nhật schema trên retail_app server mới, chạy migration tách biệt:

```bash
docker compose --env-file deploy/.env --profile tools run --rm migrate
```

5. Khởi động ứng dụng:

```bash
docker compose --env-file deploy/.env up -d --build
docker compose --env-file deploy/.env ps
```

Caddy phục vụ SPA và reverse proxy /api tới backend. NODE_ENV=production bật Secure cookie; CORS_ORIGIN phải khớp PUBLIC_ORIGIN. TRUST_PROXY=1 chỉ dùng khi backend nằm sau đúng một proxy tin cậy, không publish port backend trực tiếp.

Compose không tự import SQL dump nghiên cứu, không tự kết nối/cấp quyền dataset khi các biến nghiên cứu bỏ trống, không tự chạy migration khi backend khởi động và không huấn luyện AI. Không xóa volume database khi nâng cấp. Sao lưu dữ liệu trước khi chạy migration nâng cấp; quản lý backup theo môi trường vận hành.

## Kiểm chứng và giới hạn

Cấu trúc YAML/anchors, service dependencies, private ports và read-only mounts đã được kiểm tra bằng parser. Máy làm việc hiện không có Docker CLI nên chưa build/chạy container hoặc kiểm thử HTTPS thực tế. Đây là cấu hình triển khai để kiểm chứng tiếp trên server, không phải xác nhận đã deploy thành công.

Hóa đơn hiện là chứng từ bán hàng nội bộ; chưa tích hợp hóa đơn điện tử thuế. Tồn kho có số lượng thực, chưa có phương pháp định giá kế toán được xác nhận. Các trang/nguồn demo cũ được giữ trong mã tham khảo, không dùng làm nguồn cho các route vận hành chính. Trả hàng, chuyển kho, chiết khấu/thanh toán nhiều phương thức và khôi phục mật khẩu qua email chưa thuộc phần đã nghiệm thu.

## Bootstrap OWNER ??u ti?n tr?n m?y c?c b?

Gi? nguy?n backend/.env ?ang c?u h?nh MYSQL_DATABASE=retail_app. Ch?y trong terminal PowerShell t??ng t?c:

```powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\backend'
npm.cmd run bootstrap:owner
```

T? nh?p email, t?n ng??i qu?n tr?, t?n t? ch?c/chi nh?nh m?c ??nh, m?t kh?u v? x?c nh?n m?t kh?u. Hai l??t nh?p m?t kh?u ???c ?n ho?n to?n; t?i thi?u 12 k? t?, t?i ?a 72 byte UTF-8. Kh?ng truy?n th?ng tin ??ng nh?p qua tham s?, pipe, file ho?c bi?n m?i tr??ng. Ctrl+C ? l?i nh?c s? h?y thao t?c.

CLI ki?m tra ??ng retail_app v? l?y MySQL advisory lock retail_app_bootstrap_owner tr?n c?ng k?t n?i. N?u kh?a b?n ho?c c? b?t k? OWNER n?o (k? c? DISABLED), CLI d?ng tr??c khi h?i th?ng tin. N? ki?m tra OWNER l?i trong transaction, d?ng bcrypt cost 12 v? t?o organization, user OWNER, branch c?ng user_branch_roles trong m?t transaction. R?ng bu?c UNIQUE email/slug v? kh?a ngo?i c?a schema hi?n t?i v?n ?p d?ng; l?i tr??c commit s? rollback. Kh?ng ch?y ??ng th?i quy tr?nh ??ng k? kh?c khi kh?i t?o l?n ??u; advisory lock ?i?u ph?i c?c l?n ch?y CLI bootstrap. Kh?ng ch?y migration, kh?ng truy c?p database nghi?n c?u.

Sau commit, CLI t? m? Backend Express th?t tr?n c?ng loopback t?m th?i b?ng c?u h?nh MySQL hi?n c?; kh?ng y?u c?u kh?i ??ng m?t backend kh?c. N? g?i POST /api/v1/auth/login, GET /api/v1/auth/me, GET /api/v1/users v? GET /api/v1/branches/:id/management. Ch? b?o PASS khi ??ng nh?p 200, ??ng user/organization/branch, vai tr? OWNER v? hai API qu?n tr? tr? 200. Cu?i c?ng g?i logout, thu h?i phi?n ki?m th? v? ??ng backend t?m. M?t kh?u ch? gi? t?m trong b? nh?; kh?ng in cookie, m?t kh?u ho?c hash. Ki?m th? th?nh c?ng c?p nh?t last_login_at v? l?u phi?n ?? thu h?i theo lu?ng x?c th?c hi?n c?.

N?u t?o t?i kho?n ?? commit nh?ng ki?m th? th?t b?i, CLI b?o r? v? tr? m? l?i; t?i kho?n ???c gi? nguy?n, kh?ng t? x?a/reset/t?o l?i. Ki?m tra k?t n?i r?i ??ng nh?p qua giao di?n. Ch?y l?i bootstrap khi ?? c? OWNER s? d?ng.
