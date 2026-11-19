# Thiết kế P1.4 — Ngày nghiệp vụ chứng từ và nhập lịch sử
Retail Insight — 06/11/2026. Trạng thái: PHÂN TÍCH/ĐỀ XUẤT, chưa triển khai.

## 1. Kết luận cần quyết định

Không thể bổ sung hồi tố an toàn chỉ bằng một ô ngày. Cần phân biệt ngày phát sinh, thời điểm hệ thống biết dữ liệu, tác động kho và nguồn gốc. Khuyến nghị:
- Lưu business_date dạng DATE và business_timezone=Asia/Ho_Chi_Minh theo chính sách IANA đã duyệt; created_at tiếp tục là thời điểm ghi nhận UTC do server sinh.
- Thời điểm phát sinh chính xác chỉ lưu khi nguồn thật có; ngày-only không được biến thành “đã xảy ra lúc00:00”.
- Draft/yêu cầu duyệt phải lưu ở bảng staging/document_requests riêng, không đưa SALE draft vào stock_documents vì reader hiện tại coi mọi SALE đã commit là dữ liệu báo cáo/AI.
- Chứng từ đã ghi sổ bất biến về ngày, dòng và giá. Chỉnh sai sau ghi sổ cần quy trình sửa/đảo được duyệt riêng, không UPDATE lén hoặc DELETE.
- Phân tách nhập lịch sử chỉ phục vụ báo cáo với nhập hồi tố tác động kho; không cho client tự chọn cờ “bỏ qua tồn”.
- Cần migration và thay đổi API/BI/UI trước triển khai. Không migration nào được tạo/chạy trong lượt này.
- Chưa được cho lịch sử đi vào bảng vận hành có AI đọc trực tiếp nếu chưa giải quyết hợp đồng dữ liệu AI. Giữ weights nguyên không đồng nghĩa dữ liệu inference không bị thay đổi.
- Mọi cửa sổ ngày, quyền hồi tố và mở kỳ nêu dưới đây là đề xuất cần duyệt, chưa có hiệu lực.

## 2. Hiện trạng đã xác minh

Đã đọc source, migrations và SELECT metadata thực tế của bốn bảng. MySQL9.7.0, session+00:00, globalSYSTEM. stock_documents, stock_document_items, inventory_movements, inventory_balances đều0 bản ghi tại lúc đọc. SHOW TABLES hiện có13 bảng, không có bảng khóa kỳ/audit/import chứng từ/snapshot kho.

| Bảng | Trường/ràng buộc thực tế | Hệ quả với P1.4 |
|---|---|---|
| stock_documents | id,organization_id,branch_id,type ENUM(RECEIPT,SALE),request_key VARCHAR80,payload_hash CHAR64,performed_by,total DECIMAL16,2,note,created_at TIMESTAMP(0) default CURRENT_TIMESTAMP | Không business_date, nguồn ngoài, kỳ khóa, phê duyệt hoặc trạng thái draft |
| stock_document_items | document_id/product_id + organization_id; sku/product_name snapshot; quantity INT>0,unit_price DECIMAL16,2>=0; UNIQUE(document_id,product_id) | Mỗi SKU chỉ một dòng/chứng từ; hóa đơn nguồn có nhiều dòng cùng SKU có thể không biểu diễn được |
| inventory_movements | org/branch/product/document; quantity_delta INT,balance_after INT>=0,created_at TIMESTAMP(0) | Ledger theo thứ tự ghi; balance_after không tự trở thành tồn lịch sử theo ngày nghiệp vụ |
| inventory_balances | PK(org,branch,product),quantity INT>=0,updated_at TIMESTAMP(0) | Chỉ một tồn hiện tại; chưa có baseline/snapshot hoặc coverage lịch sử |

Có FK composite cùng organization. UNIQUE document_request(org,type,request_key) chống gửi lại cùng key; index document_period(org,created_at,branch). Movement index hiện theo org/branch/created_at; không có index business_date.

[ledger.js](../backend/src/business/ledger.js) hiện:
- POST /sales: OWNER/MANAGER/CASHIER; POST /receipts: OWNER/MANAGER/INVENTORY, đồng thời kiểm chi nhánh.
- Body strict không nhận business_date/created_at; tối đa100 items, quantity nguyên dương tối đa100.000, không lặp product.
- Sale bắt buộc lấy giá catalog hiện tại, từ chối unit_price do client gửi; receipt phải có unit_price.
- Một transaction tạo doc/items/movements, khóa product/balance, tăng/giảm tồn hiện tại; từ chối tồn âm hoặc vượt giới hạn.
- Cùng request_key và payload trả lại doc; khác payload409. UNIQUE và rollback xử lý cạnh tranh.
- Chưa có endpoint import chứng từ; CSV hiện có chỉ import sản phẩm, không nhập tồn hoặc hóa đơn.

[common.js](../backend/src/business/common.js), [business-calendar.js](../backend/src/business/business-calendar.js), [bi.js](../backend/src/business/bi.js) sauP1.3 lọc/bucket theo d.created_at với IANA; movement báo cáo lấy ngày chứng từ. JSON timestamp, session và JWT vẫn UTC. UI [Ledger.jsx](../frontend/src/operations/Ledger.jsx) chưa có trường ngày phát sinh hoặc quy trình duyệt hồi tố.

Không suy ra hỗ trợ hồi tố chỉ vì database có TIMESTAMP hoặc UI hiện có bộ lọc ngày.

## 3. Phân biệt các khái niệm thời gian

