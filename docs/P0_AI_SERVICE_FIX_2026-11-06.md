# Khắc phục P0: AI Service không nạp token — 06/11/2026

Kiểm tra lại lúc 09:55 UTC+7. Chỉ xử lý startup/cấu hình runtime của AI Service đã được phê duyệt. Không thực hiện P1/P2.

## Nguyên nhân đã xác minh

Cổng 127.0.0.1:8000 trước sửa do PID 16536 giữ. Command line thực tế:

~~~text
python.exe ...\Scripts\uvicorn.exe app.main:app --reload --port 8000
~~~

Thư mục làm việc PID 16536 được đọc trực tiếp từ thông tin process Windows: C:\DaiHoc\NCKH\retail_excel_experiment\ai-service\. Launcher Uvicorn PID 2844; worker multiprocessing PID 13260, parent 16536. Command line worker có spawn_main(parent_pid=16536,...). Đã xác minh PID, quan hệ parent/child, command line và thời điểm tạo PID 16536 trước khi dừng; từ chối nếu cây có descendant khác dự kiến.

Lệnh Uvicorn trực tiếp không chạy [run.py](../ai-service/run.py) và không có --env-file. main.py/models.py không tự đọc .env. Vì vậy token có trong file không tự xuất hiện trong môi trường tiến trình. Hàm protect ở [main.py](../ai-service/app/main.py) đọc os.getenv('AI_SERVICE_TOKEN',''); HTTP 503 “AI service token chưa được cấu hình” xác nhận token runtime thiếu hoặc ngắn dưới 32 ký tự. Không đọc/in giá trị token trong bộ nhớ tiến trình.

Đối chiếu hai file backend/.env và ai-service/.env trong bộ nhớ: token có, đủ chiều dài và khớp nhau. Không xuất giá trị. Đây là lỗi cách khởi động/nạp cấu hình, không phải cần tạo hoặc đổi token.

## Thao tác thực hiện

Dừng đúng cây Uvicorn đã xác minh bằng taskkill /PID 2844 /T /F: các PID 13260, 16536, 2844 đã dừng. Không dừng tiến trình Python/Node khác. Đảm bảo cổng 8000 đã trống trước khi mở service mới.

Khởi động cửa sổ ẩn bằng Start-Process, working directory đúng ai-service:

~~~text
C:\DaiHoc\NCKH\retail_excel_experiment\ai-service\.venv\Scripts\python.exe -B run.py
~~~

Chỉ bỏ biến AI_SERVICE_TOKEN kế thừa trong shell khởi động tạm thời, để setdefault trong run.py nạp giá trị từ file .env hiện có. Không thay biến môi trường User/Machine và không tạo token. run.py chuyển cwd về thư mục của nó rồi đọc .env; không có auto-fit hoặc migration.

| Tiến trình mới | Vai trò |
|---|---|
| 1932 | Launcher .venv\Scripts\python.exe -B run.py |
| 22600 | Python runtime, parent 1932, thực sự LISTEN 127.0.0.1:8000 |
| 20712 | Console host Windows do Start-Process tạo, không phải service AI khác |

Không dùng --reload ở lần khởi động này; đây là lệnh run.py đã có sẵn trong hướng dẫn dự án. Đây là thay đổi lệnh runtime, không thay cấu hình production hoặc cài startup service hệ điều hành.

## Kiểm thử trước/sau

| Kiểm tra HTTP thật | Trước | Sau |
|---|---:|---:|
| GET http://127.0.0.1:8000/health | 200 | 200 |
| GET /v1/readiness, token hợp lệ từ backend/.env | 503 | 200 |
| GET /v1/readiness, không có token | 503 | 401 |
| GET /v1/readiness, token sai | 503 | 401 |

/health sau sửa: status=ok, training_enabled=false.

