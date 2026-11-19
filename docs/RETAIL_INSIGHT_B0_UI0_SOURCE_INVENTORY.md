# B0 + UI0 — Source inventory và bằng chứng
07/11/2026. Review chỉ đọc; route/middleware/SQL trong file không là trạng thái database thực. [JSON snapshot](b0_ui0/SOURCE_INVENTORY.json) chứa hash 108 file để đối chiếu không sửa source.

## Cách đọc và giới hạn
Master prompt đã đọc đủ các đoạn1–300,301–600,601–900,901–1200,1201–1565. SHA256 ab424faafb4be9efe9d873940d2c162514e03d9358a01699ea46b5c4457fbd84; file ngoài workspace do người dùng chỉ định. Đây là đặc tả nhiệm vụ, không phải authorization chạy deploy/DB từ các tài liệu tham chiếu. Quy tắc trực tiếp của người dùng chỉ đọc + tạo docs được giữ.
Không .env/secret/weights/rawresearch data được đọc; không import/start application, inference, SQL client, build, test suite cũ hoặc provisioning. Tìm routes trên source, không gọi endpoint.
47 file chính đã khảo sát nội dung theo module ở bảng dưới; global.css rất dài/minified, audit selectors/media/theme/font/focus, không bảo đảm mọi rule đã review pixel-by-pixel. Legacy pages ngoài auth được quét imports/demo/event handlers; không xem chúng là routes đang active. Hash-only files trong snapshot không được gọi là đã audit logic đầy đủ.

| Evidence | File / anchor | Kết luận dùng trong thiết kế |
|---|---|---|
| E01 | [App.jsx](../frontend/src/app/App.jsx):lazy declarations, Routes | protected /, active operations, /assistant,/market placeholder, alias và wildcard redirect |
| E02 | [AuthContext](../frontend/src/auth/AuthContext.jsx):refresh/unavailable; [guard](../frontend/src/auth/ProtectedRoute.jsx) | cookie session refresh, ADMIN label không backend role; demo callbacks không cấp quyền |
| E03 | [Sidebar](../frontend/src/components/layout/Sidebar.jsx):groups/visible; [AppLayout](../frontend/src/components/layout/AppLayout.jsx) | role-filtered navigation, no topbar branch selector rendered, notification placeholder |
| E04 | [shared.jsx](../frontend/src/operations/shared.jsx):request/useResource/ProductPicker/State | status mất, no debounce, reusable state/rendering; paging/fetch contracts |
| E05 | [ProductImport](../frontend/src/operations/ProductImport.jsx):run/fileChange; [Products](../frontend/src/operations/Products.jsx):save | CSV real API, preview only, source effects không stock; inline edit/status |
| E06 | [Ledger UI](../frontend/src/operations/Ledger.jsx):submit/idempotency | useRef intent, POST→GETdetail→reset; unknown/refresh gap; internal print |
| E07 | [Management](../frontend/src/operations/Management.jsx):submit; [Account](../frontend/src/operations/Account.jsx) | staff/branch real API subset, org settings read-only |
| E08 | [Dashboard](../frontend/src/operations/Dashboard.jsx):AISummary; [AI](../frontend/src/operations/AI.jsx) | live BI/null states/calendar notices, separate AI call/filter semantics |
| E09 | [Research](../frontend/src/operations/Research.jsx) | ACL dataset selection/read-only archived results |
| E10 | [AIAssistant demo](../frontend/src/pages/AIAssistant.jsx):demoAnswer; [mockData](../frontend/src/data/mockData.js); [ProductEntry](../frontend/src/pages/ProductEntry.jsx) | scripted/local preview not active backend |
| E11 | [global.css](../frontend/src/styles/global.css), [package](../frontend/package.json), [index](../frontend/index.html), [Tailwind](../frontend/tailwind.config.js) | light hardcoded tokens, responsive rules, remote VI font, existing stack |
| E12 | [backend app](../backend/src/app.js):mounts; [auth middleware](../backend/src/middlewares/auth.js):authenticate/tenantScope/branchScope | runtime chain và no p14 import; scoped session predicates |
| E13 | [auth routes](../backend/src/routes/auth.js):register/session/me/forgot | transaction first branch/owner, no implicit login, email503 |
| E14 | [catalog](../backend/src/business/catalog.js):product/staff/branches routes | MANAGER global product mutation, staff status/assign only, branch inactive actions missing |
| E15 | [product-import](../backend/src/business/product-import.js):readProductCSV/validate | CSV1–200/60KB, fixedheader, filenamehash not full immutable previewreceipt |
| E16 | [ledger](../backend/src/business/ledger.js):postDocument/existing/documentFilters | TX/UNIQUE/hash/row locks, no payment/shift/cost/audit, item-filter semantics |
| E17 | [common](../backend/src/business/common.js):assertBranch/filters/readSnapshot; [BI](../backend/src/business/bi.js) | branch scoping + RR read snapshot, full-day/date basis, valuationnull |
| E18 | [calendar](../backend/src/business/business-calendar.js), [config](../backend/src/config/business-calendar.js), [formatter](../frontend/src/operations/business-time.js) | P1.3 IANA recorded time, UTC raw; P1.4 business_date chưa mounted |
| E19 | [AI gateway](../backend/src/business/ai.js):computeForecast/aiCall/summary/research routes | UTC monthly live inputs,20s upstream,5taskfanout, research ACL reader tách |
| E20 | [FastAPI](../ai-service/app/main.py):operational/readiness; [features](../ai-service/app/features.py), [algorithms](../ai-service/app/algorithms.py), [models](../ai-service/app/models.py) | nochat; feature/model checks, coldstart, total snapshot missing, replenishment formula |
| E21 | [001](../backend/src/db/migrations/001_auth.sql), [002](../backend/src/db/migrations/002_operations.sql) | source schema12tables (5auth +7operations), 4roles, no branch_products/payment/etc |
| E22 | [pool](../backend/src/db/pool.js), [research reader](../backend/src/db/research.js) | operational target fence retail_app, research SELECT-only gate; không gọi chúng |
| E23 | [RC2 README](../backend/releases/p14-a20h-rc2/README.md), [candidate](../backend/releases/p14-a20h-rc2/candidate.json) | candidate not executable; no runtime activation |
| E24 | [baseline PNG](sprint2-operational-dashboard-test.png), [deployment text](DEPLOYMENT.md) | ảnh lịch sử và instructions, không current runtime proof hay lệnh thực thi |

