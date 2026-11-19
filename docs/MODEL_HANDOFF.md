# Bàn giao mô hình AI và điều kiện kích hoạt

Ứng dụng đã có FastAPI inference-only. Chưa có weights Hybrid/Stockout trong gói bàn giao mới. Không có đường API huấn luyện và không tự fit khi khởi động.

## Artifact cần bàn giao

1. General và Specialist đúng phiên bản Hybrid 30 features, cùng feature_order, category levels/dtypes, định nghĩa feature/target và bộ input/output tham chiếu. Blend 0,25/0,75 và specialist mask được giữ trong mã.
2. Classifier Stockout V1 tương ứng F1 lịch sử 68,69%, 7 features, threshold 0,3299 và input/output tham chiếu.
3. Phiên bản Python/LightGBM/pandas/numpy/joblib lúc lưu; mốc dữ liệu, nguồn dataset, kỳ đánh giá, hash từng file và điều kiện áp dụng với dữ liệu cửa hàng mới.
4. Bản dự báo tổng/SKU được chốt trước kỳ dự báo, cùng snapshot feature tại thời điểm đó. AI-2 cần dự báo tháng trước đã lưu để hiệu chỉnh nhân quả; không tái dựng dự báo quá khứ bằng thuộc tính sản phẩm hiện tại.

Gói Retail_Forecasting_Results mới chứa MA2/Auto và lịch sử Parquet, không chứa weights Hybrid/Stockout. Kết quả MA2 không được gắn nhãn Hybrid hoặc F1 của classifier.

## Phương án để người sở hữu xem xét

- Ưu tiên lấy file gốc đã lưu trên Drive/máy khác và đối chiếu hash/phiên bản.
- Nếu estimator gốc còn trong runtime Colab, chỉ xuất đối tượng đang có cùng metadata. Không chạy lại cell có fit, không Run all. Với joblib dạng dict, trích đúng estimator từ dict sang layout service bằng thao tác serialize, không train.
- Nếu cả file lẫn estimator runtime đã mất, không thể phục hồi weights chính xác chỉ từ metric/CSV prediction. Dừng kích hoạt model đó; mọi đề xuất huấn luyện mới phải được người sở hữu phê duyệt riêng.

Chưa thực hiện phương án khôi phục hoặc huấn luyện nào. Mã nguồn và kết quả nghiên cứu gốc không thay đổi.

## Layout được hỗ trợ

Thư mục ai-service/models do người vận hành quản lý; không nhận upload công khai. Khi triển khai, mount read-only vào container AI.

- hybrid.manifest.json: version; feature_order đúng HYBRID_FEATURES trong app/algorithms.py; blend [0.25,0.75]; categories theo tên feature và đúng category levels/dtypes; files.general và files.specialist, mỗi mục có name và sha256.
- stockout.manifest.json: version; feature_order đúng STOCKOUT_FEATURES; threshold 0.3299; files.classifier có name và sha256.
- File estimator có phương thức predict/predict_proba và feature_name_ khớp. Service kiểm tra manifest, hash, tên feature và version. Artifact không khớp bị từ chối; không tự huấn luyện lại để sửa.

Joblib chỉ được nạp từ nguồn do chủ mô hình kiểm chứng và operator đặt vào thư mục này. File metadata không thay thế kiểm chứng mô hình thật.

## Điều kiện dữ liệu vận hành

- Organization, branch và sản phẩm được Express giới hạn theo người đăng nhập. Dữ liệu NCKH không tự cấp cho khách hàng.
- Chỉ dùng tháng quan sát đầy đủ kể từ sau tháng tạo cửa hàng/sản phẩm. Không điền 0 cho các tháng trước khi bắt đầu quan sát. Tháng đã quan sát mà không có giao dịch mới được tính là 0.
- Pipeline SKU kiểm tra đủ 6 tháng và các thuộc tính sản phẩm cần thiết. Group/brand lag dùng cohort trong cùng organization/phạm vi chi nhánh, không bị co lại theo bộ lọc một SKU.
- Category mới không nằm trong mapping của model sẽ bị từ chối; không tự ánh xạ mã nhóm cửa hàng sang mã NCKH.
- Tồn phục vụ gợi ý/cảnh báo được tái dựng từ movements theo mốc đầu kỳ dự báo. Thiếu bản ghi ở chi nhánh thuộc phạm vi thì giữ null; không thay bằng 0. Tồn hiện tại trên trang kho là một chỉ tiêu khác, có thời điểm rõ ràng.
- AI-2 có endpoint /v1/total chạy đúng phép hiệu chỉnh tháng trước. Phía vận hành trả MISSING_PREVIOUS_FORECAST_SNAPSHOT nếu chưa có dự báo trước kỳ được chốt. Cần cơ chế lưu run/snapshot trong retail_app bằng migration được phê duyệt riêng trước khi kích hoạt hiệu chỉnh này trên model thật.
- AI-5 seasonal+trend không cần weights, cần đủ 12 tháng liên tục. Nó không phải dự báo đệ quy SKU.
- Metrics vận hành hiện null. Các mốc nghiên cứu chỉ được trình bày trong thư viện lịch sử đúng phương pháp/kỳ/dataset.

## Gate nghiệm thu model thật

Sau khi bàn giao, xác minh checksum, version thư viện, đúng 30/7 features, categories, blend/threshold; chạy inference-only trên input/reference đã bàn giao; đối chiếu tolerance được chủ mô hình chốt. Kiểm thử tác động của giá/thuộc tính thay đổi theo thời gian và cách chốt snapshot trước khi kích hoạt thực tế. Không coi các estimator giả lập trong unit test là model dùng cho sản phẩm.


## Cập nhật 05/11/2026 — chưa tái huấn luyện

Xem [phương án tái tạo có kiểm soát](MODEL_REPRODUCTION_PLAN.md) và [audit](model-reproduction-evidence/audit.json). File V3 được bàn giao có 20 feature, 500 cây, objective regression và Test WAPE 86,4193%; không phải Hybrid30 hoặc Stockout. Stockout V1 phụ thuộc forecast Jan2023 từ cặp 17-feature hard switch; chưa xác minh tương đương với adapter Hybrid30 hiện tại. Giữ trạng thái chưa sẵn sàng cho đến khi đủ artifact, upstream signature và phê duyệt kích hoạt. Chưa fit hoặc kích hoạt file được cung cấp.
