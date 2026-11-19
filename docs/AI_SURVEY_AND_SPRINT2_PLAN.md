# Khảo sát AI hiện có và kế hoạch tích hợp Sprint 2

Ngày khảo sát: 04/11/2026. Trạng thái: chỉ khảo sát và đề xuất, CHƯA triển khai Sprint 2.

## 1. Đính chính phạm vi nhận xét Sprint 1

Cụm “sản phẩm/kho/AI còn là demo” mô tả nguồn dữ liệu và mức tích hợp của các trang trong ứng dụng mới. Nó không có nghĩa công trình AI chưa được triển khai hoặc phải làm lại.

Kết luận khảo sát: có mã thuật toán, mã huấn luyện/đánh giá, output thực nghiệm và dữ liệu nghiên cứu. Phần còn thiếu chủ yếu là bàn giao artifact có thể nạp, xác định phiên bản tương ứng từng kết quả, dịch vụ inference/đọc kết quả, ánh xạ dữ liệu và kết nối UI. Không đề xuất tự huấn luyện lại.

## 2. Nguồn và phương pháp kiểm tra

| Ký hiệu | Nguồn | Phạm vi kiểm tra |
|---|---|---|
| A | C:\DaiHoc\NCKH\ChuoiCungUng\retail-ai-system | Cấu trúc frontend/backend, API, thư mục ai-service |
| B | C:\DaiHoc\NCKH\ChuoiCungUng\retail_excel_experiment | 18 script Python, README, 24 CSV, 2 JSON và schema SQLite mở mode=ro |
| C | C:\DaiHoc\NCKH\retail_excel_experiment | Routes, adapter, các trang sản phẩm/kho/AI, backend hiện tại |
| N | C:\Users\TUF F15\Downloads\Retail_FP_Demand_Forecasting (4).ipynb | 478 code cells; 464 cells có output lưu sẵn |
| Z | C:\DaiHoc\NCKH\ChuoiCungUng.zip | Danh mục ZIP và hai ZIP lồng nhau, không giải nén ra nguồn nghiên cứu |
| D | Hai SQL dump retail_management.sql, retail_datawarehouse.sql trong Downloads | Đọc schema, metadata run và các dòng INSERT dưới dạng văn bản; không thực thi SQL |
| P | Các CSV nằm ngay dưới C:\DaiHoc\NCKH\ChuoiCungUng | Header, kích thước, đối chiếu dataset/feature và số dòng một số file |

Chỉ đọc file; không chạy notebook, script ETL/huấn luyện, migration hoặc truy vấn ghi database trong đợt khảo sát này. Không mở kết nối live tới hai MySQL nghiên cứu; số liệu dump dưới đây là bản chụp offline, không khẳng định số dòng database hiện tại. Không sửa mã nguồn ứng dụng trong đợt này; chỉ thêm tài liệu khảo sát và chú thích báo cáo cũ.

Notebook SHA-256: `43e7489556309d80adeee53be565ceec0df7018fffcbe3c76ef066799bf75c8c`.

Các tham chiếu cell bên dưới dùng **index bắt đầu từ 0** trong JSON notebook. execution_count đều null; output vẫn được lưu. Vì vậy bằng chứng thực nghiệm ở đây là output đã lưu và mã tương ứng, không phải kết quả chạy lại hay xác nhận khả năng chạy toàn bộ notebook từ runtime sạch.

## 3. Hai nhánh nghiên cứu cần giữ tách biệt

### A. Dự án web retail-ai-system

- React 18/Vite có các trang sản phẩm, kho, forecast, replenishment và dữ liệu mẫu.
- Backend Express chỉ có GET /api/health, trả database not-connected/mode scaffold. Các thư mục controller/service/repository chủ yếu là README.
- ai-service chỉ có README. README nhắc forecasting/ses.py nhưng file này không hiện diện trong cây đã khảo sát. Không tìm thấy FastAPI app, endpoint inference hay file Python trong thư mục ai-service.
- Vì vậy nguồn A hữu ích cho giao diện/cấu trúc; chưa phải dịch vụ AI có thể gọi ngay.

### B. Nhánh Excel độc lập 2011–2017

