"""Freeze historical reproduction evidence; never trains or activates a model."""
from pathlib import Path
import csv, json, hashlib, platform, importlib.metadata as metadata, ctypes, datetime, shutil
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sklearn.model_selection import train_test_split, StratifiedKFold

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/DaiHoc/NCKH/ChuoiCungUng')
NOTEBOOK=Path('C:/Users/TUF F15/Downloads/Retail_FP_Demand_Forecasting (4).ipynb')
BASE=['group_id','brand_id','gender','size','color_group','listing_price','clean_lag_1','clean_lag_2','clean_lag_3','clean_lag_6','clean_mean_3','clean_mean_6','zero_ratio_3','zero_ratio_6','history_months','clean_month','clean_quarter']
EXTRA=['group_lag_1','brand_lag_1','price_last_known','price_mean_prev_3m','price_mean_prev_6m','months_since_last_price','has_historical_price','last_price_to_listing_ratio','age_group','activity_group','lifestyle_group','launch_season','launch_year']
CATS=['group_id','brand_id','gender','size','color_group','age_group','activity_group','lifestyle_group','launch_season']
JAN_CATS=['group_id','brand_id','gender','color_group']

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2,default=lambda x:x.item() if hasattr(x,'item') else str(x)),encoding='utf8')
def memory():
 class Status(ctypes.Structure):
  _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(n,ctypes.c_ulonglong) for n in ['total','available','total_page','available_page','total_virtual','available_virtual','extended']]
 s=Status();s.length=ctypes.sizeof(s)
 if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s)):raise OSError('Memory status unavailable')
 return {'total_physical_bytes':s.total,'available_physical_bytes':s.available,'required_available_bytes':2*1024**3,'reason':'Conservative training preflight after prior full-frame out-of-memory; no model parameters changed'}

