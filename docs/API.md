# Hợp đồng API Retail Insight

Base: /api/v1. Trình duyệt dùng HttpOnly cookie, credentials: include. Request ghi JSON có X-Requested-With: retail-web và Origin khớp CORS_ORIGIN. Backend lấy organization_id từ phiên, không nhận organization do người dùng tự nhập. Lỗi có message; validation có issues; không trả password_hash.

## Tài khoản / cửa hàng / nhân viên

| Method | Path | Payload / kết quả | Quyền |
|---|---|---|---|
| POST | /auth/register | name,email,password,storeName; tạo organization + OWNER + branch trong transaction | Công khai, rate limit |
| POST | /auth/login | email,password; cookie JWT 8 giờ | Công khai, rate limit |
| GET | /auth/me | Tài khoản và branches được phân công | Đã đăng nhập |
| POST | /auth/logout | Thu hồi phiên và xóa cookie | Đã đăng nhập |
| GET | /branches | branches gồm id,name,status,address,phone | Owner toàn cửa hàng; staff chỉ chi nhánh được phân công |
| POST | /branches | name,address?,phone? | OWNER |
| PUT | /branches/:id | name,address?,phone? | OWNER, cùng organization |
| GET | /staff | Danh sách tài khoản và branch_ids | OWNER |
| POST | /staff | name,email,password,role,branch_ids | OWNER; role MANAGER/INVENTORY/CASHIER; branch_ids do GET /branches cung cấp |
| PATCH | /staff/:id | role,status,branch_ids | OWNER; không sửa OWNER qua endpoint này |

Giới hạn 100 thao tác credential POST trong 15 phút/IP cho login/register/forgot-password; kiểm tra phiên GET /auth/me không tiêu thụ hạn mức này. Lỗi 429 trả JSON tiếng Việt. Mật khẩu ít nhất 12 ký tự khi tạo, tối đa 72 byte trước bcrypt; không có tài khoản/mật khẩu demo. Chức năng quên mật khẩu vẫn trả 503 vì chưa có dịch vụ email. Role của staff hiện được áp dụng đồng nhất cho các chi nhánh được chọn. Khóa tài khoản/vai trò được kiểm tra lại từ DB khi dùng JWT cũ.

## Danh mục / sản phẩm

| Method | Path | Payload / query |
|---|---|---|
| GET | /categories | items |
| POST | /categories | name; OWNER/MANAGER |
| GET | /products | q,category_id,page,limit; items,total,page,limit,source=OPERATIONAL |
| POST | /products | sku,name,sale_price,cost_price?,category_id?,status?,attributes?; OWNER/MANAGER |
| PUT | /products/:id | Cùng payload; cập nhật/thay thế danh mục; OWNER/MANAGER |

Giá không âm, tối đa 2 số thập phân. cost_price chỉ là tham khảo, không tự được coi là giá trị tồn theo kế toán. attributes là object giá trị string/number/null để lưu thông tin sản phẩm có thật phục vụ AI; không tự gán mã nhóm/brand của nghiên cứu cho cửa hàng mới. Sản phẩm ngừng bán dùng status=DISABLED; chứng từ cũ giữ tên/SKU/giá tại thời điểm giao dịch.

## Nhập hàng / tồn kho / bán hàng

POST /receipts và POST /sales nhận:

```text
branch_id: ID chi nhánh đã được phân công
request_key: chuỗi duy nhất cho một lần gửi, 12–80 ký tự
note: tùy chọn
items: [{product_id, quantity, unit_price?}]
```

ID trong payload lấy từ API/selector, không phải organization do người dùng khai báo. quantity là số nguyên dương; tối đa 100 dòng, không lặp product_id. Phiếu nhập bắt buộc unit_price. Bán hàng không nhận unit_price từ client, giá lấy từ danh mục trên máy chủ.

- RECEIPT: OWNER/MANAGER/INVENTORY đúng chi nhánh.
- SALE: OWNER/MANAGER/CASHIER đúng chi nhánh.
- Transaction ghi document + items + balance + movements cùng nhau. Khóa dòng tồn và sản phẩm theo thứ tự ID; tồn không âm. Thất bại thì rollback toàn bộ.
- Cùng request_key và cùng nội dung trả lại chứng từ cũ, không cộng/trừ tồn lần hai. Cùng key nhưng nội dung khác trả 409. Client giữ key khi retry, tạo key mới khi đổi nội dung hoặc sau thành công.

