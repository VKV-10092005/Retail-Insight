# UI0 — Frontend audit Retail Insight
07/11/2026. **Source audit, không chạy ứng dụng/build hoặc sửa code.** [Ma trận từng trang](PAGE_REDESIGN_MATRIX.md), [source evidence](RETAIL_INSIGHT_B0_UI0_SOURCE_INVENTORY.md).

## Stack và các lớp đang dùng
frontend/package.json khai báo React18, Vite6, react-router-dom7, Recharts2, Lucide, Tailwind3; đây là dependency ranges, chưa xác minh installed runtime version hay browser execution. tailwind.config.js chưa extend tokens, global.css chủ yếu hard-coded CSS. index.html lang=vi, UTF-8, font Be Vietnam Pro từ Google Fonts; font remote failure chưa đo.
main.jsx dùng StrictMode/AuthProvider/BrowserRouter. App.jsx đã lazy route-level + Suspense text; không phải mọi trang eager. Không có theme provider/dark tokens/reduced-motion CSS trong file đã quét. AppLayout có sticky sidebar/topbar và mobile backdrop; selectedStore tồn tại trong context nhưng topbar chưa render selector. Notification button chỉ tooltip chưa có dữ liệu thật.

## Route graph hiện có
| Route | Component active | Source/API thực | Gap UI0 |
|---|---|---|---|
| /login,/register,/forgot-password | pages cùng tên | authRequest; register→201→login, forgot503 | giữ form labels/security; onboarding và trạng thái email unavailable rõ |
| /forbidden | inline Forbidden | frontend guard only | 403 view chuyên biệt; backend vẫn enforce |
| / | operations/Dashboard | bi/overview OWNER/MANAGER; staff greeting | dashboard không bị chuyển thành landing; landing mới /welcome đề xuất |
| /reports | operations/Dashboard | cùng BI hiện tại | không gọi là saved reports/export freeze khi chưa có |
| /products,/products/new | operations/Products | catalog + embedded ProductImport | /new chỉ OWNER/ADMIN, nhưng MANAGER edit tại /products; cần policy alignment |
| /sales,/inventory | operations/Ledger sale/default | sales/receipts/inventory/movements | form ledger chưa là POS; cả hai route làm nhiều fetch thừa và staff có thể gặp403 phần không được phép |
| /branches,/users | operations/Management | branches,staff thực | branch archive/disable thiếu API; staff edit chỉ role/status/assignments, không invitation |
| /settings | operations/Account | auth/me + dashboard info | read-only, không UI đổi timezone/currency thật |
| /forecast,/forecast/total,/forecast/multi,/alerts,/replenishment | operations/AI | ai forecast/readiness + scope | không đủ data có reason thực, không biểu diễnnull=0; filter originUTC khác BI |
| /research | operations/Research | dataset grant→archived runs/forecasts | giữ nhãn research, tránh cold-start onboarding điều hướng vào nghiên cứu |
| /research-demo,/research-branches | redirects tới /research | không mount legacy mock dashboard | ghi rõ alias, không tuyên bố có dashboard branch mới |
| /assistant,/market | ComingSoon inline | không business API | demoAnswer page không được mount, không đưa lên như chatbot thật |
| * | Navigate('/') | không dedicated404 | mất context đường dẫn sai; đề xuất404 có route-aware return |

## Legacy không mounted, không dùng làm bằng chứng tính năng thật
pages/Dashboard và Branches là API wrappers cũ; Settings là local density/staffEnabled demo; Users dùng các context callbacks unavailable; ProductEntry dùng local state + naive CSV.split. Products/Inventory/Forecast/Replenishment/Reports/ResearchDashboard/ResearchBranches import mockData hoặc SIMULATED. MarketIntelligence là calculator/demo; AIAssistant là demoAnswer string, không LLM. Giữ nguyên trong B0; B1/UI1 không tự xóa chúng, cần import graph/legacy-route regression trước cleanup.
services/api.js default isMock và một số API paths cũ không quyết định active operations behavior. operations/shared.request mới đang được dùng; audit theo import graph chứ không tên file “Dashboard”.

