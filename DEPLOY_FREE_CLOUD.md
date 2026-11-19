# Triển khai Retail Insight lên GitHub, Render, Vercel và TiDB Cloud

Hướng dẫn này triển khai frontend lên Vercel, API Node và AI FastAPI thành hai dịch vụ Render riêng, còn MySQL chạy trên TiDB Cloud. Tệp `render.yaml` khai báo hai dịch vụ Render; `frontend/vercel.json` cấu hình điều hướng SPA.

## 1. Rà soát trước khi đẩy GitHub

- Đưa mã nguồn lên repository GitHub. `.gitignore` ở gốc chặn `.env`, `.env.*`, `*.env`, `node_modules/`, `.venv/`, `venv/` và `*.log`; các tệp mẫu `.env.example` được giữ lại.
- Không đưa mật khẩu, khóa API, dữ liệu khách hàng hoặc bản dump chưa làm sạch vào GitHub. Nếu một bí mật từng được commit, hãy thu hồi/đổi bí mật đó; thêm `.gitignore` không xóa nó khỏi lịch sử Git.
- `deploy/retail_app_prod.sql` được tạo từ database `retail_app` đang cấu hình cho backend. Export giữ lược đồ và dữ liệu nghiệp vụ, thay email/tên/số điện thoại, địa chỉ và thông tin thanh toán nhận diện được; đặt lại hash mật khẩu; làm trống cài đặt dạng JSON và bỏ dữ liệu session, OTP, hỗ trợ, audit, bảo mật, thông báo. Tạo tài khoản thực sau khi nạp DB.

## 2. Tạo database TiDB Cloud

1. Tạo cluster TiDB Cloud và database mới, còn trống, tên `retail_app`. Snapshot dùng `CREATE TABLE IF NOT EXISTS` và không xóa bảng hiện có; chỉ nhập vào database mới để tránh xung đột khóa hoặc dữ liệu.
2. Tạo thông tin kết nối ứng dụng. Lấy hostname, cổng, username và password từ trang Connect của cluster. TiDB Cloud Starter/Essential thường cung cấp cổng TLS `4000`; dùng đúng thông tin cluster của bạn.
3. Nạp snapshot bằng MySQL client theo lệnh kết nối TLS do TiDB cung cấp, với `deploy/retail_app_prod.sql` làm input. Ví dụ tổng quát:

   ```sh
   mysql --host=<TIDB_HOST> --port=4000 --user=<TIDB_USER> --password --ssl-mode=VERIFY_IDENTITY --ssl-ca=<CA_PATH> retail_app < deploy/retail_app_prod.sql
   ```

   Dùng nguyên username có prefix do TiDB Cloud cấp. Nếu CA được tin cậy sẵn trên máy, có thể bỏ `--ssl-ca`; nếu không, tải CA từ trang Connect và điền đúng đường dẫn. Không ghi password trực tiếp vào lệnh hoặc commit tệp credential.

## 3. Tạo dịch vụ trên Render

