# B0 — Quyền hành động, navigation và CRUD
07/11/2026 — thiết kế, không cấp quyền. [B0](RETAIL_INSIGHT_B0_SYSTEM_DESIGN.md).

## Quyền thực tế và định hướng
Hiện backend requireRoles + branch assignment, users.role ENUM OWNER/MANAGER/CASHIER/INVENTORY. Frontend còn ADMIN label/allowlist nhưng không có identity runtime/platform API. staffEnabled demo không cấp quyền thật. Không tự biến ADMIN thành PLATFORM_ADMIN.
MANAGER hiện được global catalog CRUD subset/import bởi role ở catalog.js/product-import.js; báo cáo/sale/receipt có branch scope. Đích đề xuất MANAGER chỉ điều hành branch, catalog org-wide cần explicit delegation. Đây là thay đổi nghiệp vụ phải OWNER duyệt trước code.

| Action (đề xuất) | OWNER org | MANAGER branch được gán | CASHIER branch | INVENTORY branch | PLATFORM_ADMIN |
|---|---|---|---|---|---|
| branch.view / branch.create/update/archive | view+manage | view; không create/archive mặc định | branch được gán | branch được gán | Không business access |
| employee.create/update/disable/assign | Có, trừ OWNER protection | Không mặc định; delegated subset nếu duyệt | self account | self account | service identity riêng, không sửa staff tenant |
| product.view / product.create/update/archive | Có | view; mutate chỉ delegated org permission (khác source hiện tại) | view sellable fields | view warehouse fields | Không |
| branch_product.price.update / enable | Có | explicit price scope được duyệt | Không | Không | Không |
| import.create/row.update/preview | Có | branch/catalog scope theo mode | Không mặc định | draft receipt; catalog create cần quyền riêng | Không |
| import.commit | scope tương ứng | explicit action + mode+branch | Không | explicit receive/opening authorization; không auto catalog mutate | Không |
| sale.create / payment.confirm | Có, tự POS | branch | branch/shift | Không | Không |
| sale.refund / return.approve | Có theo policy | approve hạn mức nếu duyệt | request, không tự duyệt | receive damaged/stock theo ticket đã duyệt | Không |
| inventory.receive | Có | branch | Không | branch | Không |
| inventory.count / adjust.approve | Có | count+approve tách action | Không | count; không tự approve mặc định | Không |
| transfer.dispatch / receive | Hai scope theo action | nguồn/đích được gán | Không | dispatch/receive scope riêng | Không |
| report.view / report.export | Có | assigned scope; export permission riêng | chỉ invoice/shift theo quyền | stock reports nếu cấp, không toàn revenue | Không mặc định |
| ai.forecast / ai.explain | Có | assigned scope | help FAQ; không business AI mặc định | FAQ; stock explanation chỉ delegated | Không |
| policy.period.close / reopen | approval riêng | Không mặc định | Không | Không | operator không đồng nghĩa business authority |
| support.ticket.create/read | own org | own scope | own ticket | own ticket | ticket được chia sẻ/service status, không sales |
| system.tenant.status | Không global | Không | Không | Không | operator-approved audited flow, service plane riêng |

UI tính capability từ server + scope/version; backend kiểm mỗi endpoint và TX chứ không chỉ ẩn menu. 401 hết phiên→reauth;403 action denied không auto đổi role/branch;404 out-of-scope detail hạn chế existence leak. Auth cache không dùng để cho phép posting. Org từ session, không tin body/header. Assignment chưa đủ nếu user global role bị thu hồi. Cấm replay response khi quyền đọc hiện tại mất.
Một user nhiều action/branch không yêu cầu đổi database hoặc account giả; nhiều role tại cùng branch là extension chưa có, cần merge grants/explicit deny policy duyệt trước.

## CRUD matrix đích (chưa có là đề xuất)
C=create; R=list/detail; U=update; D=hard delete; A=archive/disable; X=reactivate. Mọi list có search/filter/pagination stable; audit và authorization ở backend.

