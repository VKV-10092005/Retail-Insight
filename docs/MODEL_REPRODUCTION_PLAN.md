# Phương án tái tạo có kiểm soát: Hybrid 30 và Stockout V1

Ngày: 05/11/2026. Trạng thái cập nhật 05/11/2026: đã được phê duyệt đóng băng và tối đa 18 fit lịch sử; đã đóng băng, huấn luyện đang dừng tại gate RAM; chưa kích hoạt model. Không sửa nguồn nghiên cứu hoặc database nghiên cứu.

## 1. Bằng chứng và giới hạn xác minh

Nguồn chính: `C:/Users/TUF F15/Downloads/Retail_FP_Demand_Forecasting (4).ipynb`, SHA-256 `43e7489556309d80adeee53be565ceec0df7018fffcbe3c76ef066799bf75c8c`. Cell trong tài liệu đánh số từ 0. Notebook có output lưu sẵn, execution_count null; đây không phải xác nhận đã chạy notebook từ runtime sạch.

[Audit JSON](model-reproduction-evidence/audit.json) ghi hash, schema, số dòng, metadata model được cung cấp và kết quả CSV. [Mã cell trích nguyên văn](model-reproduction-evidence/notebook_cells.json) lưu mã cùng hash từng cell. [Script audit](../scripts/audit_model_reproduction.py) chỉ kiểm tra; khi đọc joblib chủ sở hữu cung cấp, chặn fit của hai lớp LightGBM. Không gọi predict hoặc đưa artifact vào thư mục model đang phục vụ.

File LightGBM_V3_Best_Model.joblib SHA-256 `43536c2863bea0e00f7f22fb8f0c2c3542fd40bf3ff599aac44f6421fadde2f8`: dict gồm model/features/categorical_features/target/validation_results/test_results; LGBMRegressor 20 feature, objective regression (L2), 500 cây. CSV LightGBM_V3_Test_Results.csv khớp metadata: LGBM_2 Test WAPE 86,4192519364%, MAE 0,7892313087, RMSE 2,0486360881. Đây không phải Hybrid 30 WAPE 63,9534% hoặc classifier Stockout V1. Không chuyển đổi feature hoặc dùng file này thay thế hai model đó.

V3 dùng train 356.343 dòng (01/2022–01/2023), validation 82.233 dòng (02–04/2023), test 82.233 dòng (05–07/2023). Params được ghi đầy đủ trong audit; các giá trị chính: regression, n_estimators=500, learning_rate=.03, num_leaves=31, min_child_samples=100, colsample_bytree=.8, subsample=.8, subsample_freq=1, random_state=42. Không suy ra phiên bản thư viện huấn luyện từ môi trường kiểm tra hoặc chữ version=v4 trong định dạng booster.

## 2. Dữ liệu cố định và lineage

Đọc dưới C:/DaiHoc/NCKH/ChuoiCungUng:

| File | Phạm vi | SHA-256 |
|---|---|---|
| retail_ai_training_v3.csv | 520.809 dòng; 27.411 SKU × 19 tháng 01/2022–07/2023; 26 cột; khóa SKU/tháng không trùng | 87f9f97bfb3179c2c47b8adda67e22f295ddd89a956681debb1456bcce179773 |
| product_features.csv | 94.867 SKU duy nhất, 9 cột | 0c998da51c297339c2afc1fe379a61e36b710b398a6a517fbe67bce2228119b4 |
| stock_dec2022.csv | 12.684 SKU duy nhất; product_id, stock_units | e5dabed14b28906cdbd13609e86ec1ece8e0dc182f5ef12f838fa51a9f8b8d8b |

Đối chiếu tuần tự toàn bộ khóa và target clipped-net của CSV với data/research/fp_sku_monthly_history.parquet: 0 lệch khóa, 0 lệch target. Việc đọc bảng lớn một lần bằng pandas gặp giới hạn RAM; kiểm tra sau đó dùng streaming. Chưa chứng minh toàn bộ feature giá có thể dựng lại từ raw SQL bằng công thức hiện tại.

Target: observed_net_quantity chuyển numeric, fillna(0), clip(lower=0). Không thay bằng doanh thu hoặc gross quantity.