| Method | Path | Query/kết quả |
|---|---|---|
| GET | /receipts hoặc /sales | start,end,branch_id,page,limit; lịch sử theo quyền nghiệp vụ và chi nhánh |
| GET | /receipts/:id hoặc /sales/:id | document + items; không lộ chứng từ tổ chức/chi nhánh khác |
| GET | /inventory | branch_id,category_id,product_id,q,page,limit; tồn hiện tại và thời điểm |
| GET | /inventory/movements | start,end,branch_id,category_id,product_id,limit; biến động và tồn sau giao dịch |

Ngày lọc chứng từ dùng UTC, end bao gồm hết ngày đó. Tồn hiện tại không bị hồi tố theo date filter. Thiếu bản ghi tồn không được tự dựng thành tồn kho NCKH hoặc tồn đầu kỳ giả. Chứng từ bán hàng là hóa đơn nội bộ, chưa tích hợp hóa đơn điện tử thuế.

## Dashboard BI

GET /bi/overview: OWNER/MANAGER. Query: start,end,branch_id,category_id,product_id,granularity=day|month. Mỗi staff chỉ tổng hợp giao dịch của các chi nhánh được phân công.

Kết quả có source/as_of/filters/has_sales; kpi (orders,units,revenue), trend, by_branch, by_category, top_products, slow_products, inventory và movements. Các tổng hợp số lượng/doanh thu đều từ stock_documents/items loại SALE. Không có giao dịch thì has_sales=false và tổng thực tế bằng 0, kèm UI chưa có dữ liệu. Giá trị tồn và metrics AI không có bằng chứng được giữ null.

GET /ai/summary: cùng query phạm vi branch/category/product; KPI dự báo tổng hiệu chỉnh, tổng SKU/đơn vị đề xuất và cảnh báo chỉ có giá trị khi đủ đầu vào; nếu thiếu thì null. Phần AI dùng tháng đóng gần nhất, không tự áp bộ lọc ngày bán hàng thành backtest lịch sử.

## AI vận hành

| Method | Path | Nội dung |
|---|---|---|
| GET | /ai/readiness | Trạng thái model theo manifest và các thuật toán |
| GET | /ai/forecast | task=sku|total|replenishment|stockout|multi; origin=YYYY-MM; branch_id/category_id/product_id/version tùy chọn |
| GET | /ai/summary | Tổng hợp trạng thái và KPI có điều kiện cho Dashboard |

Chỉ OWNER/MANAGER. Express lấy lịch sử sản lượng, giá bán đã ghi nhận, thuộc tính sản phẩm và mốc tồn từ retail_app, sau đó gọi FastAPI bằng token nội bộ. Không nhận arbitrary training data từ trình duyệt và không có API train.

- origin là tháng đã kết thúc. SKU dự báo tháng tiếp theo; historical inference bằng thuộc tính hiện tại bị chặn khi origin khác tháng đóng gần nhất.
- SKU/context inference giới hạn 100 sản phẩm mỗi request để giới hạn kích thước và thời gian. Dùng bộ lọc SKU/danh mục khi vượt giới hạn. AI-5 tổng hợp tháng trực tiếp trong MySQL nên không bị giới hạn bởi số lượng SKU của pipeline này.
- SKU cần đủ 6 tháng đầy đủ và thuộc tính tương thích model. Thiếu weights trả UNAVAILABLE/MISSING_MODEL_ARTIFACT; thiếu lịch sử/thuộc tính trả INSUFFICIENT_DATA, không fallback sang MA2/SES.
- AI-2 phép hiệu chỉnh dựa actual/predicted tháng trước, clip 0.8–2.0. Chưa có frozen prior forecast trên dữ liệu vận hành thì trả MISSING_PREVIOUS_FORECAST_SNAPSHOT; không dùng số 95,53% để thay kết quả.
- AI-3 đúng max(0,ceil(pred)+ceil(0.2*pred)−stock). Stock được tái dựng đầu kỳ dự báo theo timestamp document, không dùng tồn hiện tại để giả làm tồn đầu kỳ. Thiếu stock/forecast thì recommended_quantity=null. Không tạo đơn nhập tự động.
- AI-4 đúng feature schema 7 cột và threshold 0.3299. Không có model thì không phát cảnh báo bằng quy tắc thay thế gắn F1 cũ.
- AI-5 tổng seasonal tháng năm trước × trend(mean 3 tháng gần nhất / mean 3 tháng trước đó), clip 0.85–1.15; horizon 1/2/3; cần đủ 12 tháng quan sát liên tục. Không dùng dữ liệu sau origin.