README của B xác định nguồn Du lieu Kinh doanh ban hang(4).xlsx, khác bộ InventoryAndSale_snapshot_data của nghiên cứu chính 2022–2023. Không ghép SKU, doanh thu hay mã kho vào nghiên cứu chính khi chưa có ánh xạ được xác minh.

- retail_excel_dw.sqlite khoảng 204 MB; schema gồm fact_sales, fact_returns, các dimension, exp_fact_sales, exp_sales_quality_flags và các bảng thử loại trùng.
- quality_and_metrics.json ghi 410.703 dòng, 1.859 SKU, 84 tháng, 3 nhóm hàng; mã warehouse không đồng nghĩa chi nhánh.
- Có pipeline thực thi: run_retail_excel_experiment.py; 02_build_retail_dw.py; 03_olap_retail.py; 04_forecast_from_olap.py; script kiểm tra trùng, anomaly, phân nhóm nhu cầu và so sánh dự báo.
- Thuật toán có mã: Lag1, MA2/MA3, SES; compare_intermittent_forecast.py có Croston/TSB, evaluate_test_2017_periods.py có TSB/MA2.
- Có CSV kết quả: forecast_reports/model_metrics.csv, selected_model_test_2017.csv, forecast_comparison/model_comparison.csv, intermittent_forecast/all_model_results.csv và các báo cáo sai số.
- Chỉ số SES Test 2017 WAPE 207,9081% trong JSON thuộc dataset Excel này; không thay thế hoặc đối chiếu trực tiếp thành chỉ số Hybrid 2022–2023.
- Có thể tái sử dụng hàm thuật toán, kiểm tra chất lượng và cách đánh giá, sau khi tách khỏi phần I/O. Không chạy nguyên script vì nhiều script tạo bảng/ghi file tại thư mục gốc.

### N/P/D. Nghiên cứu chính 2022–2023

Notebook chứa mã thực thi cho cả năm chức năng và nhiều biến thể thí nghiệm. Dữ liệu cục bộ P có retail_ai_training_v3.csv (520.809 dòng; 26 cột), product_features.csv và stock_dec2022.csv (12.684 dòng). Có CSV tháng/giá/kênh bán và product master. Đây là dữ liệu/feature nghiên cứu, không tự đồng nghĩa mô hình đã lưu hoặc bảng vận hành hiện hành.

## 4. Bảng đối chiếu năm chức năng AI

