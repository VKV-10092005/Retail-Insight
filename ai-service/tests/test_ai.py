import unittest,os,math,tempfile
from unittest.mock import patch
os.environ['AI_SERVICE_TOKEN']='test-only-service-token-32-bytes-minimum'
from app.algorithms import replenishment,corrected_totals,seasonal_trend,seasonal_trend_six_month,stockout_features,adaptive_product_forecast,category_seasonality,HYBRID_FEATURES,STOCKOUT_FEATURES
class Algorithms(unittest.TestCase):
    def test_replenishment_exact_rounding_and_missing(self):
        self.assertEqual(replenishment(1.1,0)['recommended_quantity'],3)
        self.assertEqual(replenishment(1.1,2,10)['recommended_quantity'],8)
        self.assertIsNone(replenishment(5,None)['recommended_quantity'])
        self.assertEqual(replenishment(5,100)['recommended_quantity'],0)
        with self.assertRaises(ValueError):replenishment(-1,0)
    def test_correction_no_future_leakage_and_clipping(self):
        rows=[{'month':'2023-01','predicted':10,'actual':100},{'month':'2023-02','predicted':20,'actual':1}]
        result=corrected_totals(rows);self.assertIsNone(result[0]['corrected']);self.assertEqual(result[1]['factor'],2);self.assertEqual(result[1]['corrected'],40)
        rows[-1]['actual']=999;self.assertEqual(corrected_totals(rows)[1]['corrected'],40)
        self.assertIsNone(corrected_totals([rows[0],{'month':'2023-03','predicted':20}])[1]['factor'])
    def test_seasonal_trend_horizons_and_no_future(self):
        history=[{'month':f'2022-{m:02d}','quantity':10} for m in range(1,13)]
        history += [{'month':'2023-01','quantity':999999}]
        result=seasonal_trend(history,'2022-12',[1,2,3]);self.assertEqual(result['status'],'READY');self.assertEqual([r['quantity'] for r in result['items']],[10,10,10])
        self.assertEqual(seasonal_trend(history[:6],'2022-12',[1])['status'],'INSUFFICIENT_HISTORY')
    def test_six_month_history_uses_seasonal_time_series(self):
        history=[{'month':f'2026-{m:02d}','quantity':10+m} for m in range(1,7)]
        result=seasonal_trend_six_month(history,'2026-06',[1,2,3])
        self.assertEqual(result['status'],'READY');self.assertEqual([r['horizon'] for r in result['items']],[1,2,3])
    def test_adaptive_product_uses_real_velocity_min_stock_and_category_season(self):
        product={'category_name':'Sách vở & Giấy in','daily_rate_28':2,'daily_rate_84':1,'min_stock':9}
        result=adaptive_product_forecast(product,'2026-07',[1,2,3])
        self.assertEqual(len(result['forecasts']),3);self.assertEqual(result['forecasts'][1]['seasonality_factor'],1.2)
        self.assertEqual(result['forecasts'][1]['seasonality_factor'],result['forecasts'][0]['seasonality_factor'])
        self.assertAlmostEqual(result['forecasts'][1]['quantity']/result['forecasts'][0]['quantity'],30/31,places=2)
        self.assertEqual(result['basis'],'SKU_DAILY_SALES');self.assertEqual(category_seasonality('Áo thời trang','2026-12'),1.12)
    def test_stockout_features_and_schema(self):
        r=stockout_features(10,20,[0,1,2,3,4,5]);self.assertEqual(set(r),set(STOCKOUT_FEATURES));self.assertEqual(r['active_months_6'],5);self.assertEqual(len(HYBRID_FEATURES),30)
    def test_feature_builder_never_pads_before_observation(self):
        from app.features import build_features
        _,missing=build_features([{'id':'1','sku':'NEW','first_month':'2026-10','sale_price':1,'attributes':{}}],[],'2026-10')
        self.assertEqual(missing[0]['reason'],'INSUFFICIENT_SIX_MONTH_HISTORY')