Cells 129/176/191: sắp product_id/sale_month, reset index; clean_lag_1/2/3/6 là shift theo SKU; clean_mean_3/6 là rolling mean(min_periods=1) của target đã shift(1). zero_ratio_3/6 tính trên lịch sử đã shift, giữ missing trước rolling, không biến missing thành quan sát zero. history_months=cumcount; clean_month/quarter từ lịch. Cell 225 merge product_features many_to_one giữ thứ tự. Cell 255 bổ sung mùa vụ nhưng các cột Tết/trường học không được chọn trong bộ 30.

Cells 342–343 merge 8 feature retail theo (SKU, tháng), validate one_to_one, và 5 feature sản phẩm many_to_one; kiểm tra suffix/khóa trước dùng. Các feature group/brand/price nhập từ CSV đóng băng. Notebook chất lượng dữ liệu có cửa sổ theo branch_id/product_id khác grain SKU toàn cục: không mặc định đó chính là exporter của CSV này.

## 3. Hybrid 30: recipe lịch sử

Thứ tự 30 feature:

```text
group_id, brand_id, gender, size, color_group, listing_price,
clean_lag_1, clean_lag_2, clean_lag_3, clean_lag_6, clean_mean_3, clean_mean_6,
zero_ratio_3, zero_ratio_6, history_months, clean_month, clean_quarter,
group_lag_1, brand_lag_1, price_last_known, price_mean_prev_3m,
price_mean_prev_6m, months_since_last_price, has_historical_price,
last_price_to_listing_ratio, age_group, activity_group, lifestyle_group,
launch_season, launch_year
```

9 categorical: group_id, brand_id, gender, size, color_group, age_group, activity_group, lifestyle_group, launch_season. launch_year numeric. Cell 343 astype(category) trên toàn frame trước chia thời gian; phải lưu vocabulary/order này để tái lập protocol cũ. Không âm thầm thay bằng vocabulary chỉ học từ train rồi gọi là cùng thí nghiệm.

Cell 350 thực hiện 5 origin tháng 03/2023 đến 07/2023: train mọi dòng trước tháng origin, đánh giá đúng tháng origin. General dùng toàn bộ train. Specialist chỉ dùng các dòng thỏa mask: sum(clean_lag_1..3.fillna(0)) > 0 AND zero_ratio_6 < .5.

| Tham số | General | Specialist |
|---|---|---|
| objective | regression_l1 | regression_l1 |
| n_estimators | 296 | 450 |
| num_leaves | 31 | 63 |
| learning_rate | .05 | .05 |
| min_child_samples | 50 | 50 |
| colsample_bytree | .8 | .8 |
| reg_lambda | 1 | 1 |
| random_state / n_jobs / verbosity | 42 / -1 / -1 | 42 / -1 / -1 |

Không thấy cấu hình early stopping ở recipe này. Cần lưu cả get_params đầy đủ của phiên bản được chọn, không chỉ các tham số truyền tường minh.

Clip prediction từng model >=0. Specialist prediction khởi tạo bằng general, chỉ ghi đè trên mask. Final=.25*general+.75*specialist; ngoài mask kết quả bằng general.

Cell 350 thử alpha=0/.25/.5/.75/1 trên 5 tháng; alpha=.75 có WAPE 64,1300%. Cells 366–367 kiểm tra khớp độ dài/tháng/target trước khôi phục khóa, báo riêng 04–07/2023: 109.644 dòng, tổng actual 98.445, absolute error khoảng 62.958,90, WAPE 63,9534%, 100−WAPE=36,0466%. Không lẫn hai cửa sổ đánh giá. Việc chọn alpha dùng cả các tháng báo cáo là hạn chế protocol; không gọi đây là holdout độc lập chưa dùng chọn tham số.

Mỗi origin có cặp weights riêng. Globals sau vòng lặp chỉ còn model tháng 07 train đến 06/2023; không phải model phục vụ fit hết 07/2023. Phải lưu đủ 5 cặp nếu tái tạo backtest. Fit phục vụ đến 07/2023 là bước khác, phiên bản mới, không tự gán metric backtest cho nó.

## 4. Stockout V1: upstream và quy trình đánh giá

### 4.1 Dự báo đầu vào tháng 01/2023

