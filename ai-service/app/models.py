import os,json,hashlib
from pathlib import Path
from .algorithms import HYBRID_FEATURES,STOCKOUT_FEATURES
class ModelRegistry:
    def __init__(self):
        self.root=Path(os.getenv('MODEL_DIRECTORY',str(Path(__file__).resolve().parents[1]/'models'))).resolve()
    def load(self,kind):
        path=self.root/(kind+'.manifest.json')
        if not path.is_file():return None,'MISSING_MODEL_ARTIFACT'
        try:
            manifest=json.loads(path.read_text(encoding='utf-8-sig'))
            if not isinstance(manifest.get('version'),str) or not manifest['version']:raise ValueError('MODEL_VERSION_MISSING')
            expected=HYBRID_FEATURES if kind=='hybrid' else STOCKOUT_FEATURES
            if manifest['feature_order']!=expected:raise ValueError('FEATURE_ORDER_MISMATCH')
            if kind=='hybrid' and manifest.get('blend')!=[.25,.75]:raise ValueError('BLEND_MISMATCH')
            if kind=='stockout' and manifest.get('threshold')!=.3299:raise ValueError('THRESHOLD_MISMATCH')
            import joblib
            models={}
            for key in (['general','specialist'] if kind=='hybrid' else ['classifier']):
                spec=manifest['files'][key];p=(self.root/spec['name']).resolve()
                if self.root not in p.parents or not p.is_file():raise ValueError('MODEL_FILE_MISSING')
                if hashlib.sha256(p.read_bytes()).hexdigest()!=spec['sha256']:raise ValueError('MODEL_HASH_MISMATCH')
                models[key]=joblib.load(p)
                names=getattr(models[key],'feature_name_',None)
                if names is None or list(names)!=expected:raise ValueError('MODEL_FEATURE_ORDER_MISMATCH')
            return {'manifest':manifest,'models':models},None
        except Exception as e:return None,'INVALID_ARTIFACT_'+type(e).__name__
registry=ModelRegistry()