| Chức năng | Nguồn mã và bằng chứng thực nghiệm | Mô hình/artifact thực sự xác minh được | Trạng thái ứng dụng mới | Tái sử dụng và phần phải tích hợp |
|---|---|---|---|---|
| AI-1: dự báo số lượng từng SKU theo tháng | N cell 350, 366–367: LightGBM general + specialist, 30 features, phối hợp 25%/75%; WAPE 63,9534% trên 04–07/2023, tương đương 36,0466% theo 100−WAPE | Có mã fit/predict, logic chọn specialist và output. Không tìm thấy file weights Hybrid tương ứng trong thư mục/ZIP. D có kết quả SES/MA2 đã lưu, không phải Hybrid 30 | /forecast nhập products/modelComparisons/segments từ mockData.js; tiêu đề SES, WAPE cố định 72,33%, 10 dòng minh họa; chưa gọi AI API | Giữ thuật toán/features và output Hybrid; cần bàn giao weights đúng phiên bản hoặc bảng dự báo chi tiết đã xuất, manifest và inference adapter. Có thể hiển thị run SES/MA2 từ D trước với nhãn đúng, không gán chỉ số Hybrid |
| AI-2: tổng nhu cầu | N cell 328–329: tổng từ final_pred và hiệu chỉnh tỷ lệ actual/prediction tháng trước, clip 0,8–2,0; WAPE 4,4731%, quy đổi 95,5269% trên 04–07/2023 | Có mã và bảng output theo tháng; chưa tìm thấy artifact cục bộ của bảng đầu vào full_eval/final_pred và manifest phiên bản. Không cần mô hình ML riêng cho bước hiệu chỉnh | Chưa có route /forecast/total hoặc API tương ứng; trang /forecast chỉ ghi tổng SES cố định 26.029,41 | Tái sử dụng công thức hiệu chỉnh, điều kiện chỉ dùng lịch sử đã biết và output. Cần chốt nguồn final_pred, khóa thời gian, tham số hiệu chỉnh và bảng kết quả tổng; không lấy tổng Hybrid 30 rồi tự gán 95,53% |
| AI-3: gợi ý bổ sung | N cell 409: ceil(pred) + ceil(0,2×pred) − stock, chặn dưới 0; kiểm thử 12.013 SKU tháng 01/2023, stock cuối 12/2022. Output đạt 92,31% SKU, 87,09% số lượng; đề xuất 5.545 đơn vị | Là thuật toán chính sách, không cần file model riêng. Có mã và output kiểm thử; file evaluation_replenishment_stockout_jan2023.csv được lệnh xuất ở Colab, chưa thấy bản cục bộ. D có bảng simulation/recommendation thuộc các phiên bản khác | /replenishment đọc mảng cố định 10 dòng; KPI/chính sách 08/2023 ghi cứng; tồn kho SIMULATED; chưa gọi API | Giữ chính xác công thức và rounding phiên bản được chọn; cần forecast đúng run và tồn đúng snapshot. Chưa có tồn phải trả thiếu dữ liệu, không coi là 0. Chưa biến gợi ý thành đơn nhập thật |
| AI-4: cảnh báo thiếu hàng | N cell 414–416: LightGBM meta-classifier, 7 features, threshold 0,3299; output Precision 65,53%, Recall 72,18%, F1 68,69% | N cell 436 có joblib.dump stockout_v1_best.joblib và output báo đã lưu; cell 455 về sau báo không tìm thấy file ở cả /content và Drive. Không thấy file trong phạm vi local/ZIP. Không thể kết luận artifact còn sẵn để load | Chưa có route /alerts, API hoặc inference cảnh báo mô hình; nhãn thiếu hàng trong các bảng mẫu không phải output classifier | Tái sử dụng feature transform, threshold và weights gốc nếu bàn giao được. Thiếu weights thì hiển thị kết quả nghiên cứu hoặc trạng thái chưa sẵn sàng; không thay bằng ngưỡng thủ công rồi giữ nhãn F1 68,69% |
| AI-5: nhiều tháng | N cell 401: tổng tháng cùng kỳ năm trước × xu hướng 3 tháng/3 tháng trước đó, clip trend 0,85–1,15; h=1/2/3 đạt 76,02% / 77,66% / 72,37% theo 100−WAPE | Mã thuật toán không cần weights ML riêng; output 18 phép kiểm thử, file multi_month_backtest.csv chỉ thấy trong lệnh xuất Colab. N cell 399–400 còn có pipeline đệ quy SKU khác, phụ thuộc general_final/specialist_final 17 features và trạng thái runtime | Chưa có route /forecast/multi hay API; không có forecast nhiều tháng thật trong UI mới | Ưu tiên tích hợp đúng thuật toán tổng ở cell 401 và dữ liệu đã quan sát tại origin. Tách biệt mô hình SKU đệ quy; không gán chỉ số 72,37–77,66% cho pipeline đệ quy |

Tất cả năm chức năng đều có mã nghiên cứu và output lưu sẵn; không chức năng nào trong nhóm này chỉ có một con số mô tả mà không có mã tương ứng trong notebook. Tuy nhiên mức “có thể nạp và phục vụ inference ngay” chưa được xác nhận do thiếu artifact/đóng gói/phụ thuộc runtime.

## 5. Ngữ nghĩa của các chỉ số cần giữ nguyên