## Findings ưu tiên
| ID | Mức | Bằng chứng | Hệ quả / đề xuất |
|---|---|---|---|
| U01 | Critical trust | Ledger submit “Thanh toán” chỉ POSTSALE, không payments table/API | UI nhãn hiện tại dễ nhầm tiền đã nhận; B4 payment contract trước UI confirmed-payment |
| U02 | High | idempotency useRef, sau POST còn GETdetail mới reset; reload mất key | UNKNOWN state cần server lookup + bounded pending intent storage có ACL; không new key sau network timeout |
| U03 | High | role labels ADMIN/guards khác ENUM/backend, staffEnabled inert | capability map đúng backend; không tự thêm platform admin, không menu như permission |
| U04 | High | shared.request throw Error không giữ response.status; res.json luôn parse | khó phân401/403/409/503 và HTML network response; design typed adapter, chưa sửa |
| U05 | High | JSON attributes textarea, inline product form dài, category id numeric CSV | thay typed guided fields sau backend schema; không giả đầy đủ30AI features bằng auto-fill |
| U06 | Medium | ProductPicker search mỗi keypress; Ledger còn products100 unused list; Dashboard nhiều useResource | debounce/cancel/de-dupe; không bỏ scoping để tối ưu |
| U07 | High | Ledger gọi receipts cho cashier/inventory GETsales cho inventory; role-agnostic menu | chia workspace theo allowed action, không ngầm mở thêm backend quyền |
| U08 | Medium | global.css body13px, nhiều labels8–11px, numerous hardcoded colors | DS body16, secondary14, semantic tokens; kiểm contrast/light/dark |
| U09 | Medium | Table/Pager đơn giản, không skeleton/filter state persistence | server paging/cursor, numeric alignment, separate empty vs filtered zero, save draft before navigate |
| U10 | Medium | chart transitions disabled source; no reduced-motion override/theme | giữ fast charts, progressive optional motion; no neon in data tables |
| U11 | High privacy | ExportCSV generic helper quotes nhưng chưa neutralize formula prefixes | future authorized export theo server scope, spreadsheet injection handling; không tự mở export cho staff |
| U12 | Medium | wildcard redirect, only forbidden, raw shared State generic retry | dedicated401/403/404/500/503/offline/maintenance, retry theo safety |
| U13 | Medium | globalCSS input:focus-visible có, nhưng textarea/complex grids/dialog trap chưa đầy đủ | accessibility patterns và manual keyboard/reader checks; chưa tuyên bố AA |
| U14 | Data semantics | BI IANA recorded timestamps; AI UTC; null valuation | calendar/source/as_of visible per panel, không gộp “lợi nhuận” hoặc “AI chính xác” giả |
| U16 | Field-level privacy | catalog GET /products trả p.* cho mọi user authenticated | cost_price/attributes có trong payload dù UI không render; cần duyệt projection theo action, không gọi hide-column là bảo mật |
| U15 | Documentation | PREP hiện có ký tự? bị mất dấu | ghi bộ mới UTF-8 và round-trip; sửa lịch sử chỉ qua gói repair/manifest riêng |

## Baseline visual và giới hạn
Đã xem ảnh sẵn có docs/sprint2-operational-dashboard-test.png: sidebar sáng, filter/KPI/card chart nhiều hàng, dataset fixture trong ảnh. Đây là **ảnh lịch sử**, không screenshot runtime ngày07/11; ảnh còn nhãn UTC trước P1.3 nên không làm bằng chứng calendar hiện tại. Không sao chép test account/email/numbers trong ảnh vào concept.
Ba ảnh GlobalCode/article/404 được master prompt mô tả nhưng không có file ảnh đính kèm khả dụng trong lượt này; chỉ dùng mô tả cảm hứng, không bịa đã nhìn ảnh gốc. Không mở app lấy baseline vì có nguy cơ gọiDB; visual runtime/a11y/Lighthouse/E2E là BLOCKED/NEEDS_APPROVAL.