1. Trong Render, tạo Blueprint từ repository GitHub và dùng `render.yaml` ở thư mục gốc. Blueprint tạo `retail-insight-api` (Node) và `retail-insight-ai` (Python), cả hai ở gói `free`.
2. Điền biến cần nhập trong Render Dashboard cho dịch vụ API:

   | Biến | Giá trị cần nhập |
   | --- | --- |
   | `MYSQL_HOST` | Hostname TiDB Cloud |
   | `MYSQL_USER` | Username kết nối TiDB |
   | `MYSQL_PASSWORD` | Password kết nối TiDB |
   | `MYSQL_SSL_CA` | PEM CA nếu nhà cung cấp yêu cầu; để trống nếu TLS xác minh bằng CA hệ thống hoạt động |
   | `FRONTEND_URL` | Origin Vercel chính xác, ví dụ `https://retail-insight.vercel.app` (không có `/` cuối) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Khuyến nghị trên Render Free để gửi OTP qua HTTPS; `EMAIL_FROM` phải là sender đã xác minh tại Resend |
   | `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Tùy chọn nếu dùng SMTP trên host không chặn cổng SMTP |
   | `GOOGLE_CLIENT_ID` | Client ID nếu bật đăng nhập Google |
   | `GEMINI_API_KEY`, `GROQ_API_KEY` | Điền nếu bật nhà cung cấp AI tương ứng |
   | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Điền nếu bật TTS Azure |

   Các giá trị `MYSQL_PORT=4000`, `MYSQL_DATABASE=retail_app`, `MYSQL_SSL=true`, `NODE_ENV=production`, `TRUST_PROXY=1` và `ALLOW_DEV_OTP=0` đã khai báo trong Blueprint. Render sinh `JWT_SECRET` và `AI_SERVICE_TOKEN`; token AI được chia sẻ an toàn giữa hai dịch vụ qua tham chiếu Blueprint. `AI_SERVICE_URL` lấy hostname HTTPS công khai của AI service. Hai dịch vụ free không nhận được kết nối vào qua private network nên API gọi AI qua hostname HTTPS công khai. Render Free chặn SMTP outbound trên 25/465/587, vì vậy dùng `RESEND_API_KEY` với sender đã xác minh để email OTP đi qua HTTPS; nếu không bật email provider, chức năng xác minh email không gửi được mã trên gói này.

3. Nếu cần thêm nhiều origin frontend, đặt `CORS_ORIGIN` thành danh sách origin HTTPS, phân tách bằng dấu phẩy. `FRONTEND_URL` là cấu hình chính; CORS đã bật `credentials: true`.
4. Sau khi triển khai, endpoint kiểm tra API là `https://<API_HOST>/api/health`. Render phải truy cập được TiDB để endpoint báo `status: ok`.

## 4. Tạo dự án Vercel

1. Import cùng repository vào Vercel và đặt **Root Directory** là `frontend`.
2. Dùng lệnh build `npm run build`, thư mục output `dist`.
3. Khai báo các biến môi trường sau trong Vercel cho Production (và Preview nếu cần), rồi tạo deployment mới:

   | Biến | Giá trị |
   | --- | --- |
   | `VITE_API_URL` | `https://<API_HOST>/api/v1` — URL công khai của dịch vụ Render API, không có `/` cuối |
   | `VITE_DATA_MODE` | `live` |
   | `VITE_GOOGLE_CLIENT_ID` | Client ID nếu dùng Google Sign-In; để trống nếu không dùng |

   `VITE_API_BASE_URL` và `VITE_AUTH_BASE_URL` chỉ là alias cũ, không cần đặt khi đã khai báo `VITE_API_URL`. Biến `VITE_*` được đóng gói vào JavaScript phía trình duyệt; không đặt secret trong Vercel frontend.

4. Sao chép domain Production Vercel sang `FRONTEND_URL` của API trên Render nếu chưa điền đúng, rồi redeploy API. `FRONTEND_URL` phải khớp origin chính xác và không có dấu `/` cuối.

## 5. Xác minh sau triển khai

- Mở `https://<API_HOST>/api/health`; kiểm tra `status` và `database`.
- Mở trang Vercel, đăng nhập, tải lại trang và xác nhận phiên vẫn tồn tại. Frontend gửi cookie với `credentials: include`; production đặt cookie `Secure; SameSite=None` và CORS trả credentials cho origin cho phép.
- Kiểm tra request API trong Developer Tools. Nếu CORS bị từ chối, kiểm tra `FRONTEND_URL` khớp domain đang mở, gồm cả `www` nếu có.
- Dịch vụ Render miễn phí có thể ngủ/khởi động chậm và tài nguyên bị giới hạn. Các model AI (`*.joblib`, `*.pkl`) bị loại khỏi Git; nếu dự báo yêu cầu model artifact, cung cấp artifact đã xác minh riêng cho AI service. Không commit artifact chứa dữ liệu hoặc bí mật.
- Khi dùng hai hostname khác nhau (`vercel.app` và `onrender.com`), một số trình duyệt/chính sách riêng tư có thể hạn chế cookie cross-site. Nếu gặp lỗi cookie, dùng domain tùy chỉnh cùng site hoặc cấu hình Vercel proxy cùng origin trước khi phát hành rộng.