1. “Độ chính xác quy đổi” 100−WAPE là cách trình bày sai số dự báo, không phải tỷ lệ dự đoán đúng kiểu classification. AI-1 dự báo quantity/sản lượng, không mặc định doanh thu tiền tệ.
2. 95,53% của AI-2 thuộc tổng đã hiệu chỉnh ở cell 329. Cell 392 cộng trực tiếp Hybrid 30 lại cho quy đổi 67,2535%; hai kết quả khác pipeline, không thay thế nhau.
3. 92,31% và 87,09% của AI-3 là tỷ lệ đáp ứng trong kịch bản lịch sử tháng 01/2023, không phải độ chính xác classifier hay cam kết mức phục vụ cửa hàng hiện tại.
4. F1 68,69% thuộc classifier cell 416. Quy tắc so stock với dự báo ở cell 409 chỉ có F1 58,23%; không nhầm hai phương pháp. Nhãn is_stockout_proxy dựa vào doanh số tháng vượt tồn đầu kỳ trong kịch bản không nhập thêm; chưa phải nhãn hết hàng quan sát trực tiếp trong vận hành. Cell 415 dùng chia stratified ngẫu nhiên theo các dòng SKU của kịch bản này, không phải kiểm thử thời gian trên nhiều tháng tương lai.
5. AI-5 có 7/6/5 phép đánh giá ứng với horizon 1/2/3. Output này thuộc tổng seasonal+trend, không chứng minh độ chính xác dự báo riêng từng SKU trong 3 tháng. Cell 399 còn ghi tổng SKU 08/2023 đệ quy 19.889,24 khác bản tổng đã lưu 24.395,30; cần giữ run/version riêng.
6. Không cập nhật hoặc chọn lại mô hình chỉ vì notebook có thí nghiệm về sau tốt/xấu hơn; giữ nguyên các mốc người dùng đã xác nhận và ghi phiên bản/kỳ đánh giá rõ ràng.

## 6. Artifact và dữ liệu đã tìm thấy

### File mô hình

Đã quét tên file trong hai thư mục nghiên cứu, phần còn lại của ChuoiCungUng (bỏ .venv/node_modules/cache), ứng dụng mới và ZIP. Không tìm thấy .joblib/.pkl/.pickle/.onnx/.h5/.keras/.pt/.pth trong phạm vi này. Hai ZIP lồng chứa SQL và tài liệu/Excel, không có model. Không kiểm tra Google Drive hoặc các thư mục khác ngoài phạm vi nêu trên; không khẳng định mô hình chưa từng được lưu hoặc không tồn tại ở nơi khác.

N cell 27 có xuất LightGBM_V3_Best_Model.joblib và output báo đã lưu; model đó có Test WAPE 86,4193%, không phải Hybrid 30 đạt 63,9534%. Không thể lấy file này nếu được bổ sung rồi coi mặc định là đúng model cuối.

N cell 436 lưu dict model/features/threshold của cảnh báo; cell 455 ghi thiếu model sau khôi phục runtime. Cần người sở hữu bàn giao bản file còn giữ, phiên bản thư viện và dữ liệu/category encoder liên quan. Không tự chạy lại cell 436 vì nó có fit, không chỉ serialize.

### Kết quả trong SQL dump (không phải xác nhận live DB)

| Bằng chứng trong D | Kết quả đọc được | Ý nghĩa tích hợp |
|---|---|---|
| retail_management.ai_forecast_runs | Run 1 ExponentialSmoothing / SES_0.5_V1, test_wape 72,3265; run 2 MovingAverage / MA2_80_10_10_V1, test_wape 70,4830; cùng forecast 08/2023 | Có run nghiên cứu thật có thể đọc lại, nhưng không phải Hybrid LightGBM mới |
| ai_forecast_sku_results | 27.411 dòng/run; tổng run 1 = 26.029,408 và run 2 = 25.996; tổng 54.822 dòng trong dump | Số 26.029,41 UI có đối chứng offline thật, nhưng UI hiện không truy vấn bảng này |
| ai_replenishment_simulation | 54.002 dòng trong dump; data_source mặc định SIMULATED | Kết quả mô phỏng có lưu; giữ nhãn và run |
| branch_inventory | 28.235 dòng trong dump, đều có nhãn SIMULATED | Không dùng làm tồn thực hiện tại |
| forecast_results | Các dòng MovingAverage và SKUAllocation trong dump; có schema cấp GROUP/SKU và data_source | Tên bảng không bảo đảm là đúng bản Hybrid; cần lọc model/method/kỳ |
| retail_datawarehouse.retail_ai_monthly_dataset | 520.809 dòng trong dump, khóa product_id/sale_month; target quan sát bán hàng | Phù hợp để đối chiếu đầu vào; vẫn phải khớp logic làm sạch/feature notebook |
| Các bảng/mart DW | monthly_sales_ai, monthly_sales_ai_by_channel, monthly_sales_ai_extended, monthly_price_ai, dimension, replenishment_recommendations | Nguồn dữ liệu/feature/kết quả có thể tái sử dụng bằng SELECT-only, không migration vào đây |

