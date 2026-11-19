from datetime import date
import math
HYBRID_FEATURES = ['group_id','brand_id','gender','size','color_group','listing_price','clean_lag_1','clean_lag_2','clean_lag_3','clean_lag_6','clean_mean_3','clean_mean_6','zero_ratio_3','zero_ratio_6','history_months','clean_month','clean_quarter','group_lag_1','brand_lag_1','price_last_known','price_mean_prev_3m','price_mean_prev_6m','months_since_last_price','has_historical_price','last_price_to_listing_ratio','age_group','activity_group','lifestyle_group','launch_season','launch_year']
STOCKOUT_FEATURES = ['risk_score_2','risk_score_3','sales_volatility_6','active_months_6','inventory_days_cover','historical_mean_3','stock_units']
CATEGORICAL = ['group_id','brand_id','gender','size','color_group','age_group','activity_group','lifestyle_group','launch_season','launch_year']
def month_add(value, count):
    d=date.fromisoformat(value+'-01' if len(value)==7 else value)
    n=d.year*12+d.month-1+count
    return date(n//12,n%12+1,1).isoformat()[:7]
def replenishment(pred, stock, min_stock=None):
    if pred is None:return {'status':'MISSING_FORECAST','recommended_quantity':None,'reason':'Chưa có dự báo hợp lệ'}
    if stock is None:return {'status':'MISSING_STOCK','recommended_quantity':None,'reason':'Chưa có bản ghi tồn kho'}
    if not math.isfinite(pred) or pred<0 or not math.isfinite(stock) or stock<0:raise ValueError('Nhu cầu và tồn kho phải không âm, hữu hạn')
    minimum=0 if min_stock is None else math.ceil(min_stock)
    target=max(minimum,math.ceil(pred)+math.ceil(.2*pred))
    order=max(0,target-stock)
    return {'status':'REPLENISH' if order else 'SUFFICIENT_STOCK','target_stock':target,'recommended_quantity':order,'reason':'Bổ sung tới ngưỡng lớn hơn giữa min_stock và dự báo + tồn an toàn' if order else 'Đủ tồn theo min_stock và chính sách tồn an toàn'}
def corrected_totals(rows):
    ordered=sorted(rows,key=lambda r:r['month']);result=[];prev=None
    if len({r['month'] for r in rows})!=len(rows):raise ValueError('Trùng tháng')
    for row in ordered:
        factor=None
        if prev and month_add(prev['month'],1)==row['month'] and prev.get('actual') is not None and prev['predicted']>0:
            factor=min(2.,max(.8,prev['actual']/prev['predicted']))
        result.append({**row,'factor':factor,'corrected':row['predicted']*factor if factor is not None else None,'status':'READY' if factor is not None else 'MISSING_PREVIOUS_CALIBRATION'})
        prev=row
    return result
def seasonal_trend(history, origin, horizons):
    months={r['month']:float(r['quantity']) for r in history if r['month']<=origin}
    if len(months)!=len([r for r in history if r['month']<=origin]):raise ValueError('Trùng tháng')
    expected=[month_add(origin,-i) for i in range(12)]
    missing=[m for m in expected if m not in months]
    if missing:return {'status':'INSUFFICIENT_HISTORY','required_months':6,'missing_months':missing,'items':[]}
    recent=sum(months[month_add(origin,-i)] for i in range(3))/3
    previous=sum(months[month_add(origin,-i)] for i in range(3,6))/3
    trend=min(1.15,max(.85,recent/previous if previous>0 else 1.))
    items=[]
    for horizon in horizons:
        target=month_add(origin,horizon);base_month=month_add(target,-12)
        seasonal=months.get(base_month)
        base=seasonal if seasonal is not None else recent
        items.append({'month':target,'horizon':horizon,'quantity':max(0,base*trend),'seasonal_month':base_month if seasonal is not None else None,'trend':trend})
    return {'status':'READY','method':'SEASONAL_TREND_TOTAL_NOTEBOOK_CELL_401','origin':origin,'items':items,'metrics':None}

def seasonal_trend_six_month(history, origin, horizons):
    """Operational trend for tenants with six recent complete months."""
    months={r['month']:float(r['quantity']) for r in history if r['month']<=origin}
    if len(months)!=len([r for r in history if r['month']<=origin]):raise ValueError('Trùng tháng')
    expected=[month_add(origin,-i) for i in range(6)]
    missing=[m for m in expected if m not in months]
    if missing:return {'status':'INSUFFICIENT_HISTORY','required_months':6,'missing_months':missing,'items':[]}
    recent=sum(months[month_add(origin,-i)] for i in range(3))/3
    previous=sum(months[month_add(origin,-i)] for i in range(3,6))/3
    trend=min(1.15,max(.85,recent/previous if previous>0 else 1.))
    return {'status':'READY','method':'SIX_MONTH_SEASONAL_TREND','origin':origin,'items':[{'month':month_add(origin,h),'horizon':h,'quantity':max(0,recent*trend),'seasonal_month':None,'trend':trend} for h in horizons],'metrics':None}

def category_seasonality(category_name, target_month):
    name=(category_name or '').strip().lower()
    month=int(target_month[5:7])
    if any(word in name for word in ('bút','vở','sách','giấy','họa cụ','văn phòng phẩm','stationery','school')):
        if month in (8,9):return 1.20
        if month in (6,7):return 1.08
        if month==1:return 1.05
        return 1.0
    if any(word in name for word in ('áo','quần','giày','mũ','balo','túi','thời trang','fashion','footwear','apparel')):
        if month in (11,12):return 1.12
        if month in (4,5,6,7,8):return 1.08
        if month==1:return .94
        return 1.0
    if any(word in name for word in ('nước','đồ uống','giải khát','beverage')) and month in (4,5,6,7,8):return 1.08
    if any(word in name for word in ('thực phẩm','bánh','kẹo','food','grocery')) and month in (1,2):return 1.06
    return 1.0

def adaptive_product_forecast(product, origin, horizons=(1,2,3)):
    daily28=max(0.0,float(product.get('daily_rate_28') or 0))
    daily84=max(0.0,float(product.get('daily_rate_84') or 0))
    peer_rate=max(0.0,float(product.get('category_daily_rate') or 0))
    raw_min=product.get('min_stock')
    minimum=max(0.0,float(raw_min)) if raw_min is not None else 0.0
    stock_floor=minimum/90.0 if minimum else 0.0
    observed=.65*daily28+.35*daily84
    if observed>0:
        daily=.9*observed+.1*stock_floor if stock_floor else observed
        basis='SKU_DAILY_SALES'
        confidence='MEDIUM'
    elif peer_rate>0:
        daily=.8*peer_rate+.2*stock_floor if stock_floor else peer_rate
        basis='CATEGORY_PEER_DAILY_SALES'
        confidence='LOW'
    elif stock_floor>0:
        daily=stock_floor
        basis='MIN_STOCK_BENCHMARK'
        confidence='LOW'
    else:
        daily=0.0
        basis='NO_SIGNAL_ZERO_FLOOR'
        confidence='LOW'
    forecasts=[]
    for horizon in horizons:
        target=month_add(origin,horizon)
        days=(date.fromisoformat(month_add(target,1)+'-01')-date.fromisoformat(target+'-01')).days
        seasonal=category_seasonality(product.get('category_name'),target)
        forecasts.append({'month':target,'horizon':horizon,'quantity':round(max(0.0,daily*days*seasonal),2),'seasonality_factor':seasonal})
    return {'forecasts':forecasts,'basis':basis,'confidence':confidence,'daily_rate':round(daily,6),'daily_rate_28':round(daily28,6),'daily_rate_84':round(daily84,6)}

def adaptive_total(products, origin, horizons=(1,2,3)):
    if not products:return {'status':'INSUFFICIENT_DATA','reason':'NO_ACTIVE_PRODUCTS','items':[],'metrics':None}
    per_product=[(product,adaptive_product_forecast(product,origin,horizons)) for product in products]
    items=[]
    for index,horizon in enumerate(horizons):
        forecasts=[values['forecasts'][index] for _,values in per_product]
        quantity=round(sum(row['quantity'] for row in forecasts),2)
        factors=[row['seasonality_factor'] for row in forecasts]
        items.append({'month':forecasts[0]['month'],'horizon':horizon,'quantity':quantity,'predicted':quantity,'corrected':quantity,'actual':None,'factor':round(sum(factors)/len(factors),3) if factors else 1.0,'method':'ADAPTIVE_FORECAST'})
    return {'status':'ADAPTIVE_FORECAST','reason':'ADAPTIVE_COLD_START','method':'ADAPTIVE_COLD_START_BENCHMARK','origin':origin,'items':items,'explanation':'Ước lượng tham khảo kết hợp tốc độ bán 28/84 ngày trong tenant, bình quân SKU cùng danh mục khi SKU chưa có bán, min_stock làm sàn chuẩn hóa 90 ngày và hệ số mùa vụ ngành hàng. Đây không phải cam kết doanh số; độ tin cậy thấp đến trung bình.','metrics':None}
def stockout_features(stock, forecast, history):
    if stock is None or forecast is None or len(history)!=6:raise ValueError('Cần tồn kho, dự báo và đủ 6 tháng quan sát')
    mean6=sum(history)/6;mean3=sum(history[-3:])/3
    return {'risk_score_2':forecast/(stock+1),'risk_score_3':forecast/max(stock,1),'sales_volatility_6':math.sqrt(sum((v-mean6)**2 for v in history)/5),'active_months_6':sum(v>0 for v in history),'inventory_days_cover':min(365,stock/(mean3+1e-5)*30),'historical_mean_3':mean3,'stock_units':stock}