## Danh sách biến môi trường

### Render — API (`retail-insight-api`)

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `NODE_ENV` | Có | `production` |
| `PORT` | Tự cấp | Render đặt tự động |
| `TRUST_PROXY` | Có | `1` |
| `MYSQL_HOST` | Có | Host TiDB |
| `MYSQL_PORT` | Có | `4000` cho endpoint TLS của TiDB Cloud; xác nhận trong cluster |
| `MYSQL_USER` | Có | User ứng dụng TiDB |
| `MYSQL_PASSWORD` | Có | Secret |
| `MYSQL_DATABASE` | Có | `retail_app` |
| `MYSQL_SSL` | Có | `true` |
| `MYSQL_SSL_CA` | Tùy chọn | Nội dung PEM nếu dùng CA riêng |
| `JWT_SECRET` | Có | Render tự sinh bởi Blueprint; tối thiểu 32 byte |
| `FRONTEND_URL` | Có | Origin Vercel chính xác |
| `CORS_ORIGIN` | Tùy chọn | Origin bổ sung, phân tách bằng dấu phẩy |
| `AI_SERVICE_URL` | Có | Blueprint tham chiếu host AI Render |
| `AI_SERVICE_TOKEN` | Có | Render sinh và chia sẻ giữa API/AI |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Tùy chọn | Dùng trên host cho phép SMTP; cổng mặc định 465 |
| `RESEND_API_KEY`, `EMAIL_FROM` | Khuyến nghị trên Render Free nếu cần email/OTP | Resend API key và địa chỉ sender đã xác minh; gửi qua HTTPS |
| `GOOGLE_CLIENT_ID` | Tùy chọn | OAuth phía backend |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | Tùy chọn | Nhà cung cấp LLM |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_TTS_VOICE` | Tùy chọn | Azure TTS |
| `RESEARCH_MYSQL_HOST`, `RESEARCH_MYSQL_PORT`, `RESEARCH_MYSQL_USER`, `RESEARCH_MYSQL_PASSWORD` | Tùy chọn | Chỉ dùng nếu cấu hình riêng database nghiên cứu lịch sử; không dùng cho DB vận hành TiDB |
| `ALLOW_DEV_OTP` | Có | `0` ở production |

### Render — AI (`retail-insight-ai`)

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `PORT` | Tự cấp | Render đặt tự động và lệnh start sử dụng biến này |
| `AI_SERVICE_TOKEN` | Có | Cùng giá trị với API, được Blueprint tham chiếu |
| `MODEL_DIRECTORY` | Không | Mặc định `./models` |
| `RESEARCH_ARTIFACT_DIRECTORY` | Không | Mặc định `../data/research` |

### Vercel — Frontend

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `VITE_API_URL` | Có | `https://<API_HOST>/api/v1` |
| `VITE_DATA_MODE` | Có | `live` để dùng backend thay dữ liệu demo |
| `VITE_GOOGLE_CLIENT_ID` | Tùy chọn | Client ID nếu bật Google Sign-In |

Tài liệu nhà cung cấp: [Render Blueprints và biến môi trường](https://render.com/docs/blueprint-spec), [giới hạn Render Free](https://render.com/docs/free), [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite), [biến môi trường Vercel](https://vercel.com/docs/environment-variables), [kết nối TiDB bằng Node.js/mysql2](https://docs.pingcap.com/tidb/dev/dev-guide-sample-application-nodejs-mysql2/), [nhập dữ liệu TiDB Cloud Starter/Essential](https://docs.pingcap.com/tidbcloud/import-with-mysql-cli-serverless/?plan=essential), [gửi email qua Resend](https://resend.com/features/email-api).