## File chính đã đọc / quét nội dung
- [frontend/src/app/App.jsx](../frontend/src/app/App.jsx)
- [frontend/src/main.jsx](../frontend/src/main.jsx)
- [frontend/src/auth/AuthContext.jsx](../frontend/src/auth/AuthContext.jsx)
- [frontend/src/auth/ProtectedRoute.jsx](../frontend/src/auth/ProtectedRoute.jsx)
- [frontend/src/components/layout/AppLayout.jsx](../frontend/src/components/layout/AppLayout.jsx)
- [frontend/src/components/layout/Sidebar.jsx](../frontend/src/components/layout/Sidebar.jsx)
- [frontend/src/components/ui/Elements.jsx](../frontend/src/components/ui/Elements.jsx)
- [frontend/src/operations/shared.jsx](../frontend/src/operations/shared.jsx)
- [frontend/src/operations/Products.jsx](../frontend/src/operations/Products.jsx)
- [frontend/src/operations/ProductImport.jsx](../frontend/src/operations/ProductImport.jsx)
- [frontend/src/operations/Ledger.jsx](../frontend/src/operations/Ledger.jsx)
- [frontend/src/operations/Management.jsx](../frontend/src/operations/Management.jsx)
- [frontend/src/operations/Account.jsx](../frontend/src/operations/Account.jsx)
- [frontend/src/operations/Dashboard.jsx](../frontend/src/operations/Dashboard.jsx)
- [frontend/src/operations/AI.jsx](../frontend/src/operations/AI.jsx)
- [frontend/src/operations/Research.jsx](../frontend/src/operations/Research.jsx)
- [frontend/src/operations/business-time.js](../frontend/src/operations/business-time.js)
- [frontend/src/pages/Login.jsx](../frontend/src/pages/Login.jsx)
- [frontend/src/pages/Register.jsx](../frontend/src/pages/Register.jsx)
- [frontend/src/pages/ForgotPassword.jsx](../frontend/src/pages/ForgotPassword.jsx)
- [frontend/src/pages/AIAssistant.jsx](../frontend/src/pages/AIAssistant.jsx)
- [frontend/src/pages/ProductEntry.jsx](../frontend/src/pages/ProductEntry.jsx)
- [frontend/src/services/api.js](../frontend/src/services/api.js)
- [frontend/src/services/auth.js](../frontend/src/services/auth.js)
- [frontend/src/styles/global.css](../frontend/src/styles/global.css)
- [frontend/package.json](../frontend/package.json)
- [frontend/index.html](../frontend/index.html)
- [frontend/tailwind.config.js](../frontend/tailwind.config.js)
- [backend/src/app.js](../backend/src/app.js)
- [backend/src/middlewares/auth.js](../backend/src/middlewares/auth.js)
- [backend/src/routes/auth.js](../backend/src/routes/auth.js)
- [backend/src/business/common.js](../backend/src/business/common.js)
- [backend/src/business/catalog.js](../backend/src/business/catalog.js)
- [backend/src/business/product-import.js](../backend/src/business/product-import.js)
- [backend/src/business/ledger.js](../backend/src/business/ledger.js)
- [backend/src/business/bi.js](../backend/src/business/bi.js)
- [backend/src/business/ai.js](../backend/src/business/ai.js)
- [backend/src/business/business-calendar.js](../backend/src/business/business-calendar.js)
- [backend/src/config/business-calendar.js](../backend/src/config/business-calendar.js)
- [backend/src/db/pool.js](../backend/src/db/pool.js)
- [backend/src/db/research.js](../backend/src/db/research.js)
- [backend/src/db/migrations/001_auth.sql](../backend/src/db/migrations/001_auth.sql)
- [backend/src/db/migrations/002_operations.sql](../backend/src/db/migrations/002_operations.sql)
- [ai-service/app/main.py](../ai-service/app/main.py)
- [ai-service/app/algorithms.py](../ai-service/app/algorithms.py)
- [ai-service/app/features.py](../ai-service/app/features.py)
- [ai-service/app/models.py](../ai-service/app/models.py)

