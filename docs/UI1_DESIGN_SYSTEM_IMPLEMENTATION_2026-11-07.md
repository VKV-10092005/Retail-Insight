# UI1 — Design System Foundation, Concept C

07/11/2026 — Đã triển khai nền tảng frontend; dừng tại UI1.

## Kết quả

Hoàn thiện design tokens và component dùng chung cho Concept C. Dashboard dùng bề mặt SaaS rõ ràng, biểu mẫu vận hành giữ yên tĩnh; cinematic landing chỉ được chuẩn bị bằng token motion, chưa triển khai hiệu ứng toàn màn hình. Không thêm route/navigation hoặc chatbot, không hiển thị số liệu kinh doanh giả.

Tokens bao gồm màu semantic Light/Dark, typography Be Vietnam Pro/system fallback, spacing, radius, shadow, motion, breakpoint và z-index. Primary #4F46E5 dùng với chữ trắng; #6366F1 dành cho brand/trang trí. Reduced-motion đưa thời lượng chuyển động về zero. Có hỗ trợ forced-colors và focus-visible.

Light/Dark/System dùng khóa localStorage `ri.theme`, đồng bộ tab và thay đổi hệ điều hành. Script sớm trong head áp theme trước React; lỗi storage được xử lý và hiển thị cảnh báo. Không lưu session, quyền hay dữ liệu nghiệp vụ vào theme store. Browser test xác minh theme đã áp trước module; không có đo filmstrip để cam kết mọi thiết bị tuyệt đối không nhấp nháy.

## Component và tái sử dụng

Đã có Button, Input, Select, Search, Card, Table, Modal, Drawer, Tabs, Tooltip, Toast, Badge, Skeleton, EmptyState, ErrorState và ConfirmationDialog. Các trạng thái hover/focus/disabled/loading/validation/success/error dùng cùng semantic tokens.

Button mặc định type=button. Input/Select nối label, description và error; Table có caption/header và vùng cuộn bàn phím. Modal dùng native dialog, focus loop hai chiều, Escape có kiểm soát và khôi phục focus; Drawer dùng chung cơ chế. Tabs hỗ trợ phím mũi tên/Home/End, giữ panel ẩn để không mất draft. Confirmation khóa gửi lặp, giữ hộp thoại khi callback lỗi, không tự retry. Toast do caller điều khiển, không ép tự biến mất. Tooltip hỗ trợ focus/Escape.

Tái sử dụng React 18, CSS hiện có, lucide-react và Playwright đã cài; không thêm dependency. Card/Badge cũ trở thành adapter giữ class/API. Các export cũ khác trong Elements.jsx được giữ nguyên, không thay callback value-only của Select/SearchField. CSS bridge áp token cho shell, form/table/chart presentation và in hóa đơn; không sửa query/chart/business logic.

## File tạo/sửa

Danh sách và SHA256 đầy đủ ở [manifest](UI1_MANIFEST_2026-11-07.md). Chỉ sửa năm file hiện hữu:

- frontend/index.html: bootstrap theme sớm.
- frontend/src/main.jsx: ThemeProvider và CSS nền tảng.
- frontend/src/components/layout/AppLayout.jsx: bộ chọn theme trong topbar hiện có.
- frontend/src/components/ui/Elements.jsx: adapter Card/Badge.
- frontend/package.json: scripts preview/build/test UI1; dependencies không đổi.

File mới gồm public/theme-init.js; thư mục src/design-system (tokens, theme, primitives, overlays, Tabs, CSS bridge, preview); ui1-preview.html; vite.ui1.config.js; ui1-server.mjs; playwright.ui1.config.js; tests-ui1/unit.test.js và components.spec.js; bộ tài liệu/evidence và sáu screenshot.

Đối chiếu baseline 107 file: đúng năm file được phép sửa, 102 file giữ nguyên SHA256, bao gồm source backend/AI, route/auth/API/operations và lockfile trong snapshot. Đây là bằng chứng trong phạm vi baseline, không phải kiểm kê mọi file trên máy.