| Khái niệm | Ý nghĩa/kiểu đề xuất | Quy tắc |
|---|---|---|
| created_at | Hệ thống ghi nhận chứng từ, UTC; giữ TIMESTAMP hiện tại | Server sinh thời gian thực, không nhận từ payload lịch sử |
| business_date | Ngày phát sinh theo lịch cửa hàng, DATE | Ngày-only, không offset; kèm timezone/policy để diễn giải |
| source_occurred_at_utc | Thời điểm phát sinh do nguồn chứng minh, nullable DATETIME(6) UTC | Chỉ có khi nguồn có giờ đáng tin; kèm precision/offset gốc |
| source_recorded_at | Nếu nguồn ngoài có thời gian nhập của chính họ | Không thay created_at của Retail Insight |
| submitted_at/approved_at | Mốc workflow UTC, actor riêng | Không phải ngày doanh thu |
| posted_revision | Revision ghi sổ trong branch/tenant | Dùng đánh dấu dữ liệu đã biết và phiên bản báo cáo |
| imported_at/import_batch_id | Truy vết quá trình tiếp nhận | Không phải ngày nghiệp vụ |

Ví dụ thiết kế, không phải chứng từ đã tạo: nguồn cho biết SALE phát sinh31/10/2026 nhưng nhập Retail Insight06/11/2026. business_date=2026-10-31; created_at là giờ UTC thật06/11; source_occurred_at_utc=null nếu chỉ biết ngày. Hệ thống không tự gán giờ00:00 rồi gọi đó là giờ giao dịch thật.

Nếu nguồn có giờ/offset: chuyển bằng IANA, giữ bản gốc và kiểm ngày địa phương khớp business_date. Mâu thuẫn phải được người có quyền xử lý, không tự lấy một trường để ghi đè trường còn lại. Ngày chốt ca khác00:00 không thuộc đề xuất này.

Default khi client cũ không gửi ngày: ngày kinh doanh tại thời điểm server chấp nhận ghi sổ, lấy từ clock UTC tin cậy trong transaction. Thời gian thật này và ngày được resolve phải được lưu cùng ngữ cảnh; client không được điều khiển clock. Nếu ranh giới nửa đêm đi qua trong lúc xử lý, audit phải giải thích điểm chấp nhận; không chọn ngày theo timezone máy khách.

## 4. Lựa chọn cách lưu và đọc ngày

| Phương án | Ưu điểm | Nhược điểm | Đề xuất |
|---|---|---|---|
| DATE business_date + timezone/policy snapshot | Trung thực khi chỉ biết ngày, lọc/index/group đơn giản, không cần timestamp giả | Thêm schema; DATE không cho biết thứ tự trong ngày | Khuyến nghị |
| Chỉ occurred_at UTC bắt buộc | Có thứ tự instant, dùng lại bucketIANA dễ | Buộc bịa giờ cho nguồn ngày-only; giới hạn kiểu cột | Không chọn làm trường bắt buộc |
| Chỉ metadata/JSON hoặc bảng extension join | Ít thay header cũ | Ràng buộc/index/NOTNULL và filter phức tạp; dễ lẫn basis | Không khuyến nghị làm mô hình dài hạn |
| Gán created_at quá khứ | Đỡ sửa reader | Làm sai audit, AI, khóa kỳ và thời điểm biết dữ liệu | Loại bỏ |

Business_date của chứng từ thường được server tính từ IANA nếu không có ngày nguồn. Ngày explicit do nguồn cung cấp được kiểm Gregorian, chính sách và quyền; không “đổi sang UTC” một chuỗi DATE để lưu.

