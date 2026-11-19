"""Verify frozen historical inputs without fitting or predicting."""
from pathlib import Path
import json,hashlib,shutil,contextlib,io
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from freeze_historical_reproduction import BASE,EXTRA,CATS,JAN_CATS,ROOT,SOURCE,NOTEBOOK,sha,write

run=ROOT/'artifacts/reproductions/historical-freeze-20261104T185832Z'
m=json.loads((run/'manifest.json').read_text(encoding='utf8'));checks={}
for name,digest in m['artifacts'].items():assert sha(run/name)==digest
checks['artifact_hashes']='PASS'
for name,digest in m['source_hashes'].items():assert sha(NOTEBOOK if name==NOTEBOOK.name else SOURCE/name)==digest
checks['source_hashes_after_freeze']='PASS'
metadata=json.loads((run/'feature_metadata.json').read_text(encoding='utf8'))
assert metadata['hybrid30']['order']==BASE+EXTRA and len(set(BASE+EXTRA))==30
assert set(metadata['hybrid30']['categories'])==set(CATS)
assert set(metadata['jan17']['categories'])==set(JAN_CATS)
checks['feature_order_and_category_contract']='PASS'
f=pq.ParquetFile(run/'frozen_features.parquet');k=pq.ParquetFile(run/'ordered_keys_and_hybrid_splits.parquet')
assert f.metadata.num_rows==k.metadata.num_rows==520809
assert f.schema_arrow.names==['position','product_id','sale_month','target']+BASE+EXTRA
position=0
for batch in k.iter_batches(batch_size=19000):
 d=batch.to_pandas();assert np.array_equal(d.position,np.arange(position,position+len(d)));position+=len(d)
 for month in pd.date_range('2023-03-01','2023-07-01',freq='MS'):
  expected=np.where(d.sale_month<month,'train',np.where(d.sale_month==month,'test','unused'))
  assert np.array_equal(d['origin_'+month.strftime('%Y%m')],expected)
checks['full_hybrid_position_and_time_membership']='PASS'
# Compare one complete 19-month SKU to the original no-fit feature cell, not to a mirrored implementation.
raw=pd.read_csv(SOURCE/'retail_ai_training_v3.csv',nrows=57,dtype={'product_id':str},parse_dates=['sale_month'])
id=raw.product_id.iloc[0];raw=raw[raw.product_id==id].copy();assert len(raw)==19
nb=json.loads(NOTEBOOK.read_text(encoding='utf8'));env={'bt':raw}
with contextlib.redirect_stdout(io.StringIO()):exec(compile(''.join(nb['cells'][191]['source']),'original-cell-191','exec'),env)
reference=env['bt_exp'];frozen=pd.read_parquet(run/'frozen_features.parquet',filters=[('product_id','=',id)])
for c in BASE:
 if c in JAN_CATS:assert reference[c].astype(str).tolist()==frozen[c].astype(str).tolist()
 else:np.testing.assert_allclose(reference[c].to_numpy(dtype=float),frozen[c].to_numpy(dtype=float),rtol=0,atol=0,equal_nan=True)
checks['original_cell191_reference_one_complete_sku']='PASS (19 rows, all 17 features, exact numeric equality)'
s=pd.read_parquet(run/'stockout_candidate_splits.parquet');assert s.product_id.is_unique and len(s)==12013
sets={name:set(s.index[s.split==name]) for name in ['train','validation','test']}
assert not(sets['train']&sets['validation'] or sets['train']&sets['test'] or sets['validation']&sets['test'])
assert set.union(*sets.values())==set(s.index)
assert set(s.loc[s.split=='test','oof_fold'])=={-1}
assert set(s.loc[s.split!='test','oof_fold'])==set(range(5))
assert sorted(s.loc[s.split!='test','dev_position'].tolist())==list(range(9610))
checks['stockout_candidate_split_disjointness_and_fold_coverage']='PASS; pending upstream prediction availability gate'
checks['no_weights_or_reference_predictions']='EXPECTED: 0 fits; no inference metrics fabricated'
write(run/'verification.json',{'checks':checks,'training_executed':False,'prediction_executed':False})
shutil.copyfile(ROOT/'scripts/freeze_historical_reproduction.py',run/'freeze_runner.py')
shutil.copyfile(Path(__file__),run/'verification_runner.py')
# Include additional upstream-join source in the evidence bundle.
write(run/'upstream_join_cells.json',{'notebook_sha256':sha(NOTEBOOK),'cells':[{'index':i,'source':''.join(nb['cells'][i]['source'])} for i in [195,196,342]]})
m['verification']='PASS; training blocked by memory gate'
m['artifacts']={str(p.relative_to(run)):sha(p) for p in run.rglob('*') if p.is_file() and p.name not in ['manifest.json','manifest.sha256']}
write(run/'manifest.json',m);(run/'manifest.sha256').write_text(sha(run/'manifest.json')+'  manifest.json\n',encoding='ascii')
print(json.dumps(checks,ensure_ascii=False))