class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app.main import app
        cls.client=TestClient(app);cls.headers={'Authorization':'Bearer '+os.environ['AI_SERVICE_TOKEN']}
    def test_service_is_protected(self):
        self.assertEqual(self.client.get('/v1/readiness').status_code,401)
        self.assertEqual(self.client.get('/health').status_code,200)
    def test_missing_artifacts_never_fallback_or_train(self):
        with tempfile.TemporaryDirectory() as directory:
            from pathlib import Path
            from app.models import registry
            with patch.object(registry,'root',Path(directory)):
                r=self.client.post('/v1/sku',headers=self.headers,json={'month':'2026-11','items':[]}).json();self.assertEqual(r['status'],'UNAVAILABLE');self.assertEqual(r['items'],[])
                r=self.client.post('/v1/stockout',headers=self.headers,json={'items':[]}).json();self.assertEqual(r['status'],'UNAVAILABLE')
    def test_live_endpoints_math_and_validation(self):
        r=self.client.post('/v1/replenishment',headers=self.headers,json={'items':[{'product_id':'1','predicted':1.1,'stock':None}]}).json();self.assertIsNone(r['items'][0]['recommended_quantity'])
        self.assertEqual(self.client.post('/v1/replenishment',headers=self.headers,json={'items':[{'product_id':'1','predicted':-1,'stock':0}]}).status_code,422)
        r=self.client.post('/v1/multi',headers=self.headers,json={'origin':'2023-12','history':[],'horizons':[1,2,3]}).json();self.assertEqual(r['status'],'INSUFFICIENT_HISTORY')
    def test_exact_hybrid_blend_and_specialist_gate_without_training(self):
        import numpy as np
        from app.models import registry
        class Estimator:
            def __init__(self,value):self.value=value
            def predict(self,frame):return np.full(len(frame),self.value)
            def fit(self,*args):raise AssertionError('Inference must never train')
        bundle={'manifest':{'version':'UNIT_TEST_ONLY','categories':{'group_id':[1]}},'models':{'general':Estimator(4),'specialist':Estimator(8)}}
        first={k:1 for k in HYBRID_FEATURES};first['zero_ratio_6']=.2
        second={**first,'zero_ratio_6':.8}
        with patch.object(registry,'load',return_value=(bundle,None)):
            result=self.client.post('/v1/sku',headers=self.headers,json={'month':'2023-08','items':[{'product_id':'A','features':first},{'product_id':'B','features':second}]}).json()
            self.assertEqual([r['quantity'] for r in result['items']],[7.,4.])
    def test_stockout_threshold_without_training(self):
        import numpy as np
        from app.models import registry
        class Classifier:
            def predict_proba(self,frame):return np.array([[.6701,.3299],[.8,.2]])
            def fit(self,*args):raise AssertionError('Inference must never train')
        bundle={'manifest':{'version':'UNIT_TEST_ONLY'},'models':{'classifier':Classifier()}}
        with patch.object(registry,'load',return_value=(bundle,None)):
            result=self.client.post('/v1/stockout',headers=self.headers,json={'items':[{'product_id':key,'features':{k:1 for k in STOCKOUT_FEATURES}} for key in ['A','B']]}).json()
            self.assertEqual([r['risk'] for r in result['items']],[True,False])
    def test_model_manifest_hash_and_feature_order_fail_closed(self):
        from pathlib import Path
        from app.models import registry
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory)/'hybrid.manifest.json').write_text('{"feature_order":[]}')
            with patch.object(registry,'root',Path(directory)):
                bundle,reason=registry.load('hybrid');self.assertIsNone(bundle);self.assertTrue(reason.startswith('INVALID_ARTIFACT'))
    def test_operational_fallback_uses_min_stock_when_artifact_missing(self):
        payload={'task':'replenishment','origin':'2026-10','current_origin':'2026-10','history':[{'month':m,'quantity':0} for m in ['2026-08','2026-09','2026-10']],'rows':[{'product_id':'1','month':m,'quantity':0,'unit_price':None} for m in ['2026-08','2026-09','2026-10']],'cohorts':[],'products':[{'id':'1','sku':'SKU-1','name':'Test','attributes':{},'sale_price':10,'first_month':'2025-01','stock':2,'min_stock':10}]}
        result=self.client.post('/v1/operational',headers=self.headers,json=payload).json()
        self.assertEqual(result['status'],'ADAPTIVE_FORECAST');self.assertEqual(result['items'][0]['recommended_quantity'],8);self.assertEqual(result['items'][0]['target_stock'],10);self.assertEqual(len(result['items'][0]['forecasts']),3)
    def test_stockout_fallback_reports_days_supply_and_min_stock_alert(self):
        payload={'task':'stockout','origin':'2026-10','current_origin':'2026-10','history':[{'month':m,'quantity':1} for m in ['2026-08','2026-09','2026-10']],'rows':[{'product_id':'1','month':m,'quantity':1,'unit_price':None} for m in ['2026-08','2026-09','2026-10']],'cohorts':[],'products':[{'id':'1','sku':'SKU-1','name':'Test','attributes':{},'sale_price':10,'first_month':'2025-01','stock':2,'min_stock':3}]}
        result=self.client.post('/v1/operational',headers=self.headers,json=payload).json()
        self.assertEqual(result['status'],'ADAPTIVE_FORECAST');self.assertTrue(result['items'][0]['below_min_stock']);self.assertTrue(result['items'][0]['risk']);self.assertAlmostEqual(result['items'][0]['days_of_supply'],60,delta=3)
    def test_operational_cold_start_sku_multi_and_total_always_has_three_horizons(self):
        from app.main import app
        payload={'task':'sku','origin':'2026-10','current_origin':'2026-10','history':[{'month':m,'quantity':0} for m in ['2026-08','2026-09','2026-10']],'rows':[],'cohorts':[],'products':[{'id':'1','sku':'SKU-1','name':'Vở học sinh','attributes':{'min_stock':9},'category_name':'Sách vở & Giấy in','sale_price':100,'first_month':'2026-10','stock':20,'min_stock':9,'daily_rate_28':1,'daily_rate_84':.5,'category_daily_rate':.2}]}
        for task in ('sku','multi_sku'):
            result=self.client.post('/v1/operational',headers=self.headers,json={**payload,'task':task}).json()
            self.assertEqual(result['status'],'ADAPTIVE_FORECAST');self.assertEqual(len(result['items']),1);self.assertEqual(len(result['items'][0]['forecasts']),3)
            self.assertGreater(result['items'][0]['quantity'],0)
        result=self.client.post('/v1/adaptive-total',headers=self.headers,json={'origin':'2026-10','history':payload['history'],'products':payload['products'],'horizons':[1,2,3]}).json()
        self.assertEqual(result['status'],'ADAPTIVE_FORECAST');self.assertEqual(len(result['items']),3);self.assertTrue(all(row['quantity']>0 for row in result['items']))
    def test_operational_total_uses_six_month_store_history_before_benchmark(self):
        history=[{'month':f'2026-{m:02d}','quantity':float(10+m)} for m in range(1,7)]
        result=self.client.post('/v1/adaptive-total',headers=self.headers,json={'origin':'2026-06','history':history,'products':[],'horizons':[1,2,3]}).json()
        self.assertEqual(result['status'],'READY');self.assertEqual(result['method'],'SIX_MONTH_SEASONAL_TREND')
        self.assertEqual([row['horizon'] for row in result['items']],[1,2,3])
if __name__=='__main__':unittest.main()