DATE MySQL có miền hỗ trợ1000–9999. Bộ lọc Gregorian P1.1 vẫn nhận0001–9999 như cận truy vấn; validator ghi phải nêu rõ miền DATE và cửa sổ nghiệp vụ, không hứa lưu năm0001. [MySQL temporal types](https://dev.mysql.com/doc/refman/9.7/en/datetime.html).

**Không dùng lại clipping TIMESTAMP1970–2038 của P1.3 cho cột DATE.** Một lịch sử nguồn hợp lệ năm1960 vẫn có thể cần DATE dù created_at là thời điểm ghi hiện tại. Cần helper riêng cho date-basis, kiểm biên9999 mà không sinh10000SQL.

Query ngày nghiệp vụ có thể dùng d.business_date>=startDate AND d.business_date<=endDate; grouping ngày/tháng từ DATE đã định nghĩa theo timezone. Không cần named CONVERT_TZ. Projection trả business_date dạng chuỗiYYYY-MM-DD, không JS Date/ISOZ; created_at và occurred_at_utc vẫn timestamp UTC.

Calendar metadata đề xuất policy_version=business-date-v2, date_source=stock_documents.business_date, timestamp_source=stock_documents.created_at. Không gắn utc_interval đã clip của recorded-time vào query thực tế dựa DATE; nếu có khoảng UTC để giải thích UI phải ghi là tham chiếu, không phải predicate SQL.

## 5. Quyền và giới hạn ngày đề xuất

Không thêm role mới, không thay tài khoản hiện tại. Dùng action permissions phía Backend trên các role đã có và branch assignment; không dựa vào nút ẩn UI.

T=ngày hiện tại từ clock server trong Asia/Ho_Chi_Minh; đề xuất cấm ngày tương lai cho chứng từ đã phát sinh. Cửa sổ dưới đây cần duyệt:

| Role | Trong ngày T | Yêu cầu hồi tố | Phê duyệt/ghi hồi tố | Import lịch sử/khóa kỳ |
|---|---|---|---|---|
| OWNER | SALE/RECEIPT trong tổ chức | Tối đaT-30 ở kỳ mở, có lý do; ngoài khoảng chỉ qua batch được cấp phép | Có thể ghi trực tiếp theo policy đã duyệt, audit OWNER_DIRECT | Duyệt nguồn/batch/khóa kỳ; không tự vượt kỳ đóng |
| MANAGER | SALE/RECEIPT tại branch được gán MANAGER | Draft/submit tối đaT-7, lý do+bằng chứng | Chưa tự ghi sổ hồi tố; chờ OWNER duyệt | Preview/submit batch trong branch; không commit hoặc mở kỳ |
| CASHIER | SALE tại branch được gán | Không tạo chứng từ hồi tố; có thể gửi yêu cầu hỗ trợ không tác động ledger nếu bổ sung UI này | Không | Không import/close/reopen |
| INVENTORY | RECEIPT tại branch được gán | Như CASHIER | Không | Không import/close/reopen |

T-7 là bao gồm ngày đúng7 ngày trướcT; T-8 bị từ chối với MANAGER. T-30 tương tự cho OWNER. Không dùng “7 ngày” mơ hồ về số ngày bao gồm hôm nay.

Giới hạn thực tế là giao của: cửa sổ role, earliest verified business date, kỳ mở/grant cụ thể, branch được phép, nguồn và loại nghiệp vụ được hỗ trợ. Batch lịch sử có range riêng không tự nới cửa sổ của mọi request OWNER.

business_date có thể trước ngày tạo account/org/product trong database nếu cửa hàng đã tồn tại trước khi đăng ký. Không sửa các created_at đó; cần mốc business/history observation được xác minh riêng. Không coi signup_date là ngày cửa hàng thật bắt đầu kinh doanh.

Giữ branch ACTIVE theo chính sách hiện có trong giai đoạn đầu. Nguồn thuộc branch cũ đã ngừng hoạt động phải staging chờ quyết định riêng; không tự kích hoạt lại branch hoặc bỏ assertBranch. User bên tổ chức khác dù cũng OWNER không được xem/duyệt batch này.

Recheck active user, role, assignment, policy và kỳ bên trong transaction ghi sổ. Approval không thay thế quyền hiện tại tại thời điểm commit. performed_by là người thực sự ghi trong Retail Insight; nhân viên trên hóa đơn nguồn lưu source_operator_ref, không tự tạo user hoặc giả danh.

Nếu cần hai người độc lập duyệt import/mở kỳ, phải chốt policy riêng. Trường hợp cửa hàng chỉ có mộtOWNER cần lựa chọn OWNER_SELF_APPROVAL có lý do và audit rõ, không gọi đó là kiểm soát hai người và không tự tạo OWNER thứ hai.

## 6. Khóa kỳ và cạnh tranh

Đề xuất khóa theo org+branch+tháng nghiệp vụ, múi giờ/policy snapshot; kỳ có range DATE nửa kín [đầu tháng,đầu tháng sau). Không dùng thángUTC của created_at để kiểm kỳ.

- OPEN: nhận chứng từ trong phạm vi quyền/ngày.
- CLOSED: mọi ghi vào kỳ bị từ chối, kể cả OWNER thông thường.
- REOPEN_AUTHORIZED: chỉ batch/request được grant cụ thể, lý do, hạn UTC và người duyệt; writer khác vẫn bị chặn. Sau hoàn tất/từ chối/hết hạn quay lại CLOSED có audit/revision.
- Không có kỳ hoặc policy: fail closed, báo cấu hình chưa sẵn sàng; không tự coi mọi quá khứ làOPEN.
- Đóng kỳ cần không có import/posting đang thực hiện hoặc được serialize rõ; preview/draft không giữ quyền ghi vĩnh viễn.

**Guard chống race:** một posting-guard row theo branch là phương án ban đầu đơn giản. Cả POST cũ, POST hồi tố, commit import và close/reopen phải khóa cùng guard trong transaction trước khi kiểm kỳ/ghi. Chỉ kiểm trạng thái kỳ ngoài transaction là không đủ. Branch metadata/guard cần được khởi tạo có kiểm soát khi migration/setup được duyệt, không tự tạo giao dịch.

Thứ tự lock thống nhất: branch guard theoID tăng dần, quyền/kỳ liên quan, product/balance theo productID, source/idempotency theo thứ tự ổn định. Recheck version sau khi chờ lock; deadlock retry giới hạn với cùng idempotency key. Phương án guard độc quyền serialize branch để ưu tiên đúng; throughput cần benchmark, chưa cam kết.

Khóa InnoDB có hiệu lực trong transaction; thiết kế phải xử lý wait/rollback và giải phóng đúng. [MySQL locking reads](https://dev.mysql.com/doc/refman/9.7/en/innodb-locking-reads.html).

Hồi tố tác động kho có thể làm đổi tồn đầu/cuối các kỳ SAU ngày đó. Không chỉ mở riêng tháng chứa chứng từ nếu các kỳ bị ảnh hưởng tiếp theo đã đóng; phải từ chối hoặc cấp quy trình restatement các kỳ liên quan được OWNER duyệt. Không tự sửa báo cáo kỳ đã khóa.

## 7. Audit trail và tính bất biến

Đề xuất audit_events append-only ở tầng ứng dụng:
- event_id,organization_id,branch_id,document/batch_id.
- actor_id,submitted_by,approved_by,action,role/branch context tại thời điểm thao tác.
- requested business_date, resolved date/timezone, before/after metadata đối với draft/policy.
- reason,evidence references/checksum,source namespace/id,payload hash và schema version.
- timestamp UTC,correlation_id,approval mode,period/ledger revision,result.

Thành công ghi doc/items/movements/current balance và audit event trong cùng transaction; audit lỗi thì rollback. Draft sửa được phải có version/optimistic lock và audit; posted doc không sửa ngày/giá/dòng.

Lỗi bị từ chối hoặc transaction rollback phải có event an toàn ngoài transaction đã rollback nếu muốn giữ audit failure; không để log thành công rồi rollback dữ liệu. Không log JWT/cookie, password, secret, file nguồn đầy đủ hoặc PII không cần thiết.

Audit API chỉ đọc theo role/scope; OWNER có quyền tổ chức, MANAGER chỉ branch được phép và nội dung được giảm nhạy cảm. Không tạo role AUDITOR bằng suy đoán. Append-only ứng dụng không có nghĩa database admin không thể sửa; chống can thiệp độc lập/WORM/hash-chain là option cần duyệt, chưa có hiện tại.

Không DELETE chứng từ để “dọn” import đã commit. Nếu phát hiện sai posted doc, chặn batch tiếp theo và lập yêu cầu sửa/đảo được duyệt riêng; hiện chưa có nghiệp vụ reversal an toàn.

## 8. Tồn kho: lựa chọn và invariants

### 8.1. Vì sao kiểm tồn hiện tại chưa đủ

Ví dụ phân tích, không ghi dữ liệu: tồn mở đầu0, receipt10đơn vị ngày10/10; hôm nay tồn10. Nhập SALE5đơn vị cho05/10 sẽ để tồn hiện tại5>=0 nên code cũ có thể chấp nhận, nhưng lịch sử05/10 thành-5. Không được tự thêm receipt giả để làm hợp lệ.

balance_after hiện phản ánh tồn sau thứ tự POST. Khi chèn hồi tố, không được UPDATE tất cả balance_after cũ để biến chúng thành thứ tự nghiệp vụ; đó là audit đã ghi. Cần phân biệt balance_after_posting với projection tồn theo business_date.

### 8.2. Các chế độ

| Chế độ | Lợi ích | Rủi ro/giới hạn |
|---|---|---|
| Đổi ngày báo cáo nhưng vẫn chỉ kiểm current stock | Ít code | Không chứng minh lịch sử không âm; dễ double-count mở đầu; không khuyến nghị |
| Nhập lịch sử analytics-only vào archive riêng | Không tác động current stock, không đi vào query AI cũ nếu dùng bảng tách biệt | BI phải chọn rõ data scope; không có tồn lịch sử suy ra từ các hóa đơn này |
| Ghi hồi tố vào ledger có baseline/replay | Có thể thống nhất lịch sử và current stock | Cần opening/coverage/order đáng tin, lock/replay/projection/AI isolation, chi phí lớn |
| Khôi phục cả giai đoạn trước cutover rồi vận hành tiếp | Đối chiếu được toàn chuỗi nếu nguồn đầy đủ | Cần chốt cutover/baseline, không cộng lại opening hoặc giao dịch đã ghi |

Khuyến nghị: hỗ trợ staging trước; chọn analytics-only làm phương án lịch sử chưa đủ chứng cứ kho, tách bảng. Chỉ bật stock-affecting backdate sau khi duyệt đầy đủ invariants và gateAI. Không để client chuyển chế độ tùy ý để bypass insufficient stock.

### 8.3. Nếu chọn stock-affecting

- Có baseline quantity được xác minh tại mốc đầu giai đoạn cho từng branch/SKU; thiếu làUNKNOWN, không tự0. Giá trị0 chỉ khi nguồn xác nhận.
- Có phạm vi lịch sử liên tục và mapping nguồn→SKU/branch thật.
- Q_end=Q_open+SUM(delta) trên cùng scope; closing phải đối chiếu current balance trước import cộng đúng net-new delta.
- Không âm và không overflow ở current stock; kiểm lịch sử theo mức chính xác nguồn cho phép.
- Nếu nguồn có giờ/thứ tự thật: kiểm running balance theo thứ tự đó; khóa/kỷ luật đối với một event cùng thời điểm.
- Nếu chỉ có ngày: có thể kiểm EOD nhưng không chứng minh intraday không âm. Không bịa giờ hoặc đưa receipt trước sale chỉ để pass. Phải chọn cho phép EOD-only có cảnh báo hay bắt buộc source order; khuyến nghị chưa bật stock-affecting khi yêu cầu intraday mà nguồn không đủ.
- Insert mới chỉ một delta/current-stock effect; replay lịch sử phục vụ kiểm chứng/projection, không áp lại toàn bộ delta cũ vào balance hiện tại.
- Projection lịch sử có revision/as_of; snapshot đóng băng không bị ghi đè.
- Lock branch/period/affected stock và ledger version để giao dịch live không lọt giữa preview/validate/commit.

Nếu cần mở đầu tồn, phải có hành động/baseline riêng với nguồn và audit, không giả làm mua hàng hoặc receipt giá0. OPENING type/baseline table/API là thiết kế bổ sung cần duyệt, không có trong schema hiện tại.

Cutover đề xuất theo đầu ngày địa phương: archive [history_start,cutover), vận hành từcutover. Opening tạicutover chỉ khởi tạo một lần, phải reconcile với lịch sử nếu đủ dữ liệu và tồn thực tế đã xác minh. Nếu Retail Insight đã có hoạt động chồng lấn, cần liên kết/dedup sự kiện cũ trước; không “cộng thêm toàn bộ lịch sử”.

## 9. Doanh thu, Dashboard/BI và báo cáo cũ

Nguồn ngày báo cáo mới là business_date, không created_at. Cả sales/receipts list, count, movement và KPI/chart dùng cùng basis; giữ tenant/branch/type và EXISTS cùngitem P1.2. Inventory hiện tại tiếp tục riêng.

- Ghi hồi tố SALE làm đổi doanh thu/units/orders của ngày/tháng phát sinh; không tính vào ngày nhập chỉ vì created_at hôm nay.
- Tổng all-time chỉ tăng đúng sự kiện kinh tế mới, không tăng lần hai do retry/import file khác.
- Giá bán lịch sử phải lấy từ bằng chứng nguồn và lưu snapshot, không lấy giá catalog hôm nay. Không mở unit_price tùy ý trên POST /sales thông thường.
- Total nhập phải reconcile tổng dòng có thể biểu diễn chính xác theo contract. Không tự phân bổ chiết khấu/thuế/rounding thiếu căn cứ.
- Hoàn/hủy/đơn draft hoặc net quantity nghiên cứu không được giả thành SALE dương hoặc RECEIPT. Nguồn có nghiệp vụ chưa hỗ trợ phải giữ staging/reject có lý do.
- Giá nhập lịch sử không tự đem lại FIFO/bình quân/COGS. P1.4 không chọn hoặc triển khai phương pháp giá vốn.

Báo cáo động có thể restate sau chứng từ đến muộn. Báo cáo đóng băng cần report_revision,posting_revision,data_scope và cutoff; bản đã phát hành giữ nguyên, bản sửa có lý do/nguồn liên kết. Closing kỳ chỉ có ý nghĩa nếu late posting/reopen tuân gate.

Báo cáo “phát sinh tại ngàyD” khác “hệ thống đã biết gì tại thời điểmK”. Cần date-basis+knowledge revision; chỉ created_at<=K không đủ tái tạo mọi snapshot nếu có commit trễ, sửa policy, catalog hoặc phê duyệt. Snapshot/manifest đóng băng xác định tập dữ liệu quan sát, không rebuild tương lai rồi gắn nhãn quá khứ.

Nếu dùng archive:
- Default /bi/overview operational không tự cộng archive chưa công bố.
- Có history/combined scope được chọn rõ; inventory_scope vẫnLIVE hoặcUNKNOWN, không gọi là tồn lịch sử.
- Source registry/canonical event identity dùng chung archive/live để combined không đếm đôi. Không UNION theo id số trần vì id hai bảng có thể trùng.
- Không đồng thời publish một event ở cả archive và live. Chuyển mode cần workflow riêng, không thao tác “import lại file”.

Category BI hiện lấy catalog hiện tại. Giữ ngữ nghĩa P1.2 trong giai đoạn tương thích; nếu muốn category lịch sử phải duyệt item category snapshot và filter-basis mới, không đổi âm thầm.

## 10. AI: điều kiện chặn bắt buộc

[ai.js](../backend/src/business/ai.js) đọc trực tiếp SALE theo d.created_at, nhóm thángUTC; first_month lấy org/product.created_at; stock_as_of chọn movements qua snap.created_at. Hiện chưa có business_date/knowledge cutoff/ai_eligibility filtering trong các query đó.

Nếu ghi SALE quá khứ vào stock_documents hôm nay, AI cũ sẽ xem nó là sale ở tháng ghi nhận hôm nay. Thêm ai_eligible=false nhưng không cập nhật reader KHÔNG tự ngăn được việc này. Chỉ giữ weights/calendar cũ như P1.3 chưa đủ bảo vệ input khi nguồn mới thay đổi.

Do đó:
- Staging hoặc archive tách bảng không được AI cũ đọc là lựa chọn cách ly có thể thiết kế trước mà không sửa AI.
- Cấm publish lịch sử vào ledger live cho đến khi reader AI được duyệt xử lý/exclude đúng hoặc mọi endpoint inference/summary liên quan được gate phía server theo phương án riêng.
- Chỉ ẩn UI AI không đủ vì API vẫn có thể gọi trực tiếp.
- Quyền bật lại/gỡ gate, sửa adapter hoặc calendar AI cần phê duyệt riêng; không thực hiện trong lượt thiết kế này.

Các ảnh hưởng cần kiểm chứng khi AI được duyệt:
1. Sale monthly/weighted historical prices và cohort group/brand thay theo business_date, không phải ngày upload.
2. Lag/mean/zero_ratio/clean_month/quarter và horizon phải cùng calendar contract; không trộn DATE-local với UTC-old.
3. Account/product được tạo sau lịch sử hợp lệ: cần verified history observation start và product lineage riêng, không sửa created_at hoặc tự thêm zero trước coverage.
4. Thuộc tính sản phẩm/giá quá khứ cần snapshot nguồn, không lấy attributes hiện tại để giả feature tại forecast origin cũ.
5. Stock snapshot cần business cutoff lẫn knowledge revision; balance hiện tại hoặc balance_after_posting không thay thế tồn trước origin.
6. Backtest as-known-then không được thấy late import ghi sau origin. Tập restated actual để đánh giá và tập biết tại origin phải tách.
7. Forecast đã đóng băng không bị thay prediction/feature snapshot sau hồi tố; có revision mới nếu được duyệt, giữ lineage phiên bản cũ.

Không retrain, .fit, thayweights, thaythreshold/feature để làm khớp dữ liệu mới. Không claim WAPE/F1 nghiên cứu còn đúng sau đổi đầu vào. retail_management, retail_datawarehouse, data/research và nguồn Jan17/Hybrid30/Stockout không được nhập làm lịch sử cửa hàng.

## 11. Nguồn gốc, chống trùng và idempotency

### 11.1. Nguồn được phép

Mỗi batch cần organization từ session, source namespace đã đăng ký, chủ sở hữu xác nhận dữ liệu thuộc cửa hàng, file/evidence gốc với SHA256 server tính, phạm vi branch/date, mapping version và parser/schema version.

SHA256 chứng minh file không đổi, không chứng minh nội dung đúng hoặc nguồn được phép. Không tin tên file, tên folderNCKH hoặc dấu “approved” do client gửi.

Mapping source_branch/source_sku phải được xác minh trong tổ chức. Unknown SKU, branch inactive, item thuộc tenant khác hoặc trạng thái hàng không phù hợp phải staging, không tự tạo/kích hoạt account, branch hoặc product.

Source date phải có format/timezone khai báo; không đoán03/04 là ngày hay tháng. Excel serial1900/1904 phải có cấu hình và giữ raw value; ngày1900-02-29 giả do Excel không được qua Gregorian validator. Không chạy macro/formula.

Đề xuất hạn mức ban đầu để duyệt/benchmark:50 docs,2000 lines,2MiB/batch, mỗi doc vẫn<=100 items. Upload endpoint riêng có quota, không nới body limit toàn app. Không cắt mất dòng để fit quota.

### 11.2. Ba lớp định danh

| Lớp | Mục đích |
|---|---|
| request_key + request_schema_version/hash | Retry cùng thao tác HTTP, có thể giống cơ chế hiện tại nhưng canonical hóa chặt |
| source namespace + document type + external_document_id trong organization | Chống nhập lại cùng hóa đơn qua file/key khác |
| file hash + mapping/parser version + row/document hashes | Toàn vẹn gói preview và truy vết; không thay natural identity |

Nếu nguồn đánh số theo từng chi nhánh, namespace đó phải có branch source được đăng ký, không lấy branch_id tùy ý làm cách né duplicate. Quy định hoa/thường/collation theo contract nguồn; không tự lowercase mọi externalID.

UNIQUE ở DB là trọng tài khi concurrent commit; kiểm SELECT trước chỉ cải thiện thông báo, không đủ chống race. Cùng source identity+payload trả existing/link; khác payload409 để xử lý xung đột, không ghi đè hoặc tạo hóa đơn mới để “sửa”.

Hash legacy phải giữ thuật toán/giá trị hiện có, đánh versionLEGACY; không tái tạo request gốc bằng dữ liệu catalog hôm nay. Replay key cũ dùng normalizer tương thích, còn key mới dùng contract đã version hóa.

Canonical payload gồm resolved date/timezone, doc type/branch, item identities, quantity, giá nguồn/precision, nguồn và policy/schema version. Sắp xếp các trường/item có quy tắc, tiền theo integer cents/decimal, không phụ thuộc JSON key order.

**Retry qua nửa đêm/khóa kỳ:** khi request ban đầu không có business_date, default phải được đóng băng ở lần accepted đầu. Không resolve lại “hôm nay” hoặc lấy giá catalog mới khi trả replay. Có thể lưu request envelope hash và resolved payload hash riêng; compare theo schema version đã ghi. Nếu đã commit, retry có cùng nội dung trả doc cũ dù kỳ vừa đóng, sau khi kiểm quyền truy cập hiện tại; không áp tồn lần hai. Nếu chưa commit, kiểm clock/kỳ/quyền hiện tại trước lần ghi mới.

ExternalID hoặc digest trùng nhưng canonical full reference khác phải báo collision/conflict, không gộp im lặng. Draft/preview hash không phải khóa quyền có hiệu lực vĩnh viễn.

### 11.3. Workflow đề xuất

Upload → parse/stage → validate/mapping/reconcile → preview bất biến theo version → submit → OWNER approve mode/range/nguồn → commit nguyên tử → report kết quả + audit.

Preview phải ghi content hash, organization/branch scope, actor, mapping/policy version, period/ledger revision, totals và token/hạnUTC. Commit revalidate quyền, kỳ, stock và mọi phiên bản dưới lock. Dữ liệu đổi từ preview thì409PREVIEW_STALE và yêu cầu xem lại, không giữ lock dài trong lúc người dùng xem.

Ưu tiên atomic batch nhỏ trong một branch/giai đoạn: doc/items/movements/balance/audit/source registry/commit marker cùng transaction. Bất kỳ lỗi thì không có phần giao dịch đã ghi. Nguồn staging có thể giữ trạng thái lỗi ngoài ledger.

Batch lớn chia manifest thành các sub-batch được duyệt rõ; ghi tiến độ/ID đã commit, resume đúng key. Không quảng cáo all-or-nothing cho một file nhiều transaction. Không tự DELETE các sub-batch đã commit khi phần sau lỗi; cần phương án xử lý được duyệt.

Giới hạn hiện tại UNIQUE(document,product) không biểu diễn nhiều dòng cùng SKU khác đơn giá. Phase đầu reject có giải thích; không gộp weighted price gây lệch rounding hoặc mất source line identity. Nếu cần hỗ trợ phải duyệt line_id/line_number và migration constraint riêng.

## 12. Schema/migration dự kiến — chưa tạo DDL

| Thành phần | Bổ sung đề xuất | Lưu ý |
|---|---|---|
| stock_documents | business_date DATE; business_timezone; date_policy_version; business_date_origin; source reference/import_batch; recorded/posted revision | created_at không overwrite, ngày posted bất biến |
| stock_document_items | Nguồn/line reference, giá nguồn đã xác minh; optional snapshots theo contract | Không thay quantity/price precision hoặc UNIQUE hiện tại khi chưa duyệt |
| inventory_movements | Liên kết doc hiện có; có thể thêm posted revision | Lấy business_date từdoc, không lưu bản copy dễ lệch; giữ raw created_at/balance_after |
| inventory_balances | Có thể thêm projection/ledger_version | Tồn hiện tại, không phải kho chứa snapshot quá khứ |
| branch_posting_guards | org/branch/version | Cùng guard cho mọi writer và close/reopen |
| business_periods/reopen_grants | Scope/range/state/version/actor/reason/expiry/batch | Missing policy fail closed |
| audit_events | Audit append-only | Success cùng transaction ledger |
| document_request_receipts | Request schema version,envelope/resolved hashes,key và kết quả frozen theo scope | Retry qua nửa đêm/đổi policy; ghi cùng transaction, không thay hash legacy bằng giá/ngày hiện tại |
| source_document_registry | UNIQUE natural source identity, canonical hash, archive/live link | Identity một sự kiện kinh tế xuyên các mode |
| document_requests/request_items | Draft/submit/approval tách khỏi bảng chứng từ đã ghi sổ | Không vào stock_documents, BI, kho hoặc AI khi chưa POSTED |
| history_import_batches/documents/rows | Staging, mapping, preview/approval/commit trạng thái | Chưa published thì không vào KPI/kho/AI |
| historical_documents/items | Nếu chọn archive analytics-only | Tách physical live ledger và queryAI, công bố data scope |
| inventory_opening_states/daily_projections | Chỉ nếu chọn stock-affecting/replay | Coverage, bằng chứng, revision/cutoff; không fake opening receipt |

Cần index ứng viên (org,business_date,branch,id) hoặc (org,branch,business_date,id) cho query chính; giữ indexcreated_at cho audit/legacyAI. Lựa chọn cuối qua EXPLAIN/benchmark MySQL disposable, không mặc định tạo cả hai.

Kế hoạch migration sau phê duyệt:
1. Review snapshot/backup và schema thực tế tại thời điểm chạy; hiện0record không đảm bảo vẫn0 về sau.
2. Expand thêm field nullable/bảng metadata/index; code tương thích nhưng lịch sử chưa được bật.
3. Cập nhật tất cả writers, không cho instance cũ tiếp tục sinh NULL ngày.
4. Backfill business_date của legacy từ created_at qua IANA P1.3, giữ raw created_at; business_date_origin=DERIVED_FROM_RECORDED_AT, không gọi đó là ngày nguồn đã xác nhận.
5. Kiểm từng count/tổng/mapping/null, provenance và audit backfill; cutover reader chỉ khi hoàn tất, không để NULL biến mất khỏi báo cáo.
6. Chốt NOTNULL/constraints theo bước riêng; enable policy/period/action permissions sau setup được OWNER duyệt.
7. Reader/date_basis v2 rollout đồng bộ UI và API; không dùng OR fallback dài hạn làm yếu index/scope.

DDL MySQL có implicit commit; không coi một BEGIN có thể rollback toàn bộ chuỗi ALTER/backfill. Cần migration có checkpoint/resume, kiểm trước/sau và phương án forward-fix; không DROP cột/dữ liệu như rollback tự động. [MySQL implicit commit](https://dev.mysql.com/doc/refman/9.7/en/implicit-commit.html).

Giới hạn DATE và TIMESTAMP là hai vấn đề khác nhau. Có business_date không tự sửa giới hạn2038 của created_at; đổi kiểu thời gian ghi nhận là quyết định schema riêng.

## 13. API và UI dự kiến

Chưa có endpoint nào dưới đây được tạo:

| API | Contract/mục đích |
|---|---|
| GET /business-posting-policy?branch_id= | Server business_today,timezone,allowed ranges/actions,period state,policy version |
| POST /sales hoặc /receipts tương thích | Client cũ bỏ ngày→default tin cậy; ngày explicit chỉ theo quyền, lịch sử không đi đường giá hôm nay |
| /document-requests draft/submit/approve | Manager xin hồi tố, optimistic version, chưa ảnh hưởng stock/KPI |
| POST /history-imports, GET batch/preview | Upload/stage, nguồn/mapping/totals, không ghi ledger |
| POST /history-imports/:id/approve, /commit | OWNER scope, content/version/grant recheck, immutable idempotency |
| GET /business-periods, POST /close, /reopen-authorizations | OWNER, không bypass branch guard |
| GET /documents/:id/audit | Timeline nguồn/ngày/thời điểm ghi/approval trong scope |
| GET sales/receipts/BI/movements | date_basis/date_source v2; lịch sử/operational/combined scope rõ nếu archive được chọn |

Không cho request created_at/actor/organization_id/approval status tự quyết định. UTC timestamps nguồn không được gán vào created_at. Các body tiếp tục strict; giới hạn tiền/số lượng phải giữ hoặc điều chỉnh theo phê duyệt, không nới do “dữ liệu lịch sử”.

HTTP dự kiến:400format/domain ngày,401chưa đăng nhập,403role/branch/action,409idempotency conflict/kỳ đóng/staleversion,422nguồn không đủ/giá hoặc cấu trúc không hỗ trợ/reconcile thiếu. Lỗi có code ổn định và thông báo rõ, không lộ tài liệu tenant khác.

UI:
- Hiện hai cột “Ngày phát sinh” và “Ghi nhận hệ thống”; created_at không chỉnh được.
- Lấy ngày mặc định/range từ policy Backend, không dựa đồng hồ browser.
- Hồi tố cần lý do+bằng chứng, cảnh báo tác động kỳ/kho, trạng thái chờduyệt; không cho nútPOST thông thường mang giá lịch sử tự do.
- Import hiển thị nguồn, scope, mode, duplicate/conflict, totals, coverage/opening nếu cần; OWNER xác nhận đúng previewversion.
- Không ghi labelstock “không đổi” nếu là stock-affecting, không ghi “tồn lịch sử” cho archive không có stock evidence.
- In/xuất chứng từ có cả business_date/date origin, timestamp UTC/hiển thị IANA, nguồn và dấu nhập muộn.
- Đổi policy/ngày qua nửa đêm khi form mở phải refresh hoặc báo stale, không tự nâng quyền hồi tố.

## 14. Kiểm thử và nghiệm thu đề xuất

Chưa có implementation/test P1.4. 169PASS của P1.3 không phải bằng chứng P1.4 hoạt động.

| Nhóm | Case bắt buộc |
|---|---|
| Gregorian/domain | Leap2000/2024;1900/2100; sai ngày;DATE1000/9999;readfilter0001/9999;clock tương lai |
| IANA | Trước/sau00:00HCM, tháng/năm, lịch sử+8; date-only không bịa instant |
| Default/retry | Bỏ date, retry qua nửa đêm, giá catalog đổi, kỳ vừa đóng, key/payload version cũ |
| Quyền | Mọi role/action, assigned/unassigned/inactivebranch, foreigntenant, user bị khóa saupreview |
| Windows | T-7/T-8,T-30/T-31, earliest verified date, ngày trước signup nhưng có nguồn hợp lệ |
| Kỳ | OPEN/CLOSED/missing/reopen expired, không matchinggrant, close đối đầu commit, future closed stock periods |
| Idempotency | Cùng key/cùng nội dung; khác payload; hai file/key cùng externalID; race hai commits; response mất sauCOMMIT |
| Nguồn | Sai org/SKU/branch mapping, file hash thay, localeDate, Excelserial, duplicateSKUline, giá không reconcile |
| Kho | Thiếu opening/coverage; sale trước receipt; final stock đủ nhưng prefix âm; date-onlyEOD vsintraday; overflow |
| Stock effect | Replay không áp lại delta cũ, net-new delta đúng1lần, archive không đổi balance |
| Batch | Lỗi giữa batch rollbacktoàn bộ, source registry/audit cùng commit; chunkresume không doublepost |
| Audit | actor thật/nguồnoperator riêng, timestamp không overwrite, failureaudit vẫn giữ saurollback, posted bất biến |
| Legacy | Backfill IANA giữ created_at/count/tổng, provenanceDERIVED; không NULLlọt hoặc instancecũ sinhNULL |
| BI/list | Count/page/category/product/tenant đúng; ngàyhồi tố vào kỳđúng, toànthời gian chỉ tăng net-newevents |
| Report revision | Snapshot cũ giữ nguyên, reopened revision mới có lineage, không nhận sai “known at origin” |
| AI isolation | Archive/stage không bị mọi endpointAI đọc; ai_eligiblefalse không được coi là guard nếu readerchưa hỗtrợ |
| UI | Browser UTC/HCM/Mỹ, ngày hệ thốngreadonly, quyền/ngày thay saupreview, rõ mode/nguồn/stockimpact |
| Recovery | Commit không rõ kết quả tra idempotency, không DELETEchứng từ đểretry, rollbackmetadata không mất audit |

Unit/mock/RAM trước; concurrency/row-lock/DDL/idempotency thực phải kiểm trên MySQL disposable được duyệt riêng, không RUN_DB_TESTS=1 vào retail_app hiện tại. Không dùng NCKH làm fixture kinh doanh.

Nghiệm thu:
- Source identity duy nhất, replay không ghi đôi; lỗi không để một phần ledger/balance/audit.
- Không thể bypass branch/quyền/khóa kỳ bằng endpoint cũ, keymới hoặc batchmode.
- Ngày nghiệp vụ và thời điểm ghi nhận đúngnghĩa, không sửa thời gian để tạo lịch sử.
- Nêu đúng mức chứng minh tồn:UNKNOWN/EOD/intraday; không giảopening hoặc ordering.
- BI datebasis thống nhất, provenance/reportrevision rõ; snapshot vàAI không nhiễm latefuturedata.
- Migration/backfill có đối chiếu và recovery thực tế, không phá dữ liệu cũ.
- Các quyết định policy được ký duyệt trước bật tính năng hoặc nhận batch thật.

## 15. Phân kỳ và các quyết định cần phê duyệt

Khuyến nghị không duyệt “làm tất cả” một lần:

1. Chốt DATE+timezone/dateorigin, bất biến sauPOSTED, quyền/windowT-7/T-30 và policy tựduyệt/dualcontrol.
2. Chốt archive analytics-only hay stock-affecting; earliest source date, cutover/opening, mức EOD/intraday và scope hiển thị BI.
3. Duyệt schema/API/migration kế hoạch riêng, môi trường MySQL disposable, kế hoạchbackfill legacy và khoáwriter cũ.
4. Triển khai policy/draft/staging/preview/anti-dup/audit trước, CHƯA publish hồi tố vào ledger.
5. Chỉ bật archivepublish sau duyệt nguồn/batch; không đổi currentstock hoặcAI. CombinedBI là lựa chọn rõ có dedup.
6. Stock-affecting chỉ sau coverage/replay, period concurrency và AI-reader isolation được duyệt/kiểm chứng. Mỗi batch dữ liệu thật cần OWNER phê duyệt preview riêng.

Các điểm chưa thể chốt từ mã nguồn:
- Cửa hàng có nguồn lịch sử nào, ngày bắt đầu tin cậy, cóopening/thứtựgiờ thật haykhông.
- Cửa sổ hồi tố và quyền mởkỳ phù hợp; có người duyệt độc lập hay chỉ mộtOWNER.
- NaturalID thực của nguồn và các nghiệp vụ discount/returns/multipleSKUlines có thể biểu diễn hay không.
- Mong muốn BI giữ operational mặc định hay combined; tác động kho có được yêu cầu ở giaiđoạn đầu.
- Phương án gateAI trước khi publish vào stock_documents; đây là phê duyệt riêng, không tự thaypipeline.
- Ngưỡngbatch/performance và kế hoạchkhôi phục nếu chứng từ đã POSTED sai mà reversal chưa tồn tại.

## 16. Phạm vi đã thực hiện

Chỉ đọc mã nguồn/migrations/UI và SELECT metadata/index/constraints/counts của retail_app. Không tạo migration, API, testfixture, giao dịch hoặc draftrecord; không đổi source/.env/timezone, user/quyền, weights/AI hoặc dữ liệu nghiên cứu. Không gọi inference, không chạy test ghi DB và không nhập file lịch sử.

File duy nhất tạo là báo cáo thiết kế này. Những bảng/API/policy và ví dụ trên là đề xuất, chưa được coi là tính năng hoặc dữ liệu đã có. Dừng và chờ phê duyệt triển khai.