## Kiểm thử đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Node pure/static unit | 35 PASS, 0 FAIL |
| Playwright Microsoft Edge, preview cô lập | 19 PASS, 0 FAIL, gồm Tab và Shift+Tab |
| Vite build toàn frontend | PASS, 2.234 modules |
| Vite build preview riêng | PASS, 1.589 modules |
| Transform syntax frontend JS/JSX | 47 file qua kiểm tra |
| Contrast số học trên cặp màu opaque | 16 cặp đạt tỷ lệ tối thiểu 4,5:1 |
| Baseline source audit | 102/107 giữ nguyên; năm thay đổi đúng phạm vi |

Browser tests kiểm Light/Dark/System, persistence/storage lỗi, validation, loading/disabled, focus trap/restore, drawer, confirmation success/failure, tab draft, tooltip/toast, legacy adapters, reduced-motion và viewport 360/768/1440 ở hai theme. Preview server từ chối /api, /index.html và source runtime; browser test chặn request ngoài loopback preview. Không import AuthProvider hoặc services nghiệp vụ.

Lần build ban đầu bị lỗi cấp phát bộ nhớ. Sau khi người dùng giải phóng bộ nhớ, build toàn frontend thành công. Bundle production: CSS 49,05 kB (gzip 11,48), main JS 208,79 kB (gzip 68,33), Dashboard lazy 402,87 kB (gzip 111,34). Đây là kích thước artifact, không phải kết quả Web Vitals hoặc FPS.

Không chạy E2E cũ vì suite hiện có nạp cấu hình backend và ghi MySQL. Không kết nối database, không migration/seed/native test/inference. Không chạy luồng bán/nhập thật hoặc kiểm thử giao diện có đăng nhập với dữ liệu thật. Chưa kiểm screen reader thủ công, đa trình duyệt, contrast mọi trạng thái/gradient, WCAG AA hoặc hiệu năng thực tế; không tuyên bố đạt các chứng nhận đó.

## Preview và screenshot

Trong frontend: chạy `npm.cmd run build:ui1`, sau đó `npm.cmd run preview:ui1`; mở http://127.0.0.1:13320/ui1-preview.html. Server chỉ phục vụ artifact UI1, không proxy API. Dừng bằng Ctrl+C. `npm.cmd run test:ui1:unit` chạy pure tests; `npm.cmd run test:ui1` build preview và chạy Edge cô lập. Không dùng test:e2e cũ cho nghiệm thu UI1.

- [Light desktop](ui1/ui1-light-1440.png), [Dark desktop](ui1/ui1-dark-1440.png)
- [Light tablet](ui1/ui1-light-768.png), [Dark tablet](ui1/ui1-dark-768.png)
- [Light mobile](ui1/ui1-light-360.png), [Dark mobile](ui1/ui1-dark-360.png)

Ảnh là Component Lab thật, không phải screenshot dashboard đã triển khai hoặc dữ liệu kinh doanh.

## Ảnh hưởng và giới hạn

CSS bridge thay đổi font size, màu, border, shadow và khoảng cách trên trang cũ; theme picker chiếm chỗ topbar. Ở màn hình hẹp breadcrumb được ẩn bằng CSS để đủ chỗ, không đổi route hay navigation link. Form dòng chuyển một cột trên mobile. Cần owner kiểm tra trực quan các trang thật trong gói sau; build/static/adapters không chứng minh mọi màn hình nghiệp vụ.

Foundation mới không tự thay toàn bộ form/modal hiện hữu. Component cũ chưa bị xóa; API mới được opt-in khi trang được phê duyệt nâng cấp. Chưa có cinematic landing, POS redesign, Import Studio, Robot Assistant hoặc business module mới.

P1.4 RC2 vẫn CANDIDATE_NOT_EXECUTABLE/nativeVerified=false; không kích hoạt runtime hoặc sửa backend/database/AI/research. Không sửa lịch sử tài liệu B0/UI0/P1.4.

## Đề xuất UI2 và điểm dừng

Đề xuất UI2 sau phê duyệt: rà soát shell/navigation về thị giác, nâng trang landing theo Concept C và áp foundation từng trang theo ma trận UI0, giữ nguyên hợp đồng nghiệp vụ; cần chốt chính xác phạm vi UI2 trước code. Nghiệm thu trực quan có đăng nhập, screen reader và performance có kế hoạch riêng, không tự dùng DB thật.

UI1 hoàn tất trong phạm vi source/build/preview. Dừng chờ người dùng xem xét; chưa triển khai UI2–UI6 hoặc B1–B6.