def main():
 run='historical-freeze-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 out=ROOT/'artifacts'/'reproductions'/run;out.mkdir(parents=True,exist_ok=False)
 manifest={'run_id':run,'status':'PREFLIGHT','fit_limit':18,'fit_attempts':0,'models_created':0,'activated':False,'database_access':False,'original_files_modified':False,'environment':{p:metadata.version(p) for p in ['lightgbm','pandas','numpy','joblib','scikit-learn','pyarrow']},'python':platform.python_version(),'platform':platform.platform(),'original_training_environment':'UNKNOWN; this is a new reproduction environment, not byte-identical restoration','memory_before':memory(),'source_hashes':{},'limitations':[]}
 write(out/'manifest.json',manifest)
 try:
  audit=json.loads((ROOT/'docs/model-reproduction-evidence/audit.json').read_text(encoding='utf8'))
  assert sha(NOTEBOOK)==audit['notebook']['sha256'],'Notebook hash mismatch'
  manifest['source_hashes'][NOTEBOOK.name]=sha(NOTEBOOK)
  for item in audit['inputs']:
   actual=sha(SOURCE/item['name']);assert actual==item['sha256'],f"Source hash mismatch: {item['name']}"
   manifest['source_hashes'][item['name']]=actual
  evidence=ROOT/'docs/model-reproduction-evidence/notebook_cells.json'
  source=json.loads(evidence.read_text(encoding='utf8'));nb=json.loads(NOTEBOOK.read_text(encoding='utf8'))
  for c in source['cells']:
   s=''.join(nb['cells'][c['cell_index_zero_based']]['source'])
   assert hashlib.sha256(s.encode()).hexdigest()==c['source_sha256'],'Source cell hash mismatch'
  shutil.copyfile(evidence,out/'source_cells.json')
  manifest['runner_sha256']=sha(Path(__file__))
  pf=pd.read_csv(SOURCE/'product_features.csv',dtype={'product_id':str},low_memory=False)
  assert pf.product_id.is_unique
  pf.launch_year=pd.to_numeric(pf.launch_year,errors='coerce')
  cats={c:set() for c in CATS};types={};janparts=[];writer=None;keys_writer=None;offset=0;lastkey=None;pending=None
  origins=pd.date_range('2023-03-01','2023-07-01',freq='MS')
  counts={str(m.date()):{'train_general':0,'train_specialist':0,'test':0} for m in origins}
  def consume(d):
   nonlocal writer,keys_writer,offset,lastkey
   if len(d)==0:return
   d=d.sort_values(['product_id','sale_month']).reset_index(drop=True)
   assert not d.duplicated(['product_id','sale_month']).any()
   first=(d.product_id.iloc[0],d.sale_month.iloc[0]);assert lastkey is None or first>lastkey,'Input not sorted across batches: stop, do not change historical row order'
   lastkey=(d.product_id.iloc[-1],d.sale_month.iloc[-1])
   sizes=d.groupby('product_id').size();assert (sizes==19).all(),'Incomplete SKU monthly grid'
   d['target']=pd.to_numeric(d.observed_net_quantity,errors='coerce').fillna(0).clip(lower=0)
   g=d.groupby('product_id').target
   for k in [1,2,3,6]:d[f'clean_lag_{k}']=g.shift(k)
   past=g.shift(1)
   for w in [3,6]:
    d[f'clean_mean_{w}']=past.groupby(d.product_id).transform(lambda x:x.rolling(w,min_periods=1).mean())
    d[f'zero_ratio_{w}']=past.eq(0).astype(float).where(past.notna()).groupby(d.product_id).transform(lambda x:x.rolling(w,min_periods=1).mean())
   d['history_months']=d.groupby('product_id').cumcount();d['clean_month']=d.sale_month.dt.month;d['clean_quarter']=d.sale_month.dt.quarter
   d=d.merge(pf[['product_id']+EXTRA[8:]],on='product_id',how='left',validate='many_to_one',sort=False)
   for c in CATS:cats[c].update(d[c].dropna().unique().tolist());types[c]=str(d[c].dtype)
   for c in BASE+EXTRA:
    if c not in CATS:d[c]=pd.to_numeric(d[c],errors='coerce')
   mask=d[['clean_lag_1','clean_lag_2','clean_lag_3']].fillna(0).sum(axis=1).gt(0)&d.zero_ratio_6.lt(.5)
   keys=d[['product_id','sale_month','target']].copy();keys['position']=np.arange(offset,offset+len(d));keys['specialist_mask']=mask
   keys['jan17_membership']=np.where(d.sale_month<'2023-01-01','train',np.where(d.sale_month=='2023-01-01','test','unused'))
   for m in origins:
    train=d.sale_month<m;test=d.sale_month==m;name=str(m.date());counts[name]['train_general']+=int(train.sum());counts[name]['train_specialist']+=int((train&mask).sum());counts[name]['test']+=int(test.sum())
    keys['origin_'+m.strftime('%Y%m')]=np.where(train,'train',np.where(test,'test','unused'))
   frame=pd.concat([keys[['position','product_id','sale_month','target']],d[BASE+EXTRA]],axis=1)
   t=pa.Table.from_pandas(frame,preserve_index=False);kt=pa.Table.from_pandas(keys,preserve_index=False)
   if writer is None:writer=pq.ParquetWriter(out/'frozen_features.parquet',t.schema);keys_writer=pq.ParquetWriter(out/'ordered_keys_and_hybrid_splits.parquet',kt.schema)
   writer.write_table(t.cast(writer.schema));keys_writer.write_table(kt.cast(keys_writer.schema));offset+=len(d)
   janparts.append(d.loc[d.sale_month=='2023-01-01',['product_id','target']])
  try:
   for chunk in pd.read_csv(SOURCE/'retail_ai_training_v3.csv',dtype={'product_id':str},parse_dates=['sale_month'],chunksize=19000,low_memory=False):
    if pending is not None:chunk=pd.concat([pending,chunk],ignore_index=True)
    last=chunk.product_id.iloc[-1];pending=chunk[chunk.product_id==last].copy();consume(chunk[chunk.product_id!=last].copy())
   consume(pending)
  finally:
   if writer:writer.close()
   if keys_writer:keys_writer.close()
  assert offset==520809
  categories={c:{'source_dtype':types[c],'ordered':False,'levels':pd.Categorical(list(v)).categories.tolist(),'missing_code':-1} for c,v in cats.items()}
  write(out/'feature_metadata.json',{'hybrid30':{'order':BASE+EXTRA,'categories':categories,'blend':[.25,.75]},'jan17':{'order':BASE,'categories':{c:categories[c] for c in JAN_CATS},'size':'numeric; no categorical encoding','combination':'specialist hard switch on mask'},'lineage_cells':[176,191,192,225,343,350],'note':'Features staged without category encoding; apply the frozen levels exactly before any fit. Missing remains missing.'})
  stock=pd.read_csv(SOURCE/'stock_dec2022.csv',dtype={'product_id':str});stock.product_id=stock.product_id.str.strip()
  jan=pd.concat(janparts,ignore_index=True);jan.product_id=jan.product_id.str.strip()
  meta=stock.merge(jan,on='product_id',how='left',validate='one_to_one',sort=False).dropna(subset=['stock_units','target']).reset_index(drop=True)
  meta['is_stockout_proxy']=(meta.target.clip(lower=0)>meta.stock_units.clip(lower=0)).astype(int)
  assert len(meta)==12013 and int(meta.is_stockout_proxy.sum())==1329,'Stockout population/labels differ: stop related step'
  ix=np.arange(len(meta));tr,temp=train_test_split(ix,test_size=.4,random_state=42,stratify=meta.is_stockout_proxy)
  va,te=train_test_split(temp,test_size=.5,random_state=42,stratify=meta.is_stockout_proxy.iloc[temp]);dev=np.concatenate([tr,va])
  meta['split']='';meta['split_position']=-1;meta['dev_position']=-1;meta['oof_fold']=-1
  for name,idx in [('train',tr),('validation',va),('test',te)]:meta.loc[idx,'split']=name;meta.loc[idx,'split_position']=np.arange(len(idx))
  meta.loc[dev,'dev_position']=np.arange(len(dev))
  for fold,(_,v) in enumerate(StratifiedKFold(5,shuffle=True,random_state=42).split(dev,meta.is_stockout_proxy.iloc[dev])):meta.loc[dev[v],'oof_fold']=fold
  meta.to_parquet(out/'stockout_candidate_splits.parquet',index=False)
  manifest.update({'rows':offset,'hybrid_origin_counts':counts,'stockout_population':len(meta),'stockout_positives':int(meta.is_stockout_proxy.sum()),'stockout_splits':{'train':len(tr),'validation':len(va),'test':len(te),'dev':len(dev)},'memory_after':memory()})
  manifest['limitations']=['Category vocabulary and split memberships reconstructed from frozen input and source recipe, not independently compared to original runtime exports.','Stockout candidate membership assumes Jan17 produces finite predictions for all Jan SKU; must be revalidated against upstream before classifier fit.','Original training library versions and full-precision historical threshold unavailable; no guarantee of byte-identical or metric-identical recreation.']
  if manifest['memory_after']['available_physical_bytes']<manifest['memory_after']['required_available_bytes']:
   manifest['status']='FROZEN_TRAINING_BLOCKED_MEMORY';manifest['blocking_reason']='Less than 2 GiB physical memory available after streaming freeze; prior full-frame read failed with OOM. No fit attempted.'
  else:
   manifest['status']='FROZEN_NOT_TRAINED';manifest['blocking_reason']='Freeze-only runner; review independent preflight evidence before training.'
 except Exception as e:
  manifest['status']='PREFLIGHT_FAILED';manifest['blocking_reason']=str(e)
 finally:
  manifest['artifacts']={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p.name!='manifest.json'}
  write(out/'manifest.json',manifest)
  (out/'manifest.sha256').write_text(sha(out/'manifest.json')+'  manifest.json\n',encoding='ascii')
  print(json.dumps({'run_id':run,'status':manifest['status'],'fit_attempts':0,'reason':manifest.get('blocking_reason'),'directory':str(out)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
