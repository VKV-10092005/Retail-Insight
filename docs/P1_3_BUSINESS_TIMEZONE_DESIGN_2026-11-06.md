# Thiết kế P1.3 — Timezone ngày kinh doanh Retail Insight

> **Đã triển khai theo phê duyệt IANA đầy đủ.** Xem [kết quả P1.3](P1_3_BUSINESS_TIMEZONE_IMPLEMENTATION_2026-11-06.md): 169 PASS, 0 FAIL, 3 SKIP. Nội dung bên dưới giữ lại thiết kế/khảo sát trước triển khai; các phương án thay thế fixed-offset không được chọn. Không thay dữ liệu hoặc calendar AI.

Ngày 06/11/2026. Trạng thái: chỉ phân tích và đề xuất, CHƯA triển khai.

## 1. Quy ước đề xuất để phê duyệt

- Ngày/tháng kinh doanh mặc định theo Asia/Ho_Chi_Minh; thời gian vận hành hiện đại tương ứng UTC+7.
- Timestamp lưu trữ, kết nối MySQL, JSON timestamp và thời hạn session tiếp tục dùng UTC.
- Ngày là ngày lịch 00:00 đến trước 00:00 hôm sau tại timezone kinh doanh, chưa có giờ “chốt ca” khác 00:00.
- Một nguồn cấu hình timezone phía Backend; browser và request không tự quyết định timezone tổ chức.
- Không cập nhật timestamp cũ, không thêm business_date, không migration, không sửa timezone hệ điều hành/MySQL global.
- Dashboard, BI, sales/receipts dùng cùng quy tắc chuyển khoảng và phân nhóm. Giữ quyền tenant/branch và ngữ nghĩa lọc P1.2.
- Inference/feature pipeline AI và dữ liệu nghiên cứu giữ nguyên cho đến khi có phê duyệt riêng; phải công bố khác biệt calendar nếu BI đã chuyển trước.

Đề xuất ban đầu không cần cột timezone trên organization. Có thể dùng cấu hình ứng dụng BUSINESS_TIME_ZONE với default Asia/Ho_Chi_Minh sau khi được duyệt triển khai; chưa thêm biến hoặc sửa .env trong lượt này. Đổi timezone theo tenant về sau cần thiết kế version/effective-time riêng, không tự mở tham số timezone tùy ý cho client.

## 2. Kết quả đọc thực tế

### 2.1. Kiểu dữ liệu và runtime

Đã SELECT information_schema.COLUMNS/STATISTICS trên retail_app, đọc cấu hình pool và migration, không chạy migration.

| Nhóm cột | Kiểu thực tế | Độ chính xác | Ý nghĩa |
|---|---|---:|---|
| stock_documents.created_at | TIMESTAMP | 0, đến giây | Mốc ghi nhận chứng từ, DEFAULT CURRENT_TIMESTAMP |
| inventory_movements.created_at | TIMESTAMP | 0 | Mốc ghi từng movement, DEFAULT CURRENT_TIMESTAMP |
| inventory_balances.updated_at | TIMESTAMP | 0 | Mốc cập nhật balance, tự cập nhật khi UPDATE |
| organizations/products/users.created_at | TIMESTAMP | 0 | Dùng cả trong tính thời gian quan sát của AI |
| auth_sessions.created_at | TIMESTAMP | 0 | Audit tạo phiên |
| auth_sessions.expires_at/revoked_at | DATETIME | 0 | Giá trị UTC theo quy ước mã ứng dụng |
| users.last_login_at | DATETIME | 0 | Ghi bằng UTC_TIMESTAMP() |
| organization_dataset_access.created_at, schema_migrations.applied_at | TIMESTAMP | 0 | Audit hệ thống, ngoài ngày kinh doanh |

Không có cột DATE business_date hoặc timezone tổ chức trong schema đã kiểm tra. Category, branch, stock_document_items không có timestamp riêng trong migrations hiện tại.

Runtime đọc được:
- MySQL 9.7.0, @@session.time_zone=+00:00, @@global.time_zone=SYSTEM, @@system_time_zone=SE Asia Standard Time.
- [pool.js](../backend/src/db/pool.js): mysql2 timezone:'Z'; initializer kết nối đặt time_zone='+00:00'.
- Node v24.13.0, ICU77.1; TZ environment chưa đặt, Intl mặc định của tiến trình kiểm tra là Asia/Bangkok.
- Chứng từ và movements hiện đều 0 bản ghi. Vì vậy chưa có bằng chứng phân bố giao dịch thật gần nửa đêm.

