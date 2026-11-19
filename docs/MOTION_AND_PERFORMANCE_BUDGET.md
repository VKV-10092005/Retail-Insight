# UI0 — Motion, accessibility và performance budget
07/11/2026. **Targets đề xuất, chưa đo runtime/build/Lighthouse.**

## Chọn hiệu ứng theo công việc
| Nhóm tham khảo | Chọn/không chọn và nơi dùng | Reduced motion / guard |
|---|---|---|
| Parallax | chỉ hero /welcome, dịch≤12px | tắt trên mobile/reduced motion; không POS |
| Hover | card/button nhẹ, border/shadow | luôn có focus/active tương đương |
| Page transition | fade120ms vùng route đọc | không block confirm, không remount form để mất draft |
| Scroll reveal | landing sections1lần | content visible nếu JS/off; reduced motion tĩnh |
| Subtle animation | robot greeting/LED nhỏ | không loop gọi chú ý liên tục |
| Background motion/video | gradient chậm có pause, **không video mặc định** | tĩnh low-power/save-data; không dashboard/POS |
| Micro-interactions | button/cart count/busy state |≤120ms, không delay posting |
| Lightbox | chỉ product image khi có nguồnthật | named dialog, Esc/focus return |
| Slideshow | không auto-rotate KPI; landing optional manual gallery | pause controls nếu có, không contentcritical |
| Typing | không giả AI streaming | actual server chunks mới update; screenreader theo đoạn |
| 3D | hoãn;2.5D SVG static mặc định | không runtime3D dependency/globalWebGL |
| Animated gradients | brand hero/headeraccent, no textcontrast dependency | paused reduced-motion, không flashing |

GlobalCode loading chỉ là mô tả cảm hứng trong prompt; chưa có ảnh gốc để so sánh. Intro không bắt chờ, skip được, không hiện mỗi route, không chạy ởPOS. Progressdeterminate chỉ real bytes/parsed rows/committedchunks; chưa cóserverstagecounter→indeterminate với label. “98% đang hoàn tất” giả bị cấm.

## Budget để nghiệm thu sau approval
| Hạng mục | Target đề xuất | Bằng chứng hiện tại |
|---|---|---|
| LCP / INP / CLS | ≤2,5s / ≤200ms / ≤0,1 ởp75field; lab profile riêng | NOT MEASURED |
| Initial route JS |≤180KiB gzip, exclude lazy business routes | source có React.lazy; actual bundle UNKNOWN |
| POS incremental JS |≤70KiB gzip sau shell, không Recharts/3D/chat eager | target, chưa phân tích bundle |
| Motion code/CSS |≤8KiB gzip phần mới, ưu tiên transform/opacity | no package installed |
| Hero image / robot |≤120KiB/≤40KiB illustrations; icon≤12KiB gzip | conceptSVG là designboard, không asset production đã đạt budget |
| Fonts |≤150KiB tổng needed subset/weights, fallback readable | Googlefont hiện remote, chưa đo |
| Upload/grid | serverquota/versioned paging, grid window~50–100rows sau benchmark | runtimeCSV chỉ200rows; Studio chưa tồn tại |
| Search | debounce200–300ms, abort stale requests | current ProductPicker mỗikeypressfetch |
| Memory/frame | no retained listener/dialog/chat leaks, avoid >50ms main-thread tasks | runtimeprofiling NOT RUN |

Các ngưỡng Web Vitals lấy làm mục tiêu theo [hướng dẫn Web Vitals](https://web.dev/articles/vitals); field và lab phải báo riêng, không suy fieldp75 từ một Lighthouse run. Mọi budget sản phẩm còn cần OWNER duyệt/điều chỉnh sau baseline thực.

## Accessibility
Mục tiêu [WCAG2.2 AA](https://www.w3.org/TR/WCAG22/) cho critical flows: textcontrast≥4,5:1 thường/3:1 chữ lớn, controls/focus contrast được kiểm, focus không bịstickybar che, target tối thiểu24CSSpx theo điều kiện tiêu chí; sản phẩm chọn44px cho thao tácPOS/touch. Không tuyên bố AA chỉ nhờ colorcheck.
Keyboard: skip-to-main; sidebar/nav order; dialog focus trap/restore; Escape không hủy economic intent; grid có mode navigation/edit rõ; scanner không nuốt phím trongtextbox/modal; datepicker cómanual entry vàerrorlabel. Chart cótable/summary, notcoloronly. Toastaria-live polite, paymentUNKNOWN alert khôngautodismiss.
Responsive test360/390/768/1024/1440/1920, zoom200%, Chrome/Edge, light/dark, keyboard-only, reader smoke, reducedmotion, offline/slow network, highcontrast, longVI strings. RTL không là scopev1, không hardcodefontLatinthiếu Việt.

## Phương án kỹ thuật tương lai
Giữ React/Vite/router/Recharts/Lucide hiện tại; migrate tokens/components dần. Không cài animation/3D/grid/chat SDK trong UI0. CSS trước, IntersectionObserver cho reveal khi được duyệt, dynamicimport cho heavyweight features; nếu cần package mới phải so size actual gzip/parse/CPU/license/security với baseline, không báo size ước đoán như số đã đo.
Dedupe readonly fetch, bounded chartpoints/table page, avoid form remount; query keys gồm tenant/effectivebranchscope/filter/calendar/version và clear onlogout/revoke. Không cache financial/PII/session trongCDN hoặc dùng stale response quyết địnhstock/permission. Currency/timezone precision giữ contract, không tối ưu bằng đổi semantics.
Forecast GET hiện fanout5task qua summary; UI refactor không được tự tăng calls hoặc giả làmchat. B6 cần explicit admission/trigger/quota sau approval, không đổi models/pipeline ở UI0.

Không chạy app/build/E2E/screenshot/Lighthouse trong lượt này. Offline evidence gồm source inventory/hash, docs links/schema checks, UTF-8 và contrast arithmetic; không có sốFPS/latency/capacity runtime.
