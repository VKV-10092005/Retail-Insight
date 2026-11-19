# Phương án tiếp tục lịch sử trên Google Colab — 05/11/2026

Trạng thái: đã chuẩn bị cục bộ, CHƯA upload hoặc chạy trên Colab. Chưa huấn luyện: 0/18 fit. Tiếp tục cùng run historical-freeze-20261104T185832Z; không tạo lại dữ liệu đóng băng.

## Kiểm tra tiếp tục trên máy hiện tại

[Preflight](../artifacts/reproductions/historical-freeze-20261104T185832Z/resume-20261104T190703Z/preflight.json): RAM khả dụng 1.352.896.512 byte (~1,26 GiB), dưới 2.147.483.648 byte (2 GiB). SHA-256 manifest, toàn bộ artifact được inventory và notebook/3 CSV nguồn đều khớp. Không ghi lại manifest hoặc file đóng băng, không đóng tiến trình, không thử fit.

SHA-256 manifest gốc: `e54cf0a7f5b88f69819b535ebdbd3075951d82e3327e26319b62038030c105d0`.

## Bộ bàn giao đã chuẩn bị

Thư mục: artifacts/colab-handoff/20261104T190925Z.

- [ZIP](../artifacts/colab-handoff/20261104T190925Z/historical-reproduction-colab.zip), 11.418.754 byte. SHA-256: `fbb2e9ebbd1b3db41466069636749b8af3538eac01342bce340dc5c9de5e064a`.
- [Notebook preflight](../artifacts/colab-handoff/20261104T190925Z/Historical_Reproduction_Preflight.ipynb), mọi execution_count=null, không có cell fit hoặc output thực thi.
- [README](../artifacts/colab-handoff/20261104T190925Z/README_COLAB.md), [metadata bàn giao](../artifacts/colab-handoff/20261104T190925Z/handoff.json), [kiểm thử cục bộ](../artifacts/colab-handoff/20261104T190925Z/local-verification.json).

ZIP chứa bản sao byte-for-byte các file trong inventory của run, manifest/checksum, stock_dec2022.csv đúng hash, plan, environment lock, portable_preflight.py và CHECKSUMS.json. Không có .env/credential hoặc dữ liệu vận hành. Không cần chuyển toàn bộ CSV training/product hoặc chạy lại notebook nghiên cứu: snapshot feature/target đã đủ làm input, hash nguồn đã được kiểm tra tại máy gốc. Stock CSV cần để tái dựng đúng feature và thứ tự Stockout. Các runner freeze cũ chỉ là bằng chứng có Windows paths, không chạy chúng trên Colab.

## Trình tự sau khi chủ dự án xác nhận dùng Colab

1. Chuyển ZIP và notebook bằng thao tác thủ công vào runtime riêng. Chưa có upload hoặc mount Drive tự động. Không chia sẻ công khai dataset/Drive link.
2. Điền EXPECTED_ZIP_SHA256 trong notebook bằng hash từ báo cáo này, đặt ZIP đúng /content/historical-reproduction-colab.zip. Cell đầu xác minh hash trước giải nén, kiểm đường dẫn ZIP và từ chối ghi đè thư mục đã có. Snapshot có sẵn thì bỏ qua cell giải nén, chỉ kiểm tra hash bằng cell preflight.
3. Portable preflight xác minh checksum payload, manifest gốc, inventory, stock CSV, phiên bản và RAM. Bất kỳ mismatch nào đều dừng; không bypass assertion hoặc sửa lock để ép chạy.
4. Môi trường đóng băng: Python 3.12.3; lightgbm 4.7.0; pandas 3.0.2; numpy 2.2.6; scikit-learn 1.9.0; joblib 1.5.3; pyarrow 26.0.1. Không giả định runtime Colab đang có đúng phiên bản. requirements-reproduction.txt chỉ pin package, không tự cài Python. Nếu hosted runtime không cung cấp môi trường phù hợp, dừng và báo phiên bản thực tế; cần chốt phương án môi trường riêng trước fit. Không coi đây là phiên bản Colab huấn luyện gốc vốn chưa có bằng chứng.
5. Trước fit phải hoàn thiện và kiểm tra runner tuần tự, ledger giới hạn toàn cục 18 attempt, chống hai notebook chạy đồng thời, và nơi checkpoint bền vững do chủ dự án chỉ định. Notebook bàn giao hiện chỉ làm preflight, CHƯA có runner training. Không coi việc mở notebook là đã sẵn sàng chạy 18 fit.
6. Không khởi động fit nếu chỉ có /content tạm thời mà chưa có cơ chế lưu checkpoint bền vững. Sau khi người sở hữu cho phép mount Drive hoặc chọn nơi lưu khác, kiểm hash output đã sao lưu rồi mới báo stage hoàn thành. Không tự upload artifact ra dịch vụ ngoài.

## Hợp đồng runner cần giữ nguyên

- Jan17: 2 fit, 17 feature, 4 categorical, General/Specialist đều 296 cây/31 leaves, hard switch. Tạo forecast Jan2023 hữu hạn đầy đủ, đối chiếu lại candidate keys/labels/splits trước classifier. Không lấy Hybrid30 hoặc V3 thay upstream.
- Hybrid30: 10 fit, tuần tự từng model của 5 origin. General L1 296/31, Specialist L1 450/63; đúng 30 feature, category vocabulary, mask và blend .25/.75. Báo WAPE 03–07 và 04–07 riêng, không chọn alpha lại.
- Stockout config4: OOF 5 fit + finaldev 1 fit; giữ dev_position/fold đã đóng băng. Chọn threshold trên OOF theo argmax F1 gốc; ghi full precision, đánh giá thêm literal .3299; không dùng test để tối ưu hoặc ép F1=68,69%.
- Ngay trước mỗi fit: kiểm RAM >=2 GiB và integrity; ghi durable started record trước gọi fit. Failure/OOM cũng tính là attempt để không âm thầm vượt 18. Không tự retry fit chưa có checkpoint hoàn chỉnh; khôi phục phải kiểm attempt ledger.
- Mỗi model xong: lưu joblib/native booster, full params/category/feature/upstream metadata, references và SHA-256; kiểm reload prediction parity; publish checkpoint atomically rồi sao lưu bền vững/kiểm hash. Giải phóng model và matrix không cần, gc.collect trước model tiếp theo. Giữ n_jobs=-1 như recipe; không chạy nhiều model đồng thời.
- OOM mềm ghi failure rồi dừng; nếu runtime bị kill, started record đã lưu phải ngăn tự chạy lại và làm mất dấu attempt. Partial files không được báo complete. Không giảm dòng, precision hoặc đổi hyperparameters.
- Chỉ đọc snapshot; output để thư mục execution riêng liên kết run/hash gốc. Không sửa manifest đóng băng để hợp thức hóa input thay đổi. Không fit hai model phục vụ sau 07/2023, không activation, migration hoặc ghi database nghiên cứu.

Kiểm thử đã làm cục bộ: ZIP CRC và mọi checksum đạt; notebook/validator compile đạt; RAM giả lập 3 GiB đi qua, 1 GiB bị chặn; mismatch phiên bản và sửa byte stock trên bản sao tạm đều bị chặn. Đây là kiểm thử gate, không phải xác nhận runtime Colab hoặc kết quả huấn luyện.
