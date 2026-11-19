# Báo cáo đóng băng lịch sử — 05/11/2026

Run: historical-freeze-20261104T185832Z (timestamp UTC; ngày địa phương 05/11/2026).
Trạng thái: FROZEN_TRAINING_BLOCKED_MEMORY. Đã dùng 0/18 lần fit. Chưa hoàn thành tái tạo weights.

## Kết quả đã thực hiện

- Hash notebook và 3 CSV nguồn khớp audit trước, kiểm tra lại sau đóng băng vẫn khớp. Không ghi nguồn nghiên cứu, không kết nối database, không migration, không cấp dataset hoặc kích hoạt FastAPI.
- frozen_features.parquet: 520.809 dòng, khóa/position/target và đúng thứ tự 30 feature; giữ missing, chưa encode category. Feature metadata lưu vocabulary/order/type của 9 categorical Hybrid30 và 4 categorical Jan17; size giữ numeric ở Jan17.
- ordered_keys_and_hybrid_splits.parquet lưu vị trí gốc, SKU/tháng, mask specialist và membership train/test/unused cho cả 5 origin 03–07/2023 và upstream Jan17. Mỗi test origin có 27.411 dòng. Train general tương ứng 383.754 / 411.165 / 438.576 / 465.987 / 493.398 dòng.
- stockout_candidate_splits.parquet: 12.013 SKU, 1.329 proxy positive; train/validation/test = 7.207/2.403/2.403, dev=9.610, có dev_position và OOF fold 0–4. Chưa chứng minh đồng nhất với membership runtime gốc; dựng lại đúng recipe/seed theo thứ tự stock CSV.
- Verification: hash artifact/nguồn đạt; toàn bộ position và time membership Hybrid đạt; Stockout splits không giao nhau và OOF phủ dev; so toàn bộ 17 feature của một SKU đủ 19 tháng với thực thi nguyên cell 191 không-fit: bằng nhau chính xác (kể cả missing). Kiểm tra feature này là một SKU, không tuyên bố đã đối chiếu độc lập mọi giá trị của 520.809 dòng.
- Lưu source cells/hash, bản sao hai runner, manifest, SHA-256, feature metadata và verification. Môi trường tái tạo: Python3.12.3, LightGBM4.7.0, pandas3.0.2, numpy2.2.6, scikit-learn1.9.0, joblib1.5.3, pyarrow26.0.1. Chưa có phiên bản thư viện huấn luyện gốc.

## Gate chặn huấn luyện

Máy tổng RAM khoảng 7,84 GiB; khả dụng trước đóng băng 1.470.713.856 byte (~1,37 GiB), sau 1.350.979.584 byte (~1,26 GiB). Đặt preflight tối thiểu 2 GiB RAM khả dụng vì lần đọc full frame trước đã OOM và fit cần thêm categorical matrix/LightGBM Dataset/buffer. Đây là ngưỡng vận hành thận trọng của lần tái tạo, không phải tham số hoặc yêu cầu toán học của mô hình; vượt ngưỡng cũng chưa bảo đảm đủ cho toàn bộ fit. Không thử fit khi chưa đủ RAM, không tự đổi precision/feature/n_jobs/hyperparameters hoặc lấy mẫu để giảm tải.

Có thể giải phóng RAM từ ứng dụng không cần thiết hoặc chạy trên máy nhiều RAM hơn, giữ nguyên input hashes và môi trường đã ghi, rồi tiếp tục trong phạm vi phê duyệt hiện có. Không tự dừng ứng dụng khác của người dùng. Cần kiểm tra lại RAM, hash, category contract trước fit.

Stockout cần cặp Jan17 tạo forecast hữu hạn cho đầy đủ Jan SKU trước khi xác nhận candidate membership; không dùng Hybrid30 hoặc V3 thay thế. Threshold OOF sẽ được xác định đúng recipe gốc trên OOF của bản tái tạo, ghi đầy đủ precision và đánh giá riêng literal .3299; không chọn lại theo test để ép F1. Category/split gốc và phiên bản thư viện cũ chưa có bản export độc lập nên không cam kết byte-identical.

## Model và metric

| Pipeline | Model tạo mới | Metric tái tạo | Mốc nghiên cứu | Sai lệch |
|---|---:|---|---|---|
| Hybrid30, 5 cặp origin | 0/10 | Chưa có WAPE vì chưa fit/predict | WAPE 63,9534% trên 04–07/2023; 64,1300% trên 03–07 | Chưa tính được |
| Jan17 upstream | 0/2 | Chưa có forecast | Hard switch, tháng 01/2023 | Chưa tính được |
| Stockout config4, OOF5+finaldev | 0/6 | Chưa có F1 vì chưa fit/predict | F1 68,69% | Chưa tính được |

Chưa có weights, reference predictions hoặc inference reload parity để bàn giao. Các số nghiên cứu trong bảng chỉ là mốc cũ, không phải kết quả tái tạo. Hai fit phục vụ sau 07/2023 và kích hoạt production vẫn ngoài phạm vi phê duyệt.

Artifact: [run directory](../artifacts/reproductions/historical-freeze-20261104T185832Z/REPORT.md).


## Kiểm tra tiếp tục 05/11/2026

Giữ nguyên run và các file đóng băng. Hash manifest/inventory và notebook/3 CSV nguồn đều khớp. RAM khả dụng tại kiểm tra tiếp tục: 1.352.896.512 byte (~1,26 GiB), vẫn dưới 2 GiB. Không đóng tiến trình, không fit; tổng vẫn 0/18. Bằng chứng tại resume-20261104T190703Z/preflight.json trong run.

Đã chuẩn bị ZIP và notebook Colab chỉ kiểm tra preflight; chưa upload/chạy Colab. Xem [phương án và bộ bàn giao](COLAB_REPRODUCTION_HANDOFF.md). Bộ bàn giao chưa có training runner; cần hoàn thiện checkpoint/ledger và cấu hình lưu bền vững trước fit. Báo cáo run gốc và manifest gốc không bị sửa.
