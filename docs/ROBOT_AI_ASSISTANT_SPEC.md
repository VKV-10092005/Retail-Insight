# UI0 — Robot AI Assistant specification
07/11/2026. **Concept nguyên bản, chưa tạo asset runtime/chat inference.**

## Nhận diện và vị trí
Tên làm việc “Retail Insight AI Assistant”; không tự đặt thương hiệu mascot là đã đăng ký. Silhouette robot nhỏ với đầu bo góc hình khối lục giác mềm, visor navy, hai mắt cyan, vòng cảm biến lệch như đường biểu đồ đi lên; thân silver/white và đường LED indigo mảnh. Tránh hình/giọng/phụ kiện nhận diện của mascot thương hiệu khác. Không copy GlobalCode logo/animation.
Bản tĩnh SVG làm mặc định; bản2.5D nhẹ nếu được duyệt, animation CSS cho mắt/LED/float2px. Chưa đề xuất tải WebGL runtime hoặc làm mới weights. [8 state visual board](b0_ui0/ROBOT_STATES.svg) là vector thiết kế, không phải model inference.
Landing: mascot ở cạnh hero, không là blocking overlay. Onboarding: minh họa bên hướng dẫn. Dashboard: nhỏ trong help/readiness tile. Error: state phù hợp. POS: không floating robot/chat mặc định; Help mở panel theo yêu cầu và phải rời checkout focus an toàn. Không che basket/payment hoặc hijack scanner keyboard.

| State | Trigger thật | Visual / copy | Accessibility/fallback |
|---|---|---|---|
| Idle | panel closed/không request | mắt tĩnh, glow thấp | decorative aria-hidden nếu có text label cạnh |
| Greeting | người dùng mở help | vẫy1lần≤400ms; “Bạn cần hướng dẫn thao tác nào?” | không auto mở/mất focus; tĩnh reduced motion |
| Thinking | request đã được nhận/pending | eyes scan nhẹ, “Đang xử lý…” | aria-busy, không fake progress98% hoặc giả streaming |
| Responding | chunk đã nhận từ server hoặc FAQ result | mouth LED pulse theo receipt thực; source tag | aria-live polite theo đoạn, không đọc từng ký tự |
| Success | server xác nhận operation được tool đọc, không chatbot tự post | check + text trạng thái | payment success chỉ từ confirmed server contract |
| Warning | thiếu history/stock/mapping thấp confidence | amber icon “Cần kiểm tra…” | không cảm xúc gây ép commit, text actionable |
| Error | verified request failure | red icon + correlation/reference nếu có | không lộ SQL/stack; preserve input/draft |
| Offline | network offline/unreachable | visor mờ, “Chưa kết nối dịch vụ” | không phát answer demo như thật, cho đọc FAQ đã có |

Robot không được dùng Thinking để che việc backend chưa có. Chat unavailable hiển thị OFFLINE/NOT_AVAILABLE dù animation tải được. Không gán độ chính xác/stockout proxy score thành “robot chắc chắn sẽ hết hàng”.

## Asset/component contract đề xuất
RobotAvatar(size24/40/80/160,state,decorative,label,reducedMotion,theme), RobotIllustration(type,altText). Icon feedback có text labels, color-independent. Static SVG contain viewBox, title/description khi semantic, không script/external refs/font tải từSVG. Bảng trạng thái dùng symbol gốc tự thiết kế, không rasterized stock-image.
Budget tĩnh icon≤12KiB gzip, illustration≤40KiB; animation module tải lazy sau interaction≤30KiB incremental gzip là target chưa đo. Nếu3D sau này: asset tự sở hữu, isolated lazy boundary, fallbackstatic, chỉ landing; version/license/hash review, không cài package ở UI0.
Acceptance UI5:8states, dark/light, static fallback, no flashing, no obstruction360/768/1440, keyboard close/focus return, no accidental scanner capture; source/message type visible. Robot branded không làm chatbot thành feature cóbackend.
