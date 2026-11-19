# Retail Insight Mobile

Ứng dụng Flutter Material 3 dùng trực tiếp API Express tại `/api/v1`.

## Chạy ứng dụng

```powershell
flutter pub get
flutter run
```

- Android Emulator mặc định dùng `http://10.0.2.2:3000/api/v1`.
- Web/Windows mặc định dùng `http://127.0.0.1:3000/api/v1`.
- Điện thoại thật: tại màn hình đăng nhập, bấm biểu tượng máy chủ và nhập địa chỉ LAN, ví dụ `http://192.168.1.10:3000`. Ứng dụng tự bổ sung `/api/v1`.
- Backend phải lắng nghe trên địa chỉ LAN và cổng `3000`; Windows Firewall cần cho phép kết nối từ điện thoại.

Phiên đăng nhập dùng cookie `session` hiện có của backend và được lưu bằng cookie jar trên Android/desktop. Mọi request thay đổi dữ liệu đều gửi `X-Requested-With: retail-web`; request theo chi nhánh gửi thêm `X-Branch-Id`.

## Kiểm tra

```powershell
flutter analyze
flutter test
flutter build apk --debug
flutter build web
```

APK debug nằm tại `build/app/outputs/flutter-apk/app-debug.apk`; bản Web nằm tại `build/web`.
