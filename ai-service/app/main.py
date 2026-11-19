import os,secrets,logging,time
from datetime import date
from typing import Annotated
from fastapi import FastAPI,Depends,Header,HTTPException,Request
from pydantic import BaseModel,Field,ConfigDict,FiniteFloat
from .algorithms import HYBRID_FEATURES,STOCKOUT_FEATURES,CATEGORICAL,replenishment,corrected_totals,seasonal_trend,seasonal_trend_six_month,adaptive_product_forecast,adaptive_total
from .models import registry
app=FastAPI(title='Retail inference service',version='0.2.0',docs_url=None,redoc_url=None)
logger=logging.getLogger('retail.ai')
Month=Annotated[str,Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')]
Nonnegative=Annotated[FiniteFloat,Field(ge=0)]
class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
def protect(authorization:str=Header(default='')):
    token=os.getenv('AI_SERVICE_TOKEN','')
    if len(token)<32:raise HTTPException(503,'AI service token chưa được cấu hình')
    if not secrets.compare_digest(authorization,'Bearer '+token):raise HTTPException(401,'Unauthorized')
@app.middleware('http')
async def limits(request:Request,call_next):
    from starlette.responses import JSONResponse
    body=await request.body()
    if len(body)>2_000_000:return JSONResponse({'detail':'Request too large'},413)
    started=time.monotonic();response=await call_next(request)
    logger.info('%s %s status=%s elapsed_ms=%s',request.method,request.url.path,response.status_code,round((time.monotonic()-started)*1000))
    return response
@app.get('/health')
def health():return {'status':'ONLINE','ready':True,'service':'retail-ai','training_enabled':False}
@app.get('/v1/readiness',dependencies=[Depends(protect)])
def readiness():
    result={}
    for kind in ['hybrid','stockout']:
        model,reason=registry.load(kind);result[kind]={'status':'READY' if model else 'UNAVAILABLE','reason':reason,'version':model['manifest']['version'] if model else None}
    return {'models':result,'algorithms':{'replenishment':'READY','corrected_total':'READY','seasonal_trend':'READY'},'live_metrics':None}
class SKU(Strict):
    product_id:str=Field(min_length=1,max_length=100)
    features:dict[str,str|FiniteFloat|None]
class SKURequest(Strict):
    month:Month
    version:str|None=None
    items:list[SKU]=Field(max_length=100)
@app.post('/v1/sku',dependencies=[Depends(protect)])
def sku_forecast(data:SKURequest):
    bundle,reason=registry.load('hybrid')
    if not bundle:return {'status':'UNAVAILABLE','reason':reason,'items':[],'metrics':None}
    if data.version and data.version!=bundle['manifest']['version']:return {'status':'UNAVAILABLE','reason':'MODEL_VERSION_NOT_LOADED','items':[]}
    if not data.items:return {'status':'INSUFFICIENT_DATA','items':[]}
    import pandas as pd
    import numpy as np
    records=[i.features for i in data.items]
    for row in records:
        if set(row)!=set(HYBRID_FEATURES) or any(row[k] is None for k in HYBRID_FEATURES):raise HTTPException(422,'Cần đúng 30 đặc trưng đầy đủ')
    frame=pd.DataFrame(records,columns=HYBRID_FEATURES)
    categories=bundle['manifest'].get('categories',{})
    for col in HYBRID_FEATURES:
        if col in categories:
            lookup={str(v):v for v in categories[col]}
            def canonical(value):
                if str(value) in lookup:return lookup[str(value)]
                if isinstance(value,(int,float)) and float(value).is_integer() and str(int(value)) in lookup:return lookup[str(int(value))]
                raise HTTPException(422,'Category chưa được xác minh: '+col)
            frame[col]=pd.Categorical(frame[col].map(canonical),categories=categories[col])
        else:frame[col]=pd.to_numeric(frame[col],errors='raise')
    try:
        general=np.maximum(bundle['models']['general'].predict(frame),0)
        specialist=np.maximum(bundle['models']['specialist'].predict(frame),0)
        mask=(frame[['clean_lag_1','clean_lag_2','clean_lag_3']].sum(axis=1)>0)&(frame['zero_ratio_6']<.5)
        predicted=np.where(mask,.25*general+.75*specialist,general)
        if not np.isfinite(predicted).all():raise ValueError('Nonfinite prediction')
    except Exception:raise HTTPException(422,'Model không tương thích input; không tự huấn luyện lại')
    return {'status':'READY','version':bundle['manifest']['version'],'month':data.month,'items':[{'product_id':item.product_id,'quantity':float(pred),'method':'HYBRID_30_25_75'} for item,pred in zip(data.items,predicted)],'metrics':None}
class DemandRow(Strict):
    month:Month
    predicted:Nonnegative
    actual:Nonnegative|None=None
class TotalRequest(Strict):rows:list[DemandRow]=Field(min_length=1,max_length=120)
@app.post('/v1/total',dependencies=[Depends(protect)])
def total(data:TotalRequest):
    try:return {'status':'READY','method':'PREVIOUS_MONTH_CORRECTION_NOTEBOOK_CELL_329','items':corrected_totals([r.model_dump() for r in data.rows]),'metrics':None}
    except ValueError as e:raise HTTPException(422,str(e))
class ReplenishmentItem(Strict):
    product_id:str
    predicted:Nonnegative|None
    stock:Nonnegative|None
    min_stock:Nonnegative|None=None
class ReplenishmentRequest(Strict):items:list[ReplenishmentItem]=Field(max_length=100)
@app.post('/v1/replenishment',dependencies=[Depends(protect)])
def recommend(data:ReplenishmentRequest):return {'status':'READY','method':'MIN_STOCK_AND_FORECAST','items':[{**r.model_dump(),**replenishment(r.predicted,r.stock,r.min_stock)} for r in data.items],'metrics':None}
class HistoryRow(Strict):
    month:Month
    quantity:Nonnegative
class MultiRequest(Strict):
    origin:Month
    history:list[HistoryRow]=Field(max_length=240)
    horizons:list[Annotated[int,Field(ge=1,le=3)]]=Field(default=[1,2,3],min_length=1,max_length=3)
@app.post('/v1/multi',dependencies=[Depends(protect)])
def multi(data:MultiRequest):
    if data.origin>=date.today().strftime('%Y-%m'):raise HTTPException(422,'Origin phải là tháng đã kết thúc')
    try:return seasonal_trend([r.model_dump() for r in data.history],data.origin,sorted(set(data.horizons)))
    except ValueError as e:raise HTTPException(422,str(e))
class StockoutRow(Strict):
    product_id:str
    features:dict[str,Nonnegative]
class StockoutRequest(Strict):items:list[StockoutRow]=Field(max_length=100)
@app.post('/v1/stockout',dependencies=[Depends(protect)])
def stockout(data:StockoutRequest):
    bundle,reason=registry.load('stockout')
    if not bundle:return {'status':'UNAVAILABLE','reason':reason,'items':[],'metrics':None}
    import pandas as pd
    for row in data.items:
        if set(row.features)!=set(STOCKOUT_FEATURES):raise HTTPException(422,'Cần đúng 7 đặc trưng')
    if not data.items:return {'status':'INSUFFICIENT_DATA','items':[]}
    frame=pd.DataFrame([r.features for r in data.items],columns=STOCKOUT_FEATURES)
    try:proba=bundle['models']['classifier'].predict_proba(frame)[:,1]
    except Exception:raise HTTPException(422,'Model không tương thích; không tự huấn luyện lại')
    return {'status':'READY','version':bundle['manifest']['version'],'threshold':.3299,'items':[{'product_id':r.product_id,'probability':float(p),'risk':bool(p>=.3299),'priority':'Ưu tiên kiểm tra' if p>=.3299 else 'Theo dõi'} for r,p in zip(data.items,proba)],'label':'STOCKOUT_PROXY','metrics':None}

class OperationalProduct(Strict):
    id:str
    sku:str
    name:str
    attributes:dict
    category_id:int|None=None
    category_name:str|None=None
    first_date:str|None=None
    sale_price:Nonnegative
    first_month:Month
    stock:Nonnegative|None
    min_stock:Nonnegative|None=None
    daily_rate_28:Nonnegative=0
    daily_rate_84:Nonnegative=0
    category_daily_rate:Nonnegative=0
class SalesHistoryRow(HistoryRow):
    product_id:int|str
    unit_price:Nonnegative|None=None
class CohortRow(HistoryRow):
    group_id:str|None
    brand_id:str|None
class OperationalRequest(Strict):
    cohorts:list[CohortRow]=Field(default_factory=list,max_length=100000)
    task:str=Field(pattern=r'^(sku|total|replenishment|stockout|multi|multi_sku)$')
    origin:Month
    current_origin:Month
    history:list[HistoryRow]=Field(max_length=240)
    rows:list[SalesHistoryRow]=Field(max_length=100000)
    products:list[OperationalProduct]=Field(max_length=100000)
    version:str|None=None

class AdaptiveTotalRequest(Strict):
    origin:Month
    history:list[HistoryRow]=Field(max_length=240)
    horizons:list[Annotated[int,Field(ge=1,le=3)]]=Field(default=[1,2,3],min_length=1,max_length=3)
    products:list[OperationalProduct]=Field(max_length=100000)

def historical_or_adaptive_total(origin,history,products,horizons):
    historical=seasonal_trend(history,origin,sorted(set(horizons)))
    if historical['status']=='READY':return historical
    six_month=seasonal_trend_six_month(history,origin,sorted(set(horizons)))
    if six_month['status']=='READY':return six_month
    return adaptive_total([product.model_dump() if isinstance(product,BaseModel) else product for product in products],origin,sorted(set(horizons)))

@app.post('/v1/adaptive-total',dependencies=[Depends(protect)])
def adaptive_total_route(data:AdaptiveTotalRequest):
    return historical_or_adaptive_total(data.origin,[row.model_dump() for row in data.history],data.products,data.horizons)
@app.post('/v1/operational',dependencies=[Depends(protect)])
def operational(data:OperationalRequest):
    from .algorithms import month_add,stockout_features
    from .features import build_features
    if data.task in ('multi','total'):
        return historical_or_adaptive_total(data.origin,[row.model_dump() for row in data.history],data.products,[1,2,3])
    if data.origin!=data.current_origin:return {'status':'UNAVAILABLE','reason':'HISTORICAL_PRODUCT_ATTRIBUTE_SNAPSHOTS_NOT_AVAILABLE','items':[]}
    products=[p.model_dump() for p in data.products]
    rows=[r.model_dump() for r in data.rows]
    def predict():
        features,missing=build_features(products,rows,data.origin,[r.model_dump() for r in data.cohorts])
        predicted={'status':'READY','items':[],'version':None}
        for offset in range(0,len(features),100):
            chunk=sku_forecast(SKURequest(month=month_add(data.origin,1),version=data.version,items=[SKU(**r) for r in features[offset:offset+100]]))
            if chunk['status']!='READY':return chunk,missing
            predicted['items'].extend(chunk['items']);predicted['version']=chunk.get('version')
        return predicted,missing
    predicted,missing=predict()
    predicted_by_id={str(row['product_id']):row for row in predicted.get('items',[])}
    missing_ids={str(row.get('product_id')) for row in missing}
    def adaptive_item(product):
        estimate=adaptive_product_forecast(product,data.origin,[1,2,3])
        first=estimate['forecasts'][0]
        return {'product_id':str(product['id']),'sku':product['sku'],'name':product['name'],'quantity':first['quantity'],'predicted':first['quantity'],'horizon':1,'stock':product.get('stock'),'min_stock':product.get('min_stock'),'forecasts':estimate['forecasts'],'method':'ADAPTIVE_FORECAST','basis':estimate['basis'],'confidence':estimate['confidence'],'daily_rate':estimate['daily_rate'],'seasonality_factor':first['seasonality_factor']}
    explanation='Ước lượng tham khảo kết hợp tốc độ bán 28/84 ngày trong tenant, bình quân SKU cùng danh mục khi SKU chưa có bán, min_stock làm sàn chuẩn hóa 90 ngày và hệ số mùa vụ ngành hàng. Đây không phải cam kết doanh số; độ tin cậy thấp đến trung bình.'
    if data.task in ('sku','multi_sku'):
        if predicted['status']=='READY' and not missing:
            by_product={str(p['id']):p for p in products}
            return {**predicted,'items':[{**row,'sku':by_product[str(row['product_id'])]['sku'],'name':by_product[str(row['product_id'])]['name'],'stock':by_product[str(row['product_id'])].get('stock'),'min_stock':by_product[str(row['product_id'])].get('min_stock'),'horizon':1,'forecasts':[{'month':month_add(data.origin,1),'horizon':1,'quantity':row['quantity']}],'method':'HYBRID_30'} for row in predicted['items']]}
        items=[]
        for product in products:
            pid=str(product['id'])
            if predicted['status']=='READY' and pid not in missing_ids and pid in predicted_by_id:
                row=predicted_by_id[pid]
                items.append({**row,'sku':product['sku'],'name':product['name'],'stock':product.get('stock'),'min_stock':product.get('min_stock'),'horizon':1,'forecasts':[{'month':month_add(data.origin,1),'horizon':1,'quantity':row['quantity']}],'method':'HYBRID_30'})
            else:items.append(adaptive_item(product))
        return {'status':'ADAPTIVE_FORECAST','reason':'ADAPTIVE_COLD_START','method':'ADAPTIVE_COLD_START_BENCHMARK','items':items,'explanation':explanation,'fallback_count':sum(1 for item in items if item['method']=='ADAPTIVE_FORECAST'),'metrics':None}
    if data.task in ('replenishment','stockout') and (predicted['status']!='READY' or missing):
        fallback=[];absent=[]
        for product in products:
            item=adaptive_item(product);stock=product.get('stock');minimum=product.get('min_stock');forecast=item['quantity']
            days=min(365,float(stock)/forecast*30) if stock is not None and forecast>0 else None
            below=minimum is not None and stock is not None and float(stock)<=minimum
            if data.task=='replenishment':
                fallback.append({**item,'days_of_supply':days,**replenishment(forecast,stock,minimum)})
            else:
                risk=bool(below or (days is not None and days<=30))
                fallback.append({**item,'days_of_supply':days,'below_min_stock':below,'risk':risk,'priority':'Cần nhập: dưới min_stock' if below else ('Ưu tiên kiểm tra' if risk else 'Theo dõi')})
            if stock is None:absent.append({'product_id':product['id'],'reason':'MISSING_STOCK'})
        return {'status':'ADAPTIVE_FORECAST','reason':'ADAPTIVE_COLD_START','method':'ADAPTIVE_COLD_START_BENCHMARK','items':fallback,'explanation':explanation+' Cảnh báo và gợi ý nhập vẫn dùng tồn kho thực tế; giá trị tồn thiếu được giữ là chưa xác định.','missing_inputs':absent,'metrics':None}
    if predicted['status']!='READY':return {**predicted,'missing_inputs':missing}
    if missing:return {'status':'INSUFFICIENT_DATA','reason':'MISSING_PRODUCT_HISTORY_OR_ATTRIBUTES','items':[],'missing_inputs':missing}
    by_id={str(r['product_id']):r['quantity'] for r in predicted['items']}
    if data.task=='replenishment':
        response=recommend(ReplenishmentRequest(items=[ReplenishmentItem(product_id=p.id,predicted=by_id.get(p.id),stock=p.stock,min_stock=p.min_stock) for p in data.products]))
        return {**response,'items':[{**r,'sku':next(p.sku for p in data.products if p.id==r['product_id'])} for r in response['items']]}
    feature_rows=[];absent=[]
    for p in data.products:
        lookup={r.month:r.quantity for r in data.rows if str(r.product_id)==p.id}
        history=[lookup.get(month_add(data.origin,-i),0) for i in reversed(range(6))]
        if p.stock is None:absent.append({'product_id':p.id,'reason':'MISSING_STOCK'});continue
        feature_rows.append(StockoutRow(product_id=p.id,features=stockout_features(p.stock,by_id[p.id],history)))
    result=stockout(StockoutRequest(items=feature_rows))
    if result['status']!='READY':
        fallback=[]
        for p in products:
            item=adaptive_item(p);stock=p.get('stock');minimum=p.get('min_stock');forecast=item['quantity']
            days=min(365,float(stock)/forecast*30) if stock is not None and forecast>0 else None
            below=minimum is not None and stock is not None and float(stock)<=minimum
            risk=bool(below or (days is not None and days<=30))
            fallback.append({**item,'days_of_supply':days,'below_min_stock':below,'risk':risk,'priority':'Cần nhập: dưới min_stock' if below else ('Ưu tiên kiểm tra' if risk else 'Theo dõi')})
        return {'status':'ADAPTIVE_FORECAST','reason':'ADAPTIVE_COLD_START','method':'ADAPTIVE_COLD_START_BENCHMARK','items':fallback,'explanation':explanation,'missing_inputs':absent,'metrics':None}
    products_by_id={p.id:p for p in data.products};items=[]
    quantities={}
    for row in data.rows:quantities.setdefault(str(row.product_id),{})[row.month]=float(row.quantity)
    for row in result.get('items',[]):
        product=products_by_id.get(row['product_id'])
        if not product:continue
        pstock=product.stock;mean3=sum(quantities.get(product.id,{}).get(month_add(data.origin,-i),0.) for i in (2,1,0))/3
        days=min(365,pstock/mean3*30) if pstock is not None and mean3>0 else None
        below=product.min_stock is not None and pstock is not None and pstock<=product.min_stock
        items.append({**row,'sku':product.sku,'stock':pstock,'min_stock':product.min_stock,'predicted':by_id.get(row['product_id']),'days_of_supply':days,'below_min_stock':below})
    return {**result,'items':items,'missing_inputs':absent}
from pathlib import Path
from functools import lru_cache
import csv,json,hashlib
@lru_cache(maxsize=1)
def research_files():
    root=Path(os.getenv('RESEARCH_ARTIFACT_DIRECTORY',str(Path(__file__).resolve().parents[2]/'data'/'research'))).resolve()
    path=root/'manifest.json'
    if not path.is_file():raise HTTPException(503,'Chưa chuẩn bị gói artifact nghiên cứu')
    manifest=json.loads(path.read_text(encoding='utf-8-sig'));files={}
    for spec in manifest['files']:
        p=(root/spec['name']).resolve()
        if root not in p.parents or hashlib.sha256(p.read_bytes()).hexdigest()!=spec['sha256']:raise HTTPException(503,'Artifact checksum không khớp')
        if p.suffix=='.csv':
            with p.open(encoding='utf-8-sig',newline='') as f:files[p.name]=list(csv.DictReader(f))
    return manifest,files
@app.get('/v1/research/runs',dependencies=[Depends(protect)])
def research_runs():
    manifest,files=research_files()
    runs=[]
    for run,name in [('MA2_80_10_10_V1','sku_forecast_ma2_2023_08.csv'),('AUTO_SELECTION_ARCHIVE','sku_forecast_auto_2023_08.csv')]:
        rows=files.get(name,[]);runs.append({'id':run,'source_file':name,'count':len(rows),'total':sum(float(r['forecast_quantity']) for r in rows),'forecast_month':rows[0]['forecast_month'] if rows else None,'inference_ready':False,'source':'HISTORICAL_RESEARCH'})
    return {'dataset_id':manifest['dataset_id'],'runs':runs,'comparisons':files.get('sku_model_auto_comparison.csv',[]),'archive_sha256':manifest['source_archive_sha256']}
@app.get('/v1/research/forecasts',dependencies=[Depends(protect)])
def research_forecasts(run:str,q:str='',page:int=1,limit:int=20):
    if run not in ['MA2_80_10_10_V1','AUTO_SELECTION_ARCHIVE'] or page<1 or not 1<=limit<=100:raise HTTPException(422,'Bộ lọc không hợp lệ')
    _,files=research_files();name='sku_forecast_ma2_2023_08.csv' if run=='MA2_80_10_10_V1' else 'sku_forecast_auto_2023_08.csv'
    rows=[r for r in files.get(name,[]) if q.lower() in r['product_id'].lower()]
    return {'source':'HISTORICAL_RESEARCH','run':run,'items':rows[(page-1)*limit:page*limit],'total':len(rows),'inference_status':'NOT_A_HYBRID_ARTIFACT'}