Cells 191–192 dùng 17 feature đầu trong danh sách Hybrid trên; categorical chỉ group_id, brand_id, gender, color_group, còn size numeric. Train 01–12/2022, dự báo 01/2023. Cả general và specialist đều regression_l1, 296 cây, 31 leaves, lr=.05, min_child=50, colsample=.8, lambda=1, seed42, n_jobs=-1, verbosity=-1. Specialist train trên mask lịch sử như trên.

Dùng hard switch: trên mask chọn 100% specialist, ngoài mask chọn general. Đây không phải blend 25/75 của Hybrid 30. File xuất hybrid_forecast_jan2023.csv gồm product_id, sale_month, target, general_prediction, hybrid_prediction; chưa xác minh được bản gốc cục bộ. Nếu thiếu, muốn tái tạo Stockout phải tái tạo cặp 17-feature này trước sau phê duyệt.

### 4.2 Bảy feature và nhãn

Cells 195/196 merge tồn cuối 12/2022 với forecast 01/2023 one_to_one, strip SKU, giữ thứ tự left stock. Cell 414 bỏ dòng thiếu stock/target/hybrid_prediction: 12.013 SKU, 1.329 positive proxy. 671 SKU stock không thuộc tập FP không được tự thêm bằng prediction giả.

Lịch sử 07–12/2022 pivot sum, đủ 6 tháng bằng reindex/fill0; standard deviation ddof=1; active months=count(quantity>0); historical_mean_3=mean 10–12/2022. Merge và fill0 ba feature lịch sử theo protocol gốc. Đặt stock=clip(stock_units,0), pred=clip(hybrid_prediction,0). Thứ tự input classifier:

```text
risk_score_2 = pred / (stock + 1)
risk_score_3 = pred / max(stock, 1)
sales_volatility_6
active_months_6
inventory_days_cover = min(365, stock/(historical_mean_3+1e-5)*30)
historical_mean_3
stock_units
```

Cột stock_units cuối giữ giá trị meta gốc; phải kiểm tra dữ liệu âm thay vì ngầm sửa toàn cột. Nhãn target.clip(0)>stock là proxy thiếu hàng trong kịch bản không nhập thêm, không phải hết hàng quan sát thực tế.

### 4.3 Split, OOF và model cuối

Cell 415: train_test_split(test_size=.4, random_state=42, stratify=y), sau đó chia temp 50/50 cùng seed và stratify. Train/val/test=7.207/2.403/2.403. Cell 416 dev=pd.concat([X_train,X_val]) đúng thứ tự cũ, 9.610 dòng. Lưu membership và thứ tự, không chỉ seed.

StratifiedKFold(5,shuffle=True,random_state=42). Bốn cấu hình (leaves,max_depth,min_child_samples,reg_lambda): (7,3,60,5), (15,5,40,3), (31,6,60,5), (15,4,100,10). Config 4 thắng. Common: objective=binary, n_estimators=200, learning_rate=.03, random_state=42, n_jobs=-1, verbosity=-1. Không early stopping ở cell 416. Model 250 cây/early_stopping25 ở cell 415 là biến thể khác.

Dùng OOF precision_recall_curve, chọn argmax F1 trên các threshold hữu hạn tương ứng, bỏ điểm cuối không có threshold. OOF F1 khoảng 64,212%; threshold chỉ in làm tròn 0,3299. Fit classifier thắng trên toàn dev, đánh giá fixed test: Precision 65,53%, Recall 72,18%, F1 68,69%, ROC-AUC 93,44%, PR-AUC 69,46%. Lưu raw threshold đầy đủ; báo riêng kết quả tại literal .3299 đang dùng trong hợp đồng ứng dụng, không coi hai giá trị chắc chắn đồng nhất.

Cell 436 gọi fit(X_dev_v1,y_dev_v3), trộn tên biến các phiên bản, rồi dump; không bảo đảm chính là best_meta_model của cell 416. Không chạy cell này để 'chỉ lưu model'. Cell 455 không tìm thấy artifact. Cell 459 khôi phục theo index/thứ tự khác cho threshold .3413, F1 65,23% dù tham số gần như giữ nguyên: bằng chứng seed và hyperparameters chưa đủ tái lập 68,69%.

Adapter Stockout vận hành hiện có chưa chứng minh tương đương upstream 17-feature tháng 01/2023. Phải khóa bằng upstream_pipeline_id/feature signature trước kích hoạt. Không nạp classifier rồi mặc định đầu vào Hybrid 30 tương đương.