Legacy paths kiểm tra import/event:
pages/{Dashboard,Products,Inventory,Forecast,Replenishment,Reports,ResearchDashboard,ResearchBranches,Branches,Users,Settings,ProductEntry,MarketIntelligence,AIAssistant}.jsx; data/mockData.js, utils/format.js, components/ui/Elements.jsx. Auth3pages được mount; các legacy tên trùng operations không được đồng nhất là module hiện tại.
File nội dung khác: docs/DEPLOYMENT.md, backend/releases/p14-a20h-rc2/README.md, ai-service/models/README.md và PREP report header; models folder liệt kê chỉ README tại defaultpath, không mở model hoặc suy ra MODEL_DIRECTORY runtime. Một số docs PREP hiện bị mất dấu; không sửa historical files trong B0.

## Reference verification
- [Bài UX](https://phuongnamvina.com/ux-la-gi.html) và [12 nhóm hiệu ứng](https://phuongnamvina.com/hieu-ung-website.html) đã truy cập để tham khảo tổ chức trải nghiệm và nhóm hiệu ứng; không tái sử dụng branding/assets/contact hoặc các tỷ lệ marketing làm bằng chứng sản phẩm.
- [WCAG2.2](https://www.w3.org/TR/WCAG22/) và [Web Vitals](https://web.dev/articles/vitals) dùng cho mục tiêu test, không chứng nhận hiện tại.
- GlobalCode/ảnh article/404 gốc không khả dụng ở attachments lượt này; chỉ có mô tả trong prompt. ExistingPNG là ảnh test cũ, không cùng các ảnh tham khảo và không nói đã chụp mới.