| Entity | C/R/U | D hoặc A và điều kiện | X / search / audit | Source hiện tại & mở rộng |
|---|---|---|---|---|
| Branch | OWNER C/R/U | D chỉ unused, không stock/docs/assignments/default; còn lại A | X qua policy; list status/q/page; audit | POST/GET/PUT có; A/X/D/search pagination thiếu |
| Staff | OWNER C/R/U scope | Không D actor đã referenced; disable, revoke sessions | Reactivate explicit; role history; name/email edit riêng | POST/GET/PATCH role/status/branches có; invite/profile/history thiếu |
| Category | OWNER/delegated C/R/U | D unused; referenced A, không cascade product | X, q/page/audit | GET/POST có; U/A/X/D thiếu |
| Product | C/R/U theo org permission | D chỉ no docs/movements/import links; thường DISABLED/ARCHIVED | X phải kiểm branch offers; q/category/page | GET/POST/PUT status có; detail/archive/delete/audit riêng thiếu |
| Branch offer | scope C/R/U | Disable bán không xóa cost/stock/history | X, branch/category/sku; price change audit | MISSING |
| Supplier | org C/R/U | D unused, A khi có receipt | X, q/status/page/contact audit | MISSING |
| Import session/rows | create/read/edit draft | Cancel draft; purge chỉ uncommitted theo retention. Committed không D | resume/version CAS/filters errors; events | Runtime CSV stateless, staging MISSING |
| Receipt draft | C/R/U lines | D/cancel draft, posted linked correction không D/U lines | Không restore posted “về draft”; search/filter audit | Writer immediate POST có; draft/supplier/correction thiếu |
| Sale/cart | C/R/U cart | Void cart; posted return/refund linked, không delete | Invoice read/print; keyed state lookup | SALE/list/detail/print có; POS đầy đủ thiếu |
| Cashier shift | open/read/count/close | Không D closed; correction append | Không reopen tự động; history filters/audit | MISSING |
| Count | C/R/U trước approval | cancel draft; posted adjustment bất biến | recount là session mới, revision/audit | MISSING |
| Transfer | C/R/U draft | cancel trước dispatch; sau dispatch xử lý receive/return/loss có approval | Không delete in-transit; status/branch/date | MISSING |
| Payment/refund | request/read/confirm approved | Không xóa confirmed, append reversal/refund | reconcile UNKNOWN bằng identity, không new key | MISSING |
| Business settings/policy | create version/read/activate | Không xóa policy đã referenced; supersede | CAS/config diff/audit | Account read có; config endpoint thiếu; P1.4 còn OFF |
| Support ticket | tenant create/read/reply | close; không destructive shared history mặc định | reopen theo SLA/retention; q/status | MISSING |
| Conversation | create/read/append | clear/archive theo retention và scope; không xóa audit event | history chỉ current-authorized scope | Demo in-memory không mounted; backend MISSING |

Điều kiện DELETE kiểm dưới TX khóa reference/guard phù hợp để chống tạo transaction giữa check và delete; FK RESTRICT bổ trợ. Trả409 ENTITY_IN_USE với counts/lý do được phép xem, CTA “Ngừng hoạt động”; confirm dialog không thay server authorization/idempotency.
Archive branch có stock/in-transit/active shifts phải chặn hoặc workflow chuyển/đóng được duyệt, không tự set inactive làm mất khả năng xem detail lịch sử. Current assertBranch chỉ ACTIVE nên cần history-view authorization riêng cho branch archived trước khi mở archive feature. Không sửa current helper trong B0.

## Menu theo quy mô và role
Owner1branch: Tổng quan / Bán hàng / Sản phẩm / Nhập hàng / Kho / Báo cáo / AI / Chi nhánh / Nhân viên / Hỗ trợ / Cài đặt. Optional staff/branches không hidden vĩnh viễn, nhưng không xuất hiện như required checklist.
Owner multi: context picker “Toàn tổ chức” cho report, explicit branch cho cart/import/count. Manager chỉ allowed branch; cashier home→POS + invoices + shift + account/help; inventory home→warehouse/receipts/import/count/transfer theo action.
Platform admin shell riêng, không link sang tenant dashboard có data khi thiếu support access grant. Research chỉ khi dataset grant, tách khỏi BI operational và menu onboarding người dùng nhỏ.