Bản dump khác một số số lượng trong Phase 0; báo cáo này không lấy ước lượng Phase 0 làm số đếm live. Cần kiểm tra chỉ đọc trên DB thật ở giai đoạn tích hợp, bằng tài khoản nghiên cứu chỉ có SELECT.

## 7. Kiểm tra ứng dụng mới theo nguồn dữ liệu

| Trang/thành phần | Nguồn hiện tại trong mã | API thật? | Phần còn thiếu |
|---|---|---|---|
| Products.jsx | import products,kpis từ data/mockData.js; 10 productSeeds có tên/giá/nhóm minh họa; tìm kiếm/phân trang ở client | Không | Repository/API dữ liệu thật, mapping danh mục và tenant; tách giá/stock mẫu khỏi lịch sử |
| ProductEntry.jsx | useState saved/csvRows; submit chỉ setSaved; CSV tự parse, preview tối đa 100 dòng | Không; không lưu MySQL | CRUD và import dry-run/commit; tồn đầu kỳ là nghiệp vụ riêng |
| Inventory.jsx | import inventory/branches từ mockData.js; KPI cố định; inventory tạo từ products.map với các mảng số lượng | Không | Snapshot thật có ngày/nguồn và mapping chi nhánh; không biến simulation thành actual |
| Forecast.jsx | products/modelComparisons/segments từ mockData.js; SES_0.5_V1 và Run #1 ghi cứng | Không | Run selector, kết quả/metrics có provenance; API và service đọc output/inference |
| Replenishment.jsx | mảng replenishment cố định; KPI, kỳ và công thức ghi cứng | Không | Kết nối đúng forecast + snapshot/policy; xử lý thiếu tồn và thời điểm |
| /forecast/total, /forecast/multi, /alerts | Không có routes/pages chuyên biệt trong App.jsx hiện tại | Không | Tạo UI và API khi được duyệt Sprint 2 |
| Dashboard.jsx | getJSON /dashboard/overview: tên organization và số branches trong retail_app | Có | Dashboard vận hành hiện chỉ có dữ liệu tài khoản/cửa hàng, chưa có KPI kinh doanh/AI thật |
| Branches.jsx | getJSON /branches của retail_app | Có | Chi nhánh vận hành khác mã chi nhánh nghiên cứu, cần bảng mapping nếu liên kết |
| ResearchDashboard.jsx / ResearchBranches.jsx | Bản UI nghiên cứu giữ nguyên nguồn mẫu/cố định | Không | Giữ nhãn tham khảo khi chưa nối kết quả |
| services/api.js | Có hàm products, forecast, replenishment trỏ đường dẫn API dự kiến | Chỉ là khai báo adapter | Các trang trên chưa gọi các hàm đó; backend chưa triển khai các endpoint tương ứng |

VITE_DATA_MODE=api tự nó không chuyển các trang trên sang dữ liệu thật: pages import mockData trực tiếp và không dùng isMock để lựa chọn nguồn. Backend hiện chỉ có auth, dashboard tài khoản, branches và users/RBAC; chưa có products/inventory/forecast/replenishment hoặc FastAPI proxy.

Các nhãn “bản ghi đã lưu tại ai_forecast_runs”, “tổng đã lưu thật trong MySQL” trong Forecast.jsx là câu chữ cố định. Có thể có số khớp snapshot thật, nhưng không chứng minh trang đang đọc DB trực tiếp. Phải phân biệt **số liệu lịch sử được chép cố định**, **dòng minh họa UI**, **kết quả mô phỏng nghiên cứu** và **API trả dữ liệu thật**.

## 8. Kế hoạch Sprint 2 đề xuất — chưa thực hiện

Mục tiêu: kết nối dữ liệu và kết quả đã nghiên cứu, giữ nguyên thuật toán, không huấn luyện lại; cho phép nghiệm thu theo từng phần. Không cam kết cả năm chức năng đều suy luận mới được khi chưa có artifact tương ứng.

### Bước 1 — Chốt gói bàn giao và nguồn chuẩn

