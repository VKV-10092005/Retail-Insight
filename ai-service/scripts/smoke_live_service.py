import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root=Path(__file__).resolve().parents[1]
for line in (root/'.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
token=os.environ.get('AI_SERVICE_TOKEN','')
base='http://127.0.0.1:8000'
def call(path,body=None):
    data=json.dumps(body).encode() if body is not None else None
    req=Request(base+path,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urlopen(req,timeout=10) as response:return response.status,json.loads(response.read())
    except HTTPError as error:return error.code,json.loads(error.read())

readiness_status,readiness=call('/v1/readiness')
history=[{'month':f'{year}-{month:02d}','quantity':0} for year in (2025,2026) for month in range(1,13) if (year,month)<=(2026,10) and (year,month)>=(2025,11)]
multi_status,multi=call('/v1/multi',{'origin':'2026-10','history':history,'horizons':[1,2,3]})
restock_status,restock=call('/v1/replenishment',{'items':[{'product_id':'synthetic','predicted':0,'stock':2,'min_stock':10}]})
operational={'task':'replenishment','origin':'2026-10','current_origin':'2026-10','history':history,'rows':[{'product_id':'synthetic','month':m['month'],'quantity':0,'unit_price':None} for m in history], 'cohorts':[], 'products':[{'id':'synthetic','sku':'SYNTHETIC','name':'Synthetic probe','attributes':{},'sale_price':10,'first_month':'2025-01','stock':2,'min_stock':10}]}
fallback_status,fallback=call('/v1/operational',operational)
print(json.dumps({'readiness_http':readiness_status,'models':readiness.get('models',{}),'multi_http':multi_status,'multi_status':multi.get('status'),'multi_items':len(multi.get('items',[])),'replenishment_http':restock_status,'replenishment':restock.get('items',[{}])[0].get('recommended_quantity'),'operational_http':fallback_status,'operational_status':fallback.get('status'),'fallback_quantity':fallback.get('items',[{}])[0].get('recommended_quantity')},separators=(',',':')))
