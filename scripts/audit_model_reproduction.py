"""Read-only source/model audit. Contains no training or activation command."""
from pathlib import Path
import argparse,csv,hashlib,json,importlib.metadata

def sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda:stream.read(1024*1024),b''):digest.update(part)
    return digest.hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--notebook',required=True);parser.add_argument('--provided-model',required=True)
    parser.add_argument('--test-results',required=True);parser.add_argument('--research-directory',required=True)
    parser.add_argument('--inspect-provided-model',action='store_true',help='Load only a trusted owner-provided joblib for metadata; never train')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1];out=root/'docs'/'model-reproduction-evidence';out.mkdir(parents=True,exist_ok=True)
    notebook=Path(args.notebook);nb=json.loads(notebook.read_text(encoding='utf-8-sig'))
    selected=[27,100,101,129,131,176,191,192,225,255,342,343,350,366,367,414,415,416,436,455,459]
    cells=[]
    for index in selected:
        cell=nb['cells'][index];source=''.join(cell.get('source',[]))
        cells.append({'cell_index_zero_based':index,'source_sha256':hashlib.sha256(source.encode()).hexdigest(),'source':source,'execution_count':cell.get('execution_count')})
    (out/'notebook_cells.json').write_text(json.dumps({'notebook_sha256':sha(notebook),'cells':cells},ensure_ascii=False,indent=2),encoding='utf-8')
    inputs=[]
    for name in ['retail_ai_training_v3.csv','product_features.csv','stock_dec2022.csv']:
        path=Path(args.research_directory)/name
        with path.open(encoding='utf-8-sig',newline='') as stream:
            reader=csv.reader(stream);columns=next(reader);count=sum(1 for _ in reader)
        inputs.append({'name':name,'sha256':sha(path),'rows':count,'columns':columns})
    model_path=Path(args.provided_model);results_path=Path(args.test_results)
    with results_path.open(encoding='utf-8-sig',newline='') as stream:results=list(csv.DictReader(stream))
    report={'status':'AWAITING_REPRODUCTION_APPROVAL','training_executed':False,'model_activated':False,'notebook':{'name':notebook.name,'sha256':sha(notebook)},'provided_model':{'name':model_path.name,'sha256':sha(model_path),'bytes':model_path.stat().st_size},'test_results':{'name':results_path.name,'sha256':sha(results_path),'rows':results},'inputs':inputs,'missing_dependency':'hybrid_forecast_jan2023.csv / original split key lists / original full-precision OOF threshold and training environment must be verified'}
    if args.inspect_provided_model:
        import joblib
        from lightgbm import LGBMRegressor,LGBMClassifier
        def forbidden(*a,**k):raise RuntimeError('Training forbidden during artifact audit')
        LGBMRegressor.fit=forbidden;LGBMClassifier.fit=forbidden
        bundle=joblib.load(model_path);model=bundle['model']
        report['provided_model'].update({'type':type(model).__name__,'feature_order':bundle['features'],'categorical_features':bundle['categorical_features'],'category_levels':dict(zip(bundle['categorical_features'],model.booster_.pandas_categorical)),'target_metadata':bundle.get('target'),'params':model.get_params(),'n_features':model.n_features_in_,'n_trees':model.booster_.num_trees(),'validation_results':bundle['validation_results'].to_dict(orient='records'),'test_results':bundle['test_results'].to_dict(orient='records'),'training_environment':'NOT_RECORDED_IN_BUNDLE'})
        report['inspection_environment']={p:importlib.metadata.version(p) for p in ['lightgbm','pandas','numpy','joblib','scikit-learn']}
    (out/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
    print('Saved audit metadata and source excerpts. No training, database writes or activation executed.')
if __name__=='__main__':main()