- Lập manifest cho từng phiên bản: dataset_id, source_file/hash, model_version, code/notebook_cell, feature_order, category mapping, thư viện, training_end, forecast_origin/horizon, evaluation_period và loại metric.
- Bàn giao weights Hybrid general/specialist đúng phiên bản, stockout_v1_best.joblib đúng ngưỡng 0,3299 nếu còn; CSV/parquet dự báo Hybrid chi tiết, full_eval/final_pred của tổng đã hiệu chỉnh, bảng evaluation_replenishment_stockout_jan2023 và multi_month_backtest.
- Không xem runtime globals/Drive path trong notebook là artifact đã có trên máy. Không chạy Run all để cố tạo lại model. Nếu thiếu weights, thống nhất chế độ đọc kết quả nghiên cứu đã xác minh; inference chức năng đó có trạng thái chưa sẵn sàng.
- Kiểm tra đọc DB live bằng credential SELECT-only do người vận hành cung cấp; không tạo account/GRANT hoặc đổi cấu trúc trên database nghiên cứu trong phạm vi này.

Tiêu chí: mỗi metric có phương pháp/kỳ/nguồn minh chứng và mỗi kết quả hiển thị truy ngược được run; danh sách artifact thiếu được ghi rõ.

### Bước 2 — Tách quyền dữ liệu nghiên cứu và dữ liệu ứng dụng

- Giữ nguyên guard MYSQL_DATABASE=retail_app và pool ghi ứng dụng. Thiết kế kết nối nghiên cứu riêng bằng account SELECT-only, query cho phép tường minh, không cho client truyền SQL/database name.
- Các bảng mới nếu cần chỉ migration trong retail_app sau duyệt: research_datasets, organization_dataset_access, product_source_mappings, branch_source_mappings, ai_runs/model_artifact_manifest và các bảng kết quả gắn organization_id/run_id. Đây là thiết kế đề xuất, chưa tạo.
- Dataset nghiên cứu chưa có organization_id: gắn quyền đọc cho organization được chỉ định; tổ chức mới đăng ký không mặc nhiên thấy toàn bộ sản phẩm/dự báo nghiên cứu. Mapping phải tường minh, khóa theo organization và dataset. Chi nhánh 1100 không đồng nghĩa branch id 1 trong retail_app.
- Giữ bản chụp nghiên cứu và dữ liệu vận hành riêng. Chọn dữ liệu cho UI theo dataset/run/source/as_of; không trộn Excel 2011–2017 với NCKH 2022–2023.

Tiêu chí: truy cập chéo organization/dataset bị chặn; dữ liệu nghiên cứu không có đường ghi; các chức năng hiện có của Sprint 1 vẫn chạy.

### Bước 3 — Nối sản phẩm, tồn và kết quả lưu sẵn trước

- API danh mục phân trang/tìm kiếm theo mapping, đọc product master thật. Nếu triển khai CRUD vận hành theo Phase 0, ghi retail_app và phân biệt rõ bản sao vận hành với master nghiên cứu.
- API snapshot tồn hiển thị ngày, branch, data_source và thiếu dữ liệu; snapshot 2022/2023 không được gọi là tồn hiện tại 2026. Giữ simulation như một kịch bản riêng.
- Đọc ai_forecast_runs/results và recommendation đã xác minh. Cho chọn đúng SES/MA2/historical run; không đổi nhãn thành Hybrid hoặc gán các metric notebook cho các run đó.
- Thay import mockData tại từng trang bằng API; UI có loading/error/empty/unavailable. Không fallback âm thầm sang mock khi API lỗi. Giá trị thiếu hiển thị không có dữ liệu, không tự điền 0.

Endpoint đề xuất dưới /api/v1 (chưa tồn tại): /products, /inventory/snapshots, /research/datasets, /ai/runs, /ai/runs/:id/sku-forecasts, /ai/runs/:id/total-demand, /ai/runs/:id/replenishment, /ai/runs/:id/stockout-alerts, /ai/runs/:id/multi-horizon. Chi tiết API sẽ chốt theo manifest, không dùng đường dẫn adapter cũ làm bằng chứng backend đã có.

Tiêu chí: bảng hiển thị khớp một run nguồn cụ thể, tổng/số dòng/phân trang đối chiếu được; giữ nhãn nguồn và thời kỳ; không dùng số mẫu thay output thật.

### Bước 4 — FastAPI chỉ phục vụ inference/thuật toán đã chốt

