import os
from pathlib import Path
import uvicorn
root=Path(__file__).resolve().parent
os.chdir(root)
for line in (root/'.env').read_text(encoding='utf-8-sig').splitlines() if (root/'.env').exists() else []:
    if '=' in line and not line.strip().startswith('#'):
        key,value=line.split('=',1);os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
if __name__=='__main__':uvicorn.run('app.main:app',host=os.getenv('AI_HOST','127.0.0.1'),port=int(os.getenv('AI_PORT','8000')),log_level='info')