Response: status,reason?,items,source=OPERATIONAL,origin,observation_start; stock_as_of khi áp dụng; metrics luôn null cho đến khi có đánh giá thực tế đúng nguồn/kỳ. READY nói về khả năng tính với input hiện tại, không phải chứng nhận độ chính xác.

## FastAPI nội bộ

Không publish ra Internet. /health công khai trong mạng nội bộ; /v1/* cần Authorization: Bearer token giống backend. Giới hạn body 2 MB; dữ liệu hữu hạn, không âm và schema chặt.

| Path | Contract |
|---|---|
| GET /v1/readiness | model/algorithm readiness |
| POST /v1/sku | month,version?,items[{product_id,features đủ 30 trường}] |
| POST /v1/total | rows[{month,predicted,actual?}]; correction chỉ dùng tháng trước liên tục |
| POST /v1/replenishment | items[{product_id,predicted hoặc null,stock hoặc null}] |
| POST /v1/stockout | items[{product_id,features đúng 7 trường}] |
| POST /v1/multi | origin,history[{month,quantity}],horizons[1,2,3] |
| POST /v1/operational | Context nguồn do Express tạo và task; không cho frontend gọi trực tiếp |

Các endpoint công thức có thể kiểm thử độc lập khi đủ đầu vào, dù chưa có weights cho SKU/Stockout. Tham chiếu nguồn: notebook cell 329 (total), 350/366–367 (Hybrid), 409 (replenishment), 414–416 (stockout), 401 (multi), index bắt đầu từ 0. Không thay đổi notebook.

## Nghiên cứu được cấp quyền riêng

GET /research/datasets trả dataset đã cấp cho organization hiện tại; mặc định rỗng. Không có public API cấp quyền dataset. Mọi endpoint /research/nckh-2022-2023/* yêu cầu OWNER/MANAGER và bản ghi organization_dataset_access do người vận hành được chủ dự án xác nhận. Hiện chưa cấp cho organization nào.

- /runs, /forecasts?run=MA2_80_10_10_V1|AUTO_SELECTION_ARCHIVE&q=&page=&limit=: đọc CSV có checksum qua AI service, giữ version/kỳ/source.
- /mysql-runs: metadata run từ retail_management qua reader SELECT-only.
- /mysql-forecasts?run_id=...: dự báo lưu trong MySQL, phân trang.
- /products?q=: master nghiên cứu, tối đa 100 dòng.
- /inventory?snapshot=YYYY-MM-DD&branch_id=&q=: snapshot lịch sử, giữ nhãn SIMULATED/ACTUAL; không trộn tồn vận hành.

Không cấp quyền trong lần triển khai/kiểm thử này, nên kiểm thử organization thật phải nhận 403 ở các endpoint lịch sử. Kiểm tra SELECT-only và các SELECT nguồn đã thực hiện riêng, không cần tạm cấp quyền dataset để lách kiểm soát.


## Nhập sản phẩm CSV — 05/11/2026

POST /api/v1/products/import, OWNER/MANAGER, organization từ phiên đăng nhập. Body preview: {"mode":"preview","csv":"..."}. Body commit thêm mode="commit" và preview_hash trả từ preview. Giới hạn 60.000 byte, 200 sản phẩm; cột bắt buộc sku,name,sale_price, tùy chọn cost_price,category_id,status. Không hỗ trợ organization_id hoặc tồn đầu kỳ.

Preview trả rows/issues/row_count/can_commit/preview_hash/persisted=false, không ghi database. Commit kiểm tra lại toàn bộ tệp trong transaction; thành công 201 với created/count/persisted=true, lỗi dữ liệu 422 không ghi sản phẩm nào; hash khác hoặc tranh chấp unique 409. SKU đã tồn tại không bị cập nhật; danh mục phải thuộc organization. Không thay đổi tồn, phải lập phiếu nhập riêng. Hash liên kết nội dung, không phải token cấp quyền; mọi commit vẫn xác thực, kiểm quyền và revalidate.
