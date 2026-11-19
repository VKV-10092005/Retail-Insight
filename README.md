# Retail Insight — ứng dụng vận hành bán lẻ

React 18 + Vite + Tailwind, Express, MySQL retail_app và FastAPI nội bộ. Phát triển tiếp từ retail-ai-system; nguồn nghiên cứu giữ nguyên, chỉ đọc.

Luồng đã lập trình: đăng ký tạo cửa hàng/OWNER/chi nhánh; quản lý chi nhánh và nhân viên; danh mục/sản phẩm; nhập kho; bán hàng trừ tồn bằng transaction; chứng từ và Dashboard BI từ giao dịch thực. Các route chính không dùng mockData làm dữ liệu dự phòng.

Bộ AI có hợp đồng API, kiểm tra dữ liệu, cơ chế load đúng model và trạng thái chưa sẵn sàng khi thiếu artifact. Không tự train. AI-5 và các thuật toán không cần weights có kiểm thử riêng; metrics nghiên cứu không gán cho cửa hàng mới.

- [Kết quả Sprint 2](docs/SPRINT2_REPORT.md)
- [Chạy cục bộ và triển khai Docker/HTTPS](docs/DEPLOYMENT.md)
- [Hợp đồng API](docs/API.md)
- [Bàn giao và kích hoạt model](docs/MODEL_HANDOFF.md)
- [Khảo sát nguồn và kế hoạch trước triển khai](docs/AI_SURVEY_AND_SPRINT2_PLAN.md)

## Chạy nhanh

Backend/.env đã cấu hình: không ghi đè. Các lệnh dưới chạy trong các terminal riêng:

```powershell
cd backend
npm.cmd ci
npm.cmd run check:schema
npm.cmd run dev
```

```powershell
cd ai-service
.venv/Scripts/python.exe run.py
```

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Mở http://localhost:5173. Hướng dẫn tạo Python environment, biến môi trường và cấu hình production nằm trong DEPLOYMENT.md. Cửa hàng mới hiển thị chưa có dữ liệu cho đến khi người dùng ghi nhận giao dịch.

## Kiểm thử

```powershell
cd backend
$env:RUN_DB_TESTS='1'
npm.cmd test
Remove-Item Env:RUN_DB_TESTS
npm.cmd run check:research
```

```powershell
cd ai-service
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

```powershell
cd frontend
npm.cmd run build
npm.cmd run test:e2e
```

E2E dùng Edge headless đã cài, cần frontend/backend/AI đang chạy. Test MySQL tạo fixture riêng với email UUID, sau đó dọn đúng organization do test tạo trong retail_app. Nguồn nghiên cứu không bị ghi hoặc sửa. Test hồi quy Parquet đọc gói bàn giao tại data/research; nếu chưa chuẩn bị artifact trên môi trường khác, test này được bỏ qua rõ ràng.

## Phân tách dữ liệu

retail_app là database duy nhất được migrate/ghi. Pool ứng dụng kiểm tra chính xác database đích. Reader nghiên cứu riêng từ chối root, quyền ghi, role/grant rộng; chỉ chạy SELECT đã định nghĩa trên retail_management/retail_datawarehouse. Dataset không tự cấp khi đăng ký. Người dùng không phải nhập organization ID; backend lấy organization/branch scope từ phiên JWT và phân công trong DB.

Gói artifact mới đã được sao chép vào data/research bằng scripts/prepare_research_artifacts.py (chỉ CSV/Parquet whitelist, có SHA-256); SQL trong ZIP không được thực thi. Dữ liệu lịch sử/mô phỏng giữ nhãn và kỳ, không trở thành tồn kho hiện tại của khách hàng.
