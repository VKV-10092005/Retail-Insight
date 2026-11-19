from .algorithms import month_add,HYBRID_FEATURES,stockout_features
import math

def build_features(products, rows, origin, cohorts=None):
    quantities={(str(r['product_id']),r['month']):float(r['quantity']) for r in rows}
    prices={(str(r['product_id']),r['month']):float(r['unit_price']) for r in rows if r.get('unit_price') is not None and float(r['quantity'])>0}
    output=[];missing=[]
    for p in products:
        pid=str(p['id']);attrs=p.get('attributes',{});first=month_add(p['first_month'],1)
        six=[month_add(origin,-i) for i in reversed(range(6))]
        required=['group_id','brand_id','gender','size','color_group','age_group','activity_group','lifestyle_group','launch_season','launch_year']
        absent=[k for k in required if attrs.get(k) is None]
        if first>six[0] or absent:
            missing.append({'product_id':pid,'sku':p['sku'],'reason':'INSUFFICIENT_SIX_MONTH_HISTORY' if first>six[0] else 'MISSING_PRODUCT_ATTRIBUTES','fields':absent});continue
        past=[quantities.get((pid,m),0) for m in six];past3=past[-3:];target=month_add(origin,1)
        all_months=[];m=first
        while m<=origin and len(all_months)<240:all_months.append(m);m=month_add(m,1)
        available=[(m,prices[(pid,m)]) for m in all_months if (pid,m) in prices]
        last=available[-1] if available else None
        price_values3=[prices[(pid,m)] for m in six[-3:] if (pid,m) in prices];price_values6=[prices[(pid,m)] for m in six if (pid,m) in prices]
        def cohort(key):
            return sum(float(row['quantity']) for row in (cohorts or []) if row['month']==origin and str(row.get(key))==str(attrs[key]))
        year,month=map(int,target.split('-'));listing=float(p['sale_price'])
        features={**{k:attrs[k] for k in required},'listing_price':listing,'clean_lag_1':past[-1],'clean_lag_2':past[-2],'clean_lag_3':past[-3],'clean_lag_6':past[-6],'clean_mean_3':sum(past3)/3,'clean_mean_6':sum(past)/6,'zero_ratio_3':sum(v==0 for v in past3)/3,'zero_ratio_6':sum(v==0 for v in past)/6,'history_months':len(all_months),'clean_month':month,'clean_quarter':(month-1)//3+1,'group_lag_1':cohort('group_id'),'brand_lag_1':cohort('brand_id'),'price_last_known':last[1] if last else 0,'price_mean_prev_3m':sum(price_values3)/len(price_values3) if price_values3 else 0,'price_mean_prev_6m':sum(price_values6)/len(price_values6) if price_values6 else 0,'months_since_last_price':(year-int(last[0][:4]))*12+month-int(last[0][5:7]) if last else -1,'has_historical_price':int(last is not None),'last_price_to_listing_ratio':last[1]/listing if last and listing>0 else 0}
        output.append({'product_id':pid,'features':{k:features[k] for k in HYBRID_FEATURES}})
    return output,missing