/v1/readiness sau sửa và lần kiểm tra ổn định tiếp theo: hybrid và stockout đều UNAVAILABLE, reason=MISSING_MODEL_ARTIFACT, version=null. algorithms.replenishment/corrected_total/seasonal_trend=READY; live_metrics=null. READY của công thức không có nghĩa đã có đầu vào thực hoặc forecast thật. Thư mục models vẫn chỉ README.md.

Đã gọi chính hàm aiCall('/v1/readiness') ở [Backend ai.js](../backend/src/business/ai.js) với cấu hình Backend hiện có và nhận readiness thành công. Đây là kiểm tra helper kết nối Backend→FastAPI, không phải kiểm thử HTTP có session của tiến trình Backend đang chạy.

Ở lượt kiểm tra bằng công cụ trước đó, GET /api/v1/ai/readiness qua Backend cổng 3000 và Vite 127.0.0.1:5173 không có cookie đều trả 401 “Vui lòng đăng nhập”, đúng yêu cầu xác thực. Sau đó, người dùng kiểm thử trực tiếp trong DevTools Console tại http://127.0.0.1:5173/ bằng phiên OWNER đang đăng nhập và xác nhận **HTTP 200 — PASS readiness qua phiên OWNER thật**. Response có models, algorithms và live_metrics:null; yêu cầu này không còn lỗi 401/503. Đây là bằng chứng kiểm thử thủ công do người dùng cung cấp, không phải tôi tự chạy bằng cookie của người dùng.

**Phạm vi PASS:** Vite proxy → Backend xác thực phiên OWNER → FastAPI readiness. Chưa phải kiểm thử inference của 5 chức năng AI, chưa chứng minh model có weights hoặc dữ liệu đủ để dự báo, cũng chưa thay thế verifier tự động login/me/reload/logout trên cả hai hostname.

Lệnh người dùng đã thực hiện là fetch('/api/v1/ai/readiness', { credentials: 'include' }). Có thể dùng đoạn dưới để tái kiểm tra và xem status/body, không gửi cookie/token vào chat:

~~~javascript
fetch('/api/v1/ai/readiness', { credentials: 'include' })
  .then(async response => ({
    status: response.status,
    data: await response.json()
  }))
  .then(console.log);
~~~

Kết quả người dùng đã xác nhận: status 200, response có models, algorithms và live_metrics:null. Tình trạng UNAVAILABLE/MISSING_MODEL_ARTIFACT của hai model đã được ghi nhận bằng kiểm thử service trước đó; không suy ra weights đã sẵn sàng từ status 200 của readiness. Không đưa service token vào Frontend; Backend tự gắn token khi gọi FastAPI.

## File và cấu hình

Không sửa source code, backend/.env hoặc ai-service/.env; không tạo/thay token. Chỉ cập nhật tài liệu:

- docs/P0_AI_SERVICE_FIX_2026-11-06.md (báo cáo này).
- docs/RETAIL_INSIGHT_AUDIT_2026-11-06.md (ghi chú cập nhật, giữ kết quả audit ban đầu làm lịch sử).

Để tự khởi động đúng ở terminal PowerShell lần sau:

~~~powershell
Set-Location 'C:\DaiHoc\NCKH\retail_excel_experiment\ai-service'
.\.venv\Scripts\python.exe -B run.py
~~~

Chỉ chạy khi cổng 8000 chưa có service này; không mở thêm instance song song. Không quay lại lệnh uvicorn trực tiếp thiếu bước nạp .env. Không hiển thị token trong command line.

## Phạm vi còn lại

P0 nạp token đã được khắc phục ở AI Service đang chạy. Weights Hybrid30/Stockout, upstream Jan17, dữ liệu lịch sử và forecast snapshot vẫn thiếu/chưa sẵn sàng theo audit trước; không kích hoạt hoặc thay thế model. Không gọi inference để tạo forecast, không tạo demo, không fit, không sửa pipeline, database hoặc kết quả nghiên cứu.

Chưa thực hiện P1/P2. Các bước đó tiếp tục chờ phê duyệt riêng.