- Đóng gói bản sao hàm cần dùng trong ứng dụng mới, giữ attribution đường dẫn/cell và hash; không sửa notebook hoặc module nguồn.
- AI-1: load weights đúng version; giữ feature order/category và specialist mask/blend; endpoint thiếu artifact trả unavailable, không fit tự động khi khởi động.
- AI-2: đóng gói bước hiệu chỉnh tháng trước trên đúng final_pred, chặn dùng actual tháng đang dự báo. Gắn version riêng với Hybrid 30.
- AI-3: giữ ceil(pred)+ceil(0,2×pred) của phiên bản cell 409; không đổi thành ceil(1,2×pred) mà coi tương đương. Thiếu stock thì không đề xuất lượng; không tự đặt hàng.
- AI-4: load đúng model, 7 features, threshold 0,3299; ghi nhãn proxy và phạm vi đánh giá. Nếu thiếu weights, chỉ xem kết quả đã bàn giao, không tạo score giả.
- AI-5: ưu tiên seasonal+trend tổng của cell 401 vì không cần weights riêng; pipeline SKU đệ quy là phiên bản khác và phải qua gate artifact riêng.
- Express xác thực/RBAC/dataset scope trước gọi FastAPI nội bộ. Service không tự truy vấn ghi database nghiên cứu; nếu lưu kết quả mới chỉ qua vùng retail_app được cấp quyền. Không có endpoint train trong Sprint 2 đề xuất.

Tiêu chí: request inference không gọi fit; artifact thiếu/lệch feature báo lỗi rõ; output mới không được trình bày là kết quả nghiên cứu cũ. Không dùng dữ liệu 2023 để giả định có dự báo vận hành đã xác minh cho 2026.

### Bước 5 — Đối chiếu và nghiệm thu

- So khớp output đọc lại bằng run_id, SKU, tháng, số dòng và tổng. Ví dụ run SES 1 trong dump có 27.411 dòng và tổng 26.029,408; dùng làm fixture lịch sử đúng run, không dùng để đánh giá Hybrid.
- Với artifact chính thức, kiểm tra inference-only trên bộ input/reference đã bàn giao bằng tolerance đã chốt; không tái huấn luyện để cố khớp metric.
- Chỉ tính lại metric khi bộ ground truth và quy tắc/kỳ khớp; giữ nguyên kết quả nghiên cứu gốc, ghi riêng kết quả kiểm chứng.
- Kiểm thử tenant/branch/dataset, role, API không có quyền, dữ liệu thiếu/cũ, artifact thiếu, lỗi service và UI không fallback mock; test frontend kết nối thật.
- Nếu artifact chưa đủ, nghiệm thu phần đọc lịch sử + sản phẩm/tồn trước; lập rõ các AI chỉ xem kết quả và các AI đã inference. Không tuyên bố hoàn tất cả năm chỉ vì UI đã mở được.

## 9. Nội dung cần xem xét trước khi triển khai

1. Chọn tích hợp kết quả lưu sẵn làm mốc đầu tiên, đồng thời nhận artifact còn lưu ở Drive/máy khác cho Hybrid và stockout. Không yêu cầu huấn luyện lại để lấp chỗ thiếu.
2. Chốt organization nào được quyền dataset nghiên cứu; chốt mapping SKU/branch thay vì tự sao chép quyền cho mọi cửa hàng.
3. Xác nhận phạm vi Sprint 2: sản phẩm/tồn + đọc kết quả AI trước, inference theo gate artifact; giữ các bước CRUD/transaction của sprint sau đúng kế hoạch tổng thể.

Chưa thực hiện bất kỳ thay đổi frontend/backend, migration, inference hoặc training nào thuộc Sprint 2. Mã nguồn, mô hình và dữ liệu nghiên cứu cũ được giữ nguyên.

## Cập nhật triển khai sau khảo sát

Ứng dụng mới đã được lập trình tiếp theo yêu cầu mở rộng sang vận hành bán lẻ. Bản khảo sát ở trên là ảnh chụp trạng thái trước Sprint 2, không phải mô tả hiện tại của các route Products/Inventory/AI. Xem `docs/SPRINT2_REPORT.md`, `docs/API.md`, `docs/DEPLOYMENT.md` và `docs/MODEL_HANDOFF.md` cho mã/API thực tế, kiểm thử và các điều kiện còn thiếu. Nguồn nghiên cứu và các kết quả cũ giữ nguyên.
