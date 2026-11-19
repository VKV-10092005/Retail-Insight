import argparse,zipfile,pathlib,hashlib,json,csv,io
parser=argparse.ArgumentParser();parser.add_argument('archive');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]/'data'/'research';root.mkdir(parents=True,exist_ok=True)
allowed={'replenishment_test_results.csv','sku_model_auto_comparison.csv','sku_model_comparison_80_10_10.csv','sku_forecast_ma2_2023_08.csv','sku_ma2_test_predictions.csv','sku_forecast_auto_2023_08.csv','fp_sku_monthly_history.parquet'}
manifest={'dataset_id':'nckh-2022-2023','source_archive_sha256':hashlib.sha256(pathlib.Path(args.archive).read_bytes()).hexdigest(),'files':[]}
with zipfile.ZipFile(args.archive) as archive:
 for info in archive.infolist():
  name=pathlib.PurePosixPath(info.filename).name
  if name not in allowed:continue
  if info.file_size>100_000_000:raise ValueError('Oversized artifact')
  data=archive.read(info);entry={'name':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
  if name.endswith('.csv'):entry['rows']=len(list(csv.DictReader(io.StringIO(data.decode('utf-8-sig')))))
  destination=root/name
  if destination.exists() and destination.read_bytes()!=data:raise ValueError('Artifact differs; will not overwrite '+name)
  destination.write_bytes(data);manifest['files'].append(entry)
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