TIMESTAMP được MySQL chuyển theo session timezone khi đọc/ghi, còn DATETIME không tự mang ngữ nghĩa UTC. Việc giữ UTC cho DATETIME hiện dựa vào mã auth và driver. Không được đổi pool sang +7 để thực hiện ngày kinh doanh. Xem [MySQL timezone support](https://dev.mysql.com/doc/refman/9.7/en/time-zone-support.html).

Các cột nghiệp vụ là TIMESTAMP(0), không phải DATETIME(6). Các phép thử microsecond trong thiết kế chỉ kiểm logic khoảng bằng biểu thức DATETIME(6), không chứng minh database đang lưu phần lẻ giây. Phạm vi TIMESTAMP(0) trong tài liệu MySQL là từ 1970-01-01 00:00:01 đến 2038-01-19 03:14:07 UTC; schema này có giới hạn dài hạn cần theo dõi riêng, chưa sửa kiểu cột. [MySQL temporal types](https://dev.mysql.com/doc/refman/9.7/en/datetime.html).

### 2.2. Named timezone SQL hiện chưa sử dụng được

SELECT CONVERT_TZ('2026-11-05 17:00:00','+00:00','Asia/Ho_Chi_Minh') trả NULL.
Cùng giá trị với timezone đích '+07:00' chuyển được thành 2026-11-06 00:00:00.

Đây là bằng chứng named timezone không khả dụng cho phép chuyển này trên MySQL hiện tại; chưa truy vấn nội dung mysql.time_zone* nên không khẳng định chính xác bảng nào thiếu. Tài liệu yêu cầu thiết lập timezone tables để dùng named timezone. Không tự tải/import bảng này hoặc thay cấu hình MySQL. [MySQL CONVERT_TZ](https://dev.mysql.com/doc/refman/9.7/en/date-and-time-functions.html).

Không được mặc định CONVERT_TZ(...,'Asia/Ho_Chi_Minh') hoạt động rồi để NULL làm mất toàn bộ group ngày/tháng.

### 2.3. IANA không đồng nghĩa “trừ 7 giờ cho mọi năm”

Kiểm tra Intl trong tiến trình riêng:
- 2026-11-05T17:00:00Z → 06/11/2026 00:00 tại Asia/Ho_Chi_Minh.
- 1970-01-01T00:00:00Z → 01/01/1970 08:00 tại cùng timezone.

Do đó offset cố định +7 không tương đương mọi lịch sử IANA. Backend chấp nhận timezone tên này, nhưng ICU có thể canonicalize thành Asia/Saigon; không nên coi alias đó là lỗi. Temporal native hiện undefined trên Node đang kiểm tra.

Điểm này quan trọng với biên năm và P1.1: validator Gregorian hỗ trợ 0001–9999, không có nghĩa mọi ngày đó có thể lưu trong TIMESTAMP hoặc chuyển bằng SQL CONVERT_TZ mà không có giới hạn.

## 3. Danh mục API, query và giao diện bị ảnh hưởng

| Thành phần | Cách xử lý hiện tại | Thiết kế thay đổi hoặc giữ nguyên |
|---|---|---|
| common.js: period | Gregorian, start<=end, chuỗi date-only | Giữ nguyên validation P1.1; thêm tầng resolve calendar riêng |
| common.js: filters | start lúc 00:00 UTC; end đến 23:59:59.999999 UTC | Chuyển ngày địa phương sang cận UTC trước khi bind |
| GET /api/v1/sales | documentFilters: tenant/branch/date/type + EXISTS product/category | Cùng helper khoảng UTC; count/list dùng chung predicates |
| GET /api/v1/receipts | Như sales | Cùng quy tắc, không đổi role |
| GET /sales/:id, /receipts/:id | Trả timestamp chứng từ + items | Giữ created_at UTC, thêm calendar metadata nếu duyệt; UI hiển thị zone tường minh |
| GET /bi/overview: KPI | Tính SALE trong phạm vi common.filters | Cùng cận UTC với sales; giữ công thức tiền/units/count |
| /bi/overview: trend | DATE_FORMAT(d.created_at,'%Y-%m-%d' hoặc '%Y-%m') theo UTC | Group theo ngày/tháng địa phương |
| /bi/overview: by_branch/by_category/top/slow | Cùng where ngày với KPI | Cùng phạm vi UTC mới; không đổi thứ tự/tổng hợp nghiệp vụ |
| /bi/overview: movements | Lọc/group m.created_at theo UTC | Đề xuất dùng ngày chứng từ gốc cho business bucket; giữ m.created_at là audit |
| /bi/overview: inventory/by_branch/highest | Tồn hiện tại, không theo start/end | Giữ nguyên, ghi rõ “hiện tại”; không biến thành tồn cuối ngày |
| GET /inventory/movements | common.filters alias m, join document d | Đồng bộ nguồn ngày với movement BI nếu duyệt quyết định tại mục 4 |
| GET /inventory | Không lọc lịch sử, trả updated_at | Chỉ format timestamp tường minh; không thêm lọc ngày |
| GET /products | Có period.parse nhưng không lọc theo created_at | Giữ không có chức năng lọc ngày catalog; không tự thêm |
| GET /dashboard/overview | Tên organization, số branch | Có thể trả calendar context dùng chung, không bổ sung KPI thứ hai |
| GET /ai/forecast, /ai/summary | Origin và SQL bucket tháng UTC | Ghi nhận ảnh hưởng, CHƯA đổi trong gói BI/list nếu không duyệt AI riêng |
| GET /ai/readiness | Trạng thái model/service | Không bị ảnh hưởng, không phải inference |
| /auth/* và middleware session | UTC_TIMESTAMP, JWT expiry, cookie TTL | Giữ UTC, không chuyển expiry sang ngày kinh doanh |
| /research/* | Kỳ/snapshot và dữ liệu lịch sử có contract riêng | Không thay query/date/nhãn dữ liệu nghiên cứu |
| POST /sales, /receipts | Chứng từ/movement/balance tự ghi UTC | Không sửa cách lưu, không thêm ngày hồi tố |

Bằng chứng: [common.js](../backend/src/business/common.js), [ledger.js](../backend/src/business/ledger.js), [bi.js](../backend/src/business/bi.js), [ai.js](../backend/src/business/ai.js), [auth middleware](../backend/src/middlewares/auth.js).

Frontend đang hoạt động:
- / và /reports cùng [Dashboard.jsx](../frontend/src/operations/Dashboard.jsx): date filters; trend ngày/tháng; doanh thu chi nhánh/danh mục; top/slow; movement chart; inventory chart và as_of.
- /sales và /inventory cùng [Ledger.jsx](../frontend/src/operations/Ledger.jsx): thời gian lịch sử chứng từ, chi tiết/in chứng từ, balance.updated_at.
- Ledger đang dùng dates={sale}: màn hình kho/phiếu nhập chưa hiện hai ô ngày dù API receipts hỗ trợ. Đề xuất thêm ô ngày cho lịch sử phiếu nhập trong P1.3 nếu duyệt; chỉ áp dụng cho chứng từ/movement, không tồn hiện tại.
- [shared.jsx](../frontend/src/operations/shared.jsx): input type=date giữ chuỗi date-only; params không được tự đổi sang ISO UTC ở browser.
- Dashboard hiện ghi “Mốc ngày theo UTC”; cần đổi nhãn đúng business timezone đồng thời với Backend.
- Ledger/Dashboard dùng toLocaleString('vi-VN') không có timeZone: locale tiếng Việt không quyết định timezone, browser ngoài Việt Nam có thể hiển thị ngày khác.
- [AI.jsx](../frontend/src/operations/AI.jsx) dùng getUTCFullYear/getUTCMonth để đặt origin; không tự đổi khi chỉ triển khai BI/list.
- Các trang legacy trong frontend/src/pages không phải route vận hành hiện tại; không sửa demo để tạo cảm giác đã đồng bộ.

## 4. Chọn timestamp định nghĩa “ngày kinh doanh”

Đề xuất mặc định: ngày chứng từ = ngày tại business timezone của stock_documents.created_at. Đây là ngày ghi nhận hiện tại, chưa phải ngày nghiệp vụ có thể nhập hồi tố.

Tạo doc rồi lần lượt insert item/movement/update balance là nhiều SQL statement. Gần nửa đêm, d.created_at và m.created_at có thể ở hai ngày dù cùng transaction. Do đó chỉ cộng +7 cho từng cột riêng lẻ chưa bảo đảm thống nhất.

Đề xuất cần duyệt: movement phục vụ báo cáo nhập/xuất theo ngày chứng từ gốc d.created_at, giống hóa đơn/phiếu nhập; timestamp m.created_at vẫn giữ nguyên và có thể trả để audit. /inventory/movements và chart movement BI phải cùng chọn nguồn này. Kho hiện tại dùng balance.updated_at để thông báo thời điểm cập nhật, không dùng làm ngày hóa đơn.

Phương án thay thế: giữ movement theo giờ sự kiện của chính nó, nhưng phải ghi rõ chart “thời điểm ghi movement” và không yêu cầu khớp tuyệt đối số lượng theo ngày chứng từ. Khuyến nghị chọn phương án ngày chứng từ để đạt mục tiêu thống nhất, và xem đây là quyết định trong thiết kế cần phê duyệt, chưa thay query.

Không đổi stock_documents.created_at để gộp ngày, không đặt lại giờ cho movement/balance và không tạo business_date mới.

## 5. Chuyển khoảng ngày địa phương sang UTC

### 5.1. Contract

Giữ query start/end ở định dạng YYYY-MM-DD và end là ngày cuối có tính. Backend resolve timezone, validate theo P1.1, rồi tính:
- lower = đầu ngày start tại business timezone → UTC, nếu có start.
- upperExclusive = đầu ngày lịch kế tiếp end tại business timezone → UTC, nếu có end.
- Query bằng created_at >= lower AND created_at < upperExclusive.

Dùng khoảng nửa kín để giao dịch đúng 00:00 hôm sau không bị cộng hai ngày, không phụ thuộc millisecond/microsecond của driver. Cộng “một ngày lịch địa phương”, không mặc định cộng 86.400.000ms cho mọi timezone/lịch sử.

Ví dụ start=end=2026-11-06:
- Local: [2026-11-06 00:00:00+07, 2026-11-07 00:00:00+07).
- UTC: [2026-11-05 17:00:00Z, 2026-11-06 17:00:00Z).

Tháng 11/2026:
- Local: [01/11 00:00, 01/12 00:00).
- UTC: [2026-10-31 17:00:00Z, 2026-11-30 17:00:00Z).

~~~sql
-- Minh họa kế hoạch, chưa sửa source.
WHERE d.organization_id = ?
  AND d.created_at >= ?  -- UTC lower
  AND d.created_at < ?   -- UTC upperExclusive
  -- Giữ scope branch, type và EXISTS category/product của P1.2.
~~~

Không bọc cột timestamp trong DATE/CONVERT_TZ ở WHERE; chuyển cận một lần phía ứng dụng để giữ khả năng dùng index. Index hiện có: document_period(organization_id,created_at,branch_id), movement_period(organization_id,branch_id,created_at). Chưa có dữ liệu để đánh giá query plan thực tế; không đề xuất migration/index mới trong P1.3.

### 5.2. Biên Gregorian và compatibility P1.1

Giữ validator Gregorian 0001–9999; không tự thu hẹp thành 1970–2038 vì chỉ là bộ lọc, không phải ngày được insert. Trước khi chuyển timezone:
1. Giữ ngày dưới dạng calendar value, không new Date('YYYY-MM-DD') hoặc Date.UTC cho năm 0–99.
2. Phân loại/intersect khoảng với miền dữ liệu của cột TIMESTAMP(0) trước khi bind SQL. Nếu cận ngoài miền chắc chắn chứa hết dữ liệu, bỏ cận dư; nếu không giao miền, trả rỗng có scope hoặc WHERE 1=0.
3. Chỉ chuyển các cận cần thiết trong miền biểu diễn được. Không để năm 0001 local thành năm 0000 SQL; không dựng 10000-01-01 rồi gửi vào MySQL.
4. start=0001-01-01,end=9999-12-31 vẫn phải nghĩa là mọi timestamp khả dụng trong phạm vi tenant/filter; không 500/NULL và không đổi pagination defaults.

Tầng clipping phải theo kiểu cột thật, không áp dụng miền TIMESTAMP cho mọi DATETIME hoặc timestamp nghiên cứu. Nếu schema thay kiểu về sau, phải cập nhật contract/range tests. Quy tắc này là kế hoạch, chưa triển khai.

### 5.3. Công cụ tính timezone

Đề xuất helper thuần Backend như resolveBusinessRange, businessDay, businessMonth, buildBusinessBuckets; nhận clock/timezone tường minh để test, không sửa TZ global.

Native Temporal hiện chưa có trên Node này; nên đánh giá @js-temporal/polyfill cho local calendar→instant và phép cộng ngày/tháng. Đây là dependency đề xuất, chưa cài hoặc chốt version. Cần pin/kiểm phiên bản khi triển khai, xử lý midnight ambiguity/offset transition theo contract thư viện thay vì thuật toán tự trừ giờ.

[Temporal ZonedDateTime](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) và [polyfill chính thức](https://github.com/js-temporal/temporal-polyfill) mô tả calendar/timezone-aware arithmetic. Intl hiện đủ để kiểm tra instant→local, không nên tự coi là API chuyển ngược local→instant.

## 6. Phân nhóm doanh thu ngày/tháng địa phương

### 6.1. Phương án khuyến nghị không cần sửa MySQL timezone tables

Backend tạo các bucket ngày/tháng theo IANA, mỗi bucket có period date/month string và [start_utc,end_utc). SQL JOIN bảng dẫn xuất gồm các bucket đã bind parameter rồi tổng hợp.

~~~sql
SELECT b.period,
       COUNT(DISTINCT d.id) AS orders,
       SUM(x.quantity) AS units,
       SUM(x.quantity*x.unit_price) AS revenue
FROM (
  SELECT ? AS period,
         CAST(? AS DATETIME) AS start_utc,
         CAST(? AS DATETIME) AS end_utc
  UNION ALL
  SELECT ?, CAST(? AS DATETIME), CAST(? AS DATETIME)
) b
JOIN stock_documents d
  ON d.created_at >= b.start_utc AND d.created_at < b.end_utc
JOIN stock_document_items x
  ON x.document_id=d.id AND x.organization_id=d.organization_id
JOIN products p
  ON p.id=x.product_id AND p.organization_id=x.organization_id
WHERE d.organization_id=? AND d.type='SALE'
  -- Cùng phạm vi ngày/branch/category/product đã resolve cho KPI.
GROUP BY b.period
ORDER BY b.period;
~~~

Lợi ích: một quy tắc IANA cho cả cận và nhóm, không phụ thuộc named timezone của MySQL; không fetch toàn bộ raw transaction về Node; không đổi session UTC; tránh cộng offset sai cho lịch sử.

Yêu cầu thiết kế: bucket không giao nhau, mỗi giao dịch thuộc đúng một period; scope áp dụng tại SQL; chia batch bucket để tránh SQL quá dài. Nếu không truyền ngày, giữ nghĩa all-time hiện có: đọc MIN/MAX của dữ liệu đúng scope, dựng bucket trong phạm vi có dữ liệu; rỗng thì trả [] và KPI0. Không âm thầm đổi thành “30 ngày gần nhất” hoặc cắt bớt kết quả. Khi batch cần cùng snapshot đọc để tránh tổng KPI/chart sai do giao dịch mới phát sinh; dùng read-only transaction khi triển khai và được duyệt kiểm thử, không transaction ghi.

Cần benchmark/EXPLAIN trên MySQL test tách biệt trước duyệt release. Với khoảng rất dài, đánh giá giới hạn tài nguyên/batch; nếu cần thay contract để giới hạn range phải trình riêng, không cắt ngầm. Đây là chi phí kỹ thuật so với DATE_FORMAT hiện tại.

### 6.2. Phương án đơn giản cho dữ liệu hiện đại UTC+7

SQL minh họa đã thử SELECT hằng, không insert:

~~~sql
DATE_FORMAT(CONVERT_TZ(d.created_at,'+00:00','+07:00'),'%Y-%m-%d')
DATE_FORMAT(CONVERT_TZ(d.created_at,'+00:00','+07:00'),'%Y-%m')
~~~

Có thể tối ưu bằng offset cố định khi chứng minh offset không đổi trong miền dữ liệu được chọn và công bố policy. Không nên dùng làm fallback tự động cho mọi ngày 0001–9999 hoặc mọi timezone IANA: ví dụ 1970 đã khác +7. Chọn cố định UTC+7 thay vì IANA đầy đủ là một quyết định sản phẩm cần duyệt.

Phương án named CONVERT_TZ trực tiếp có thể dùng nếu operator nạp timezone tables được phê duyệt riêng và kiểm parity với Node; hiện chưa khả dụng và không được tự sửa DB để bật.

## 7. Response, frontend và ngữ nghĩa dữ liệu

Đề xuất additive calendar metadata cho các API liên quan:

~~~json
{
  "calendar": {
    "timezone": "Asia/Ho_Chi_Minh",
    "policy_version": "business-calendar-v1",
    "timestamp_basis": "UTC",
    "timestamp_source": "stock_documents.created_at",
    "start_date": "2026-11-06",
    "end_date": "2026-11-06",
    "start_utc": "2026-11-05T17:00:00.000Z",
    "end_utc_exclusive": "2026-11-06T17:00:00.000Z"
  }
}
~~~

Giữ created_at/updated_at/as_of là UTC ISO có Z, không cộng7 rồi gắn Z. Date-only period YYYY-MM-DD và month YYYY-MM là nhãn lịch, không parse thành Date trong chart. Metadata ngày không có cận dùng null/tách effective_range rõ ràng, không giả ngày được người dùng chọn.

Frontend format instant bằng Intl.DateTimeFormat('vi-VN',{timeZone:calendar.timezone,...}), thay vì dựa browser hoặc cộng offset bằng tay. Mọi nhãn “UTC” trên vùng kinh doanh đổi đồng thời khi Backend chuyển; vẫn có thể hiển thị raw UTC cho audit. Hiển thị rõ timezone trên filters, tooltip, chi tiết/in phiếu và mốc as_of. Không tác động formatter dữ liệu nghiên cứu hoặc AI khi chưa duyệt calendar tương ứng.

P1.2 giữ nguyên: list trả cả chứng từ được chọn, total tiền của cả chứng từ. BI category/product tính tiền/units của dòng phù hợp. Vì vậy không đòi SUM(list.document.total)=BI.revenue khi lọc một sản phẩm trong hóa đơn nhiều dòng; đối chiếu số chứng từ/điều kiện và tổng dòng đúng phạm vi.

Inventory là tồn hiện tại dù lọc ngày báo cáo. Các chart tồn theo branch, highest stock không được diễn giải thành tồn lúc end; không thêm tính tồn hồi tố trong P1.3.

## 8. Kiểm tra các mốc biên

Đã chạy SELECT trên các giá trị hằng DATETIME(6), cùng kiểm tra Intl, không tạo bảng hoặc giao dịch:

| UTC | Giờ Asia/Ho_Chi_Minh hiện đại | Ngày kinh doanh |
|---|---|---|
| 05/11/2026 16:59:59.999999 | 05/11 23:59:59.999999 | 05/11 |
| 05/11/2026 17:00:00 | 06/11 00:00:00 | 06/11 |
| 06/11/2026 16:59:59.999999 | 06/11 23:59:59.999999 | 06/11 |
| 06/11/2026 17:00:00 | 07/11 00:00:00 | 07/11 |
| 31/10/2026 16:59:59 | 31/10 23:59:59 | Tháng 10 |
| 31/10/2026 17:00:00 | 01/11 00:00:00 | Tháng 11 |
| 31/12/2026 17:00:00 | 01/01/2027 00:00:00 | Năm 2027 |
| 28/02/2024 17:00:00 | 29/02 00:00:00 | Ngày nhuận |
| 29/02/2024 17:00:00 | 01/03 00:00:00 | Tháng 3 |

SQL SELECT derived constants với bốn giao dịch giả định, amount100/200/300/400 tại các mốc ngày đầu bảng; điều kiện UTC [05/11 17:00,06/11 17:00) và group local trả đúng 1 bucket 2026-11-06, orders=2, revenue=500. Đây là phép kiểm toán biểu thức trên hằng, KHÔNG phải dữ liệu bán hàng đã nhập hoặc test implementation P1.3.

Driver JavaScript Date chỉ giữ millisecond; chứng minh microsecond sử dụng DATE_FORMAT trả chuỗi từ MySQL. Không coi ISO Z serialize của kết quả CONVERT_TZ là instant UTC mới: đó có thể chỉ là wall-time được driver diễn giải theo timezone:'Z'.

## 9. Lịch sử, dữ liệu AI và nghiên cứu

### Lịch sử giao dịch

Không thay một byte timestamp đã lưu. Khi đổi cách đọc, giao dịch từ 17:00 đến trước24:00 UTC được xếp sang ngày hôm sau tại Việt Nam; 7 giờ cuối ngày UTC cuối tháng/năm sang kỳ kế tiếp. Tổng toàn thời gian cùng tập giao dịch không đổi; tổng từng ngày/tháng hoặc cùng chuỗi start/end sẽ thay đổi có chủ đích.

Cần version calendar và ghi chú release để tránh người dùng hiểu nhầm “doanh thu cũ bị sửa”. Cache/report export/bookmark có ngày phải có timezone/policy version trong khóa hoặc metadata; không cần tự tạo cache/export mới. Không chỉnh các báo cáo đóng băng nghiên cứu hoặc timestamp lịch sử để ép tổng khớp.

### AI vận hành: ảnh hưởng cần duyệt riêng

[ai.js](../backend/src/business/ai.js) có các điểm phụ thuộc calendar:
1. now/origin/current_origin dựa tháng UTC.
2. Organization.created_at và product.created_at → first_month bằng DATE_FORMAT UTC; firstComplete quyết định tháng quan sát đầy đủ.
3. MIN sale created_at → first_sale_month.
4. monthly aggregate cho multi, từng SKU quantity/weighted unit_price và group/brand cohort đều nhóm theo tháng UTC, cận tháng UTC.
5. stock_as_of là đầu tháng dự báo UTC, movement được chọn theo snap.created_at.
6. [AI.jsx](../frontend/src/operations/AI.jsx) đặt tháng trước bằng getUTC*.
7. FastAPI [main.py](../ai-service/app/main.py) dùng date.today() khi kiểm origin multi; timezone phụ thuộc host Python, không phải explicit business context.

Ví dụ 01/11/2026 00:00 giờ Việt Nam = 31/10 17:00Z: BI đã là tháng11, nhưng code origin UTC hiện còn coi tháng hiện tại là10 và mặc định forecast origin9, thay vì origin10 theo lịch địa phương. Tồn chốt đầu tháng và tập sale dùng làm feature cũng lệch7giờ ở mỗi ranh giới; có thể đổi lag/mean/zero_ratio/cohort/prices/history_months và kết quả model. Readiness200 không chứng minh calendar inference đúng.

Khuyến nghị triển khai P1.3 BI/list trước nếu được duyệt, không chỉnh những điểm AI trên. Hiển thị rõ AI vẫn theo calendar contract hiện tại; không gắn business-calendar-v1 của BI vào AI result. Để đồng bộ AI, cần phê duyệt riêng toàn bộ aggregator/metadata/origin/cutoff/feature tests cùng lúc, không đổi riêng nhãn month. Không retrain, thay weights hoặc claim metric nghiên cứu còn nguyên trên input khác calendar.

Nghiên cứu: retail_management/retail_datawarehouse, data/research, các tháng Jan17/Hybrid30/Stockout reference và snapshot lịch sử giữ nguyên contract. Không chạy query chuyển đổi lên dataset nghiên cứu, không sao chép vào retail_app, không cấp quyền dataset. Lượt này không kết nối database nghiên cứu.

## 10. Rủi ro tương thích và biện pháp

| Rủi ro | Biện pháp thiết kế |
|---|---|
| Validator P1.1 và năm0001/9999 tràn khi shift/cộng ngày | Giữ validator, clip theo miền cột trước conversion; test empty/all-time thay vì đổi400 |
| Thay end<=23:59:59.999999 của P1.1 | Chuyển sang < đầu ngày tiếp theo đã resolve; bảo toàn end-inclusive theo lịch mới, cập nhật test SQL đúng kỳ vọng |
| Bỏ hoặc lệch bind/WHERE của P1.2 | Một resolved range dùng chung count/list, giữ EXISTS một item và scope; cập nhật test chính xác predicates |
| Thay pool/global/TZ gây double shift, ảnh hưởng DATETIME/session | Giữ nguyên UTC storage/driver/session, chỉ conversion ở lớp đọc/hiển thị |
| SQL named timezone ra NULL | Chọn bucket UTC ở Backend; không fallback âm thầm, không tự import timezone tables |
| Cố định+7 sai IANA lịch sử | Dùng IANA-aware boundary/buckets; fixed-offset chỉ là option có miền áp dụng được duyệt |
| Browser/locale hiển thị khác bucket | timeZone explicit; period date-only không parse Date; test browser UTC/Việt Nam/Mỹ |
| Movement qua nửa đêm khác chứng từ | Chốt timestamp_source; đề xuất d.created_at cho cả chart/list movement |
| Stock current bị hiểu là end-of-day | Giữ nhãn tồn hiện tại, không áp dụng date filters vào balance |
| API date string cũ nay nghĩa khác | Response calendar/version, đổi Backend/UI đồng bộ và ghi release note |
| AI vẫn UTC trong khi BI local | Công bố phạm vi, giữ AI tách biệt, chỉ sửa sau phê duyệt riêng |
| SQLite không phản ánh MySQL named zone/precision/TIMESTAMP | Test fixture cô lập cộng native MySQL SELECT hằng; MySQL disposable test cần phê duyệt riêng nếu cần tạo bảng |
| Bucket dài, nhiều request hoặc dữ liệu thay đổi giữa câu query | Batch/EXPLAIN/benchmark, snapshot đọc nhất quán; không cắt range ngầm |
| TIMESTAMP sau2038 | Ghi nhận hạn chế hiện có, không migration đổi kiểu trong gói timezone |

Không làm “đạt lại test” bằng cách bỏ Gregorian checks, đổi expected count hoặc bỏ scope. Những expected timestamp cũ trong test P1.1 sẽ phải thay vì đây là thay đổi contract date basis được phê duyệt, không phải regression âm thầm.

## 11. Bộ test và tiêu chí nghiệm thu đề xuất

Chưa tạo test/source P1.3. Các hạng mục dưới đây là kế hoạch; 129 PASS của P1.1/P1.2 không phải kết quả P1.3.

| Nhóm | Trường hợp | Kỳ vọng |
|---|---|---|
| Unit calendar | start=end, chỉstart, chỉend, khôngcận | Cận UTC đúng và các cận thiếu giữ ý nghĩa hiện tại |
| Gregorian regression | 2000/2024 nhuận;1900/2100 không; ngày sai/đảo/CRLF | Giữ 400/message rõ và validation P1.1 |
| Midnight | 16:59:59Z,17:00Z mỗi phía | Đúng1ngày, giao dịch tại upperExclusive bị loại |
| Precision | Timestamp0 và biểu thức6digits | Không lẫn giây/millisecond/microsecond hoặc làm tròn vào ngày sau |
| Month/year/leap | 31/10→01/11;31/12→01/01;29/02 | Đúng label/ngày/tháng/năm địa phương |
| Range domain | 0001,9999; cận trước/sau TIMESTAMP; không giao | Không500/overflow, đúng all-time/empty theo scope |
| IANA | 1970 offset+8, alias Asia/Saigon, offset transition | Không mặc định+7 toàn lịch sử; không phụ thuộc TZ host |
| SQL availability | Named CONVERT_TZ NULL | Cơ chế được chọn vẫn đúng hoặc từ chối rõ, không group NULL |
| Scope/auth | OWNER, MANAGER/CASHIER/INVENTORY, foreigntenant/branch | Giữ401/403 và assignment hiện tại |
| P1.2 filters | Category/product riêng và phối hợp ngày/branch | Count/list cùng điều kiện; một doc nhiều items không nhân bản |
| Count/pagination | Trang1/2/cuối/vượtcuối | total toàn tập đúng, page result không trùng |
| KPI/list/trend | Fixture cùng date window | Orders khớp tậpdoc; SUM trend revenue/units khớp KPI cùngfilter |
| Category semantics | Doc nhiều category/product | So tổng dòng BI đúng, không so sai với full document.total |
| Receipts/movement | Một doc ghi23:59:59, movement00:00:01 | Theo timestamp_source đã duyệt; raw audit times không đổi |
| Inventory | Thay start/end | Tồn hiện tại không đổi; chỉ chứng từ/movement thay |
| UI | Browser zones UTC/HCM/America, Edge reload/print | Cùng ngày/giờ kinh doanh, label/tooltip/phiếu thống nhất |
| Auth thời hạn | Qua0h local nhưng JWT còn hạn hoặc đãhết | TTL theo UTC/epoch không đổi |
| Compatibility | Khônglọc/alltime, shape fields cũ | Cộng metadata, không phá parser/UI cũ hoặc công thức tiền |
| AI boundary | Clock freeze tại đầu tháng UTC/local | Ghi nhận khác biệt, không sửa/kích hoạt pipeline trong test BI |
| Performance | Nhiều bucket, nhiều tenant và page lớn | Không fetch raw toàn bộ, không SQL quá dài; queryplan phù hợp |

Cách kiểm thử đề xuất: helper thuần có fake clock; fixture tổng hợp trong RAM giống P1.2; mock quyền/relational HTTP; MySQL SELECT trên hằng để kiểm dialect; browser fixture timezone không tài khoản thật. Không RUN_DB_TESTS=1 trên DB hiện tại. Native MySQL fixture có write chỉ chạy trong môi trường disposable sau phê duyệt riêng, không dùng NCKH.

Nghiệm thu trước release:
- Cùng range/tenant/branch/category/product phải resolve cùng UTC window trên mọi API trong scope.
- KPI/chart/list dùng cùng business calendar; totals được đối chiếu đúng ngữ nghĩa P1.2.
- Không thay raw timestamp, không đổi TTL/session, không lộ tenant.
- Ngày biên không mất/đếmtrùng; IANA/SQL không NULL âm thầm.
- Có metadata/nhãn UI/timezone và tài liệu thay đổi contract.
- Regression P1.1/P1.2 + auth/origin/bootstrap an toàn đạt; DB-writing suite vẫn tắt.
- AI và nghiên cứu giữ nguyên; phân biệt rõ phần chưa đồng bộ.
- Các phép kiểm fixture/native được báo riêng, không tuyên bố inference hoặc dữ liệu thật đã PASS.

## 12. Phạm vi triển khai đề nghị để duyệt

Gói P1.3 được đề xuất:
1. Cấu hình/helper business timezone, giữ UTC storage và global settings.
2. Cận ngày cho sales/receipts/BI/movements; giữ EXISTS và quyền P1.2.
3. Group ngày/tháng theo IANA bằng bucket UTC, hoặc option fixed+7 nếu người dùng chốt miền hỗ trợ.
4. Chốt movement theo timestamp chứng từ; formatter/labels/metadata và bộ lọc ngày phiếu nhập.
5. Test cô lập, regression và tài liệu; không migration hoặc dữ liệu thật.

Các quyết định cần duyệt trước khi triển khai:
- Chọn IANA đầy đủ (khuyến nghị) hay cố định UTC+7 cho dữ liệu hiện đại; đồng ý dependency timezone nếu cần.
- Chọn d.created_at làm nguồn ngày cho movement kinh doanh.
- Đồng ý thay ngữ nghĩa start/end từ UTC sang lịch kinh doanh, với metadata/version và UI cập nhật cùng lúc.
- Chấp nhận AI tiếp tục calendar hiện tại có ghi rõ phạm vi, hoặc yêu cầu một gói phân tích/triển khai AI riêng trước khi bật calendar mới.
- Chọn mức kiểm thử: RAM + native SELECT hằng trước; môi trường MySQL disposable nếu cần kiểm queryplan/fixture ghi.

Không cần phê duyệt thay timestamp cũ hoặc timezone hệ thống vì thiết kế không làm các việc đó. Không tự triển khai bất kỳ mục nào chỉ vì đã có kế hoạch.

## 13. Những gì đã làm trong lượt này

Chỉ đọc source/migration/config không có secret output; SELECT metadata/runtime và counts của retail_app; SELECT các biểu thức hằng timezone; kiểm Intl/Temporal availability trong tiến trình kiểm tra. Không cập nhật bảng, không nạp timezone tables, không thay pool/env/system timezone, không restart service, không gọi inference hoặc query nghiên cứu.

File duy nhất được tạo là báo cáo thiết kế này. Không chạy lại test implementation P1.3 vì chưa có implementation; các phép kiểm nêu trên là bằng chứng khảo sát, không phải nghiệm thu tính năng.

Nguồn code và tài liệu chính thức được liên kết tại các mục tương ứng. Chờ phê duyệt triển khai.
