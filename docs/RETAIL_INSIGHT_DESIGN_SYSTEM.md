# Retail Insight — Design system đề xuất
07/11/2026. UI0 specification, không CSS/runtime implementation. Concept **Future Intelligence C** được khuyến nghị, chờ OWNER duyệt.

## Ba concept và lựa chọn
| Concept | Visual/usage | Điểm mạnh / giới hạn |
|---|---|---|
| A Futuristic Dark Premium | navy sâu, indigo/cyan edges, cards tối xuyên shell | thương hiệu mạnh, nhưng dày bảng/POS dễ quá neon, light workplace cần mode khác |
| B Enterprise Light/Dark | nền sáng, hierarchy/table rõ, tối tương đương semantic tokens | ít rủi ro, gần codebase, landing ít nhận diện hơn |
| C Hybrid | landing cinematic tối + dashboard light/dark kiểu B + POS quiet | tận dụng CSS/layout hiện tại; robot làm điểm nhận diện, không ảnh hưởng thanh toán; khuyến nghị |
Xem [concepts SVG](b0_ui0/CONCEPTS.svg), [robot states SVG](b0_ui0/ROBOT_STATES.svg). Đây là wireframe/concept vector nguyên bản, không screenshot app hoặc asset đã tích hợp. Không fake số bán hàng.

## Token proposal
| Nhóm | Light | Dark |
|---|---|---|
| bg / surface / elevated | #F6F8FC / #FFFFFF / #EEF2FF | #080D1B / #10182A / #172238 |
| text / muted | #0F172A / #475569 | #F8FAFC / #94A3B8 |
| action / on-action | #4F46E5 / #FFFFFF | #4F46E5 / #FFFFFF |
| brand/decor / cyan / violet | #6366F1 / #06B6D4 / #A855F7 | tương tự; không mặc định dùng làm text |
| focus | #4F46E5 ring trên nền sáng | #C7D2FE ring trên surface tối |
| success / warning / danger | #166534 / #92400E / #B91C1C | text #86EFAC / #FCD34D / #FCA5A5 với surface status tối được kiểm sau |
Color không là kênh duy nhất: icon+label, active/draft/unknown có text. Gradient chỉ background/illustration, không số KPI critical.

Offline sRGB contrast tính được: #F8FAFC/#080D1B18,52:1; #94A3B8/#10182A6,91; white/#6366F1 **4,47** (không dùng normal text button); white/#4F46E5 **6,29**; #0F172A/white17,85; #475569/white7,58; cyan/white2,43, nên cyan chỉ accent hoặc text dark #0F172A trên cyan7,35. Đây chỉ là cặp opaque màu, chưa kiểm toàn UI/disabled/focus/gradient.

Typography: Be Vietnam Pro hiện có, self-host WOFF2 subset sau duyệt font/license/delivery; fallback system-ui hỗ trợ Việt. body16/line-height1,5; secondary14/1,5; data table14; labels14 medium; caption12 chỉ metadata phụ; h1 clamp28–40; landing hero40–64. Numeric tabular-nums, align tiền/số phải, VND formatter explicit, không Number cast BIGINT.
Spacing4/8/12/16/24/32/48/64; radius8 input,12card,16dialog,999badge; shadows small0 2px8px alpha. Không border/blur nặng toàn màn hình.
Breakpoints:360min,640,768,1024,1280,1536. Shell sidebar248→collapsed72 desktop, tablet drawer, mobile offcanvas. Topbar64 desktop/56mobile; no horizontal body overflow; table scroll vùng riêng với label.
Z-index: base0,sticky10,dropdown30,drawer40,modal50,toast60; assistant không vượt modal/checkout focus, trong POS luôn hidden launcher nếu workspace yêu cầu.
Motion: press80–120ms,hover120–160,drawer/dialog180–220,page120; no forced intro. Reduced motion bỏ transform/parallax/loop, giữ focus/status update.
Theme preference system/light/dark chỉ lưu local preference phi nhạy cảm, không session/financial data; hydration/first-paint không flash, theme toggle semantic label.

## Component contracts
| Component family | Variant/state và behavior |
|---|---|
| Button/IconButton | primary/secondary/ghost/danger; idle/focus/pressed/disabled/loading; giữ width, async loading text; no economic auto-retry |
| Input/Select/Search/Date | visible label/help/error ID, aria-invalid; clear action; debounce search, AbortController; DATE không parse JSDate tương lai P1.4 |
| Modal/Drawer/Dropdown/Tooltip | named dialog, focus trap/restore, Esc khi an toàn, không overlay mất draft; dropdown roving tabindex; tooltip không thay label |
| Tabs/Breadcrumb/Sidebar/Topbar | aria-current, logical order, skip-link; branch switch explicit, permission metadata không là security boundary |
| Toast/Badge/Progress | live polite status; destructive error persistent; determinate progress chỉ real bytes/rows; UNKNOWN badge khácFAILED |
| Card/Chart container | title/description/source/scope/as_of; chart accessible table/summary fallback; no null→0 |
| Table/Data grid/Pagination | th scope, caption/row action names, server pagination; inline edit validation/per-row revision; virtualization phải có keyboard/reader alternative |
| Empty/Skeleton/Error | loading≠no records≠filtered no results≠denied; skeleton preserve layout, aria-busy, stable live message |
| Confirm dialog | describe consequences/references/branch/count, focus safe Cancel; disabled submit không thay idempotency; source-state recheck |
| Uploader/Mapping/Autosave | drag/drop + keyboard chooser, MIME/limits text, file replacement invalidates preview; saving/saved/conflict/offline, never claimstockposted |
| AI Chat panel | tabs Hướng dẫn / Dữ liệu kinh doanh, source/model/status chip, copy/feedback, accessible close; no mutation tools |
| Permission denied | no sensitive resource title fetched before auth, safe navigation, current scope visible |

Reuse Card/PageHeader/Badge/Table styles và shared.State như composition shape; migrate từng component, không import demo business logic. Không đổi React/Vite/router hoặc cài library chỉ vì visual; native semantic inputs và CSS ưu tiên. Nếu grid/date picker/dialog library cần thiết, chọn sau prototype benchmark/keyboard/licensing; không có measured bundle cho candidate nên không bịa kích thước package.

## Wireframe theo flow
Desktop dashboard: sidebar248 | topbar context + account | page title/date/source |4KPI | revenue2/branch1 grid | top/stock tables | AI readiness collapsed details. Owner1branch branch picker thành static chip, staff CTA optional.
POS desktop: topbar branch+shift+offline status; left search/scan + products, right cart/totals/payment sticky. Tablet60/40, mobile hai tab hàng/giỏ, payment bottom pinned với safe-area; không chatbot đè checkout.
Import: left step rail, main mapping/grid, right validation summary; bottom confirm có counts/scope. Mobile step stacking, edit per-row drawer thay bảng20cột.
Design review gate: no status/data source mismatch, complete keyboard path, no intro on posting, VI strings round-trip, light/dark contrast + reduced motion kiểm thực trước AA claim.
