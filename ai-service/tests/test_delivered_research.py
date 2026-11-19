import unittest,pathlib
class DeliveredResearchRegression(unittest.TestCase):
    def test_seasonal_trend_matches_delivered_parquet_and_notebook_reference(self):
        import pandas as pd
        from fastapi.testclient import TestClient
        from app.main import app
        import os
        path=pathlib.Path(__file__).resolve().parents[2]/'data/research/fp_sku_monthly_history.parquet'
        if not path.exists():self.skipTest('Optional delivered research artifact not prepared')
        df=pd.read_parquet(path)
        self.assertEqual(len(df),520809)
        monthly=df.assign(month=pd.to_datetime(df.sale_month).dt.strftime('%Y-%m')).groupby('month').target.sum().sort_index()
        client=TestClient(app);headers={'Authorization':'Bearer '+os.environ['AI_SERVICE_TOKEN']}
        totals={h:[0,0.,0.] for h in [1,2,3]}
        for origin in monthly.index:
            response=client.post('/v1/multi',headers=headers,json={'origin':origin,'history':[{'month':m,'quantity':float(v)} for m,v in monthly.items() if m<=origin],'horizons':[1,2,3]})
            self.assertEqual(response.status_code,200)
            for row in response.json()['items']:
                if row['month'] in monthly.index:
                    bucket=totals[row['horizon']];actual=float(monthly[row['month']]);bucket[0]+=1;bucket[1]+=actual;bucket[2]+=abs(actual-row['quantity'])
        for h,count,reference in [(1,7,76.02),(2,6,77.66),(3,5,72.37)]:
            actual_count,actual,error=totals[h];self.assertEqual(actual_count,count);self.assertAlmostEqual(100-100*error/actual,reference,delta=.005)