## 5. Phạm vi đề xuất xin phê duyệt sau khảo sát

Chưa thực hiện bất kỳ fit nào. Đề xuất ba gate tách biệt:

1. Đóng băng input/hash, source cells, category mapping, ordered keys, split/fold membership; kiểm tra RAM và môi trường, không fit. Chọn phiên bản thư viện có ghi nhận; nếu không có bản gốc phải ghi môi trường tái tạo mới, không tuyên bố byte-identical.
2. Tái tạo cố định lịch sử, không tìm tham số mới: tối đa 18 lần fit gồm cặp Jan17 (2, chỉ khi thiếu CSV gốc), 5 cặp Hybrid30 (10), Stockout config4 OOF5 + finaldev (6). Không Optuna, không chọn alpha lại, không đổi feature/split để cố khớp metric. Nếu muốn tái chạy tìm kiếm 4 config, cần duyệt riêng: 21 classifier fits thay vì 6.
3. Fit cặp Hybrid30 phục vụ hết 07/2023 (2 fit nữa) và kích hoạt inference là phê duyệt riêng; không thuộc 18 fit lịch sử. Không tự fit dữ liệu cửa hàng mới, không triển khai training endpoint.

Chạy duy nhất trong thư mục mới artifacts/reproductions/<run-id> của ứng dụng, không ghi đè nguồn, không đặt ngay ai-service/models, không ghi database nghiên cứu hoặc cấp dataset. Không có bước autoactivate. Tên artifact ghi reproduced và run-id.

## 6. Gói bàn giao bắt buộc và kiểm chứng

- Mỗi cặp origin lưu general.joblib, specialist.joblib và native booster .txt; classifier lưu joblib + booster; SHA-256 mọi file. Lưu đối tượng pipeline/transform tách bạch, không dựa globals runtime.
- manifest.json: schema_version, dataset/source hashes, code/cell hashes, model/upstream_pipeline_id, đầy đủ get_params và booster params, seed/thread/OS/CPU, Python/LightGBM/pandas/numpy/scikit-learn/joblib versions, training_end/origin/horizon, target/missing policy, feature order/types, categories và ordered levels, blend/mask/threshold đầy đủ, metric definition/period, limitations.
- ordered_keys.parquet và splits.parquet lưu SKU/tháng, train/val/dev/test, vị trí gốc, OOF fold và origin. Không chỉ lưu random_state hoặc index không có khóa nguồn.
- Reference Hybrid: input đã transform và khóa; actual, general/specialist predictions, mask, blend, mỗi origin và tổng hợp 03–07/04–07 riêng. Reference Stockout: 7 input features, proxy label, OOF/test probabilities, quyết định tại raw threshold và .3299, split/fold IDs. Lưu cả bảng lỗi và confusion matrix.
- Sau serialize/load chỉ inference đối chiếu trước/sau, đề xuất atol=1e-8, rtol=1e-9, khóa/schema/category phải khớp tuyệt đối; tolerance phải chốt trước chạy. So khớp metrics lịch sử theo độ chính xác output gốc có lưu, không suy ngược weights từ con số làm tròn.
- Nếu drift: giữ nguyên kết quả nghiên cứu, ghi run tái tạo riêng và nguyên nhân nghi ngờ; dừng kích hoạt, không đổi split/threshold để ép khớp. Review output và manifest rồi mới xin kích hoạt.

Không thể bảo đảm tái tạo chính xác weights hoặc 68,69% khi chưa có môi trường gốc, split membership đầy đủ và upstream forecast gốc. Quy trình này tạo bản tái lập có nguồn gốc kiểm chứng, không khôi phục nguyên bản bằng suy đoán. Các chỉ số nghiên cứu lịch sử luôn tách khỏi hiệu quả trên cửa hàng mới.


## Cập nhật thực hiện sau phê duyệt

Xem [báo cáo đóng băng và gate huấn luyện](HISTORICAL_REPRODUCTION_REPORT.md). Run historical-freeze-20261104T185832Z đã tạo snapshot/metadata/splits và verification; 0/18 fit, chưa có metrics tái tạo do thiếu RAM khả dụng theo preflight. Phê duyệt lịch sử vẫn giữ nguyên, không bao gồm fit phục vụ hoặc kích hoạt.
