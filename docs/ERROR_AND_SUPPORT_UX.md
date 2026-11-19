# UI0 — Error, support và onboarding UX
07/11/2026. Design-only; hiện chỉ /forbidden và wildcard redirect, request errors generic. Không có ticket backend hoặc hotline thật được xác nhận.

## Error matrix
| State | Nội dung/robot | CTA an toàn / data protection | Trigger/API dependency |
|---|---|---|---|
| 401 | “Phiên đăng nhập đã hết hạn” / offline | reauth, safe return URL nội bộ; cart chỉ lưu theo policy, không cho người khác mở | auth-expired hiện clear user; v2typedstatus cần bổ sung |
| 403 | “Bạn chưa được cấp quyền thao tác này” / warning | quay scope được phép, request support; không tự switch org/role | server deny, không chỉ hiddenmenu |
| 404 | “Trang hoặc nội dung không khả dụng” / searching | trởvềdashboard hoặc landing theo auth, back; không lộ entity củaorgkhác | replace wildcardredirect bằngview; API scoped404 |
| 500 | “Có lỗi khi xử lý yêu cầu” / error | retry read, correlation ID, reporterrornếucóbackend | không stack/SQL/token; writeunknown chuyển lookup |
| 503 | “Dịch vụ tạm chưa sẵn sàng” / offline | read retrybackoff/Retry-After; forecast notready reason riêng | AI unavailable không làm POS tựpostlại |
| Offline | “Mất kết nối, chưa gửi/không rõ đã nhận” | giữ form, blockconfirm mới; reconciliation cho inflight | không bán offline khi chưa có offline-sync contract |
| Maintenance | “Đang bảo trì trong phạm vi…” / paused | read-only hoặchẹnquaylại nếu cấu hìnhthật | readiness/maintenance server metadata tươnglai, không fake countdown |
| Validation409/422 | field/stock/price/period conflict | focusfirsterror, reviewprice, stale draftdiff; no automaticoverride | hiện backendmessagev1; structuredcodes future |
| Transaction UNKNOWN | “Chưa xác nhận kết quả; đừng tạo giao dịch mới” | tra cùng request_key, reauth rồilookup, operatorreference | chưa có keyedlookup endpoint/runtime receipt mới; backenddependency |

Preserve query/scope khi quay lại; no sensitive rawURL/token trongcorrelation hoặc telemetry. RetryGET códeadline/backoff, retrywrite chỉ explicit sameintent theo servercontract, khônggenericbutton“thửlại” cho mọi503. Giá/tồn hiển thị chưa reservation, out-of-stock updatecartrevalidation.
Confirmationdialog: title cóentity/branch/count/hậuquả, Cancel mặcđịnh, destructiveaction label rõ, không “OK” mơhồ. ENTITY_IN_USE: lýdo và CTA ngừnghoạtđộng, không xóaheaderđãposted. Detail invoice không bịẩn vì branch inactive nếuview permission hợp lệ (backend design cần trướcarchive).

## Support Center đề xuất
Routes /help (FAQ/search), /support (ticket list/create/detail), /service-request/website (tưvấnwebriêng) đều mới. Contact channels lấy platformconfig approved; mockup chỉ dùng “Chưa cấu hình thông tin liên hệ”, không email/hotline/Zalo tựbịa hoặc lấy từ website tham khảo.
Ticket fields category(BUG/HOW_TO/FEATURE/WEBSITE_SERVICE), title, detail, contactconsent, correlationoptional, fileallowlist private. Previewredaction, maxattachment/quota/retention cầnoperatorreview. Status OPEN→IN_PROGRESS→WAITING_USER→RESOLVED→CLOSED; humanagentupdates auditable. Không “đãgửi” nếuchưa nhận201ticketid.
Platformoperator viewmetadata dịch vụ/ticketđãchia sẻ, không auto đọc tenant sales; dataaccessgrant explicitpurpose/expiry/audit nếuđượcduyệt. Website riêng nằmngoàiNCKH, không biếnappthànhmarketplace.

## Onboarding progressive
Register thực đã tạoorg/owner/branch, khôngauto-session. Từlogin→overview empty:
1. Xác nhận cửa hàng/branch mặcđịnh (hiện chưa có default marker; đềxuất default_branch_id).
2. ThêmproducthoặcCSVhiệncó; Excel/Studio optionchỉ bật sauB3.
3. Ghi tồn đầukỳ theoopeningcontract mới; hiệnchỉcóreceipt, wordingkhôngđượcgọiopeningworkflowđãcó.
4. Cấu hìnhgiá mặcđịnh; branch override chỉsaukhiB2có.
5. MởPOS khiđủsellableproduct/stock; shiftactions chỉsaubackendB4.
6. Xembáocáo từsales thật; AIcho biết điều kiện thiếu, không đợiđủhistorymớiđược bán.
Thêmnhânviên/branchthứhai là optional, bỏqua không gâywarning. No sample revenue điềnvào dashboard.

## Empty/loading/success system
Emptynewstore có checklistđủquyền; filteredempty có “xóa bộlọc”; permissionempty khônggợiýtạoentitymàkhôngđượcphép; AIcoldstartgiảithíchlịch sử/attrs thiếu. Skeleton chỉkhibeginfetch, không che existingdata khi refreshnhẹ; labelas_of vàstalechuẩnsourcedesign. aria-busy/status, errorspersistent đếnngườidùngđóng/sửa; successfulpostcóID/timeline, khôngchỉtoastdễbiếnmất.
Performance/a11y/visualacceptance: keyboardtớiCTA, focusrestore, contrast/bigtype, screenreaderstatuskhôngspam, reducedmotion,360pxnoscrollbody, checkoutkhôngbịrobot/chatcover; testsđềxuất chưa chạy.
