"""Package existing frozen artifacts; no freezing, fitting, network or activation."""
from pathlib import Path
import json,hashlib,zipfile,datetime,io
ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'artifacts/reproductions/historical-freeze-20261104T185832Z'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()

def main():
 m=json.loads((RUN/'manifest.json').read_text(encoding='utf8'))
 assert sha(RUN/'manifest.json')==(RUN/'manifest.sha256').read_text().split()[0]
 for name,digest in m['artifacts'].items():assert sha(RUN/name)==digest,name
 stock=Path('C:/DaiHoc/NCKH/ChuoiCungUng/stock_dec2022.csv')
 assert sha(stock)==m['source_hashes'][stock.name]
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 out=ROOT/'artifacts/colab-handoff'/stamp;out.mkdir(parents=True,exist_ok=False)
 validator=r'''"""Portable, read-only preflight. Never calls fit or modifies frozen artifacts."""
from pathlib import Path
import hashlib,json,platform,importlib.metadata as metadata,sys,ctypes

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def check(root):
 root=Path(root).resolve();checks=json.loads((root/'CHECKSUMS.json').read_text(encoding='utf8'))
 for name,digest in checks.items():
  p=(root/name).resolve()
  if not p.is_relative_to(root) or not p.is_file() or sha(p)!=digest:raise RuntimeError('HASH_MISMATCH: '+name)
 run=root/'historical-freeze-20261104T185832Z';m=json.loads((run/'manifest.json').read_text(encoding='utf8'))
 if sha(run/'manifest.json')!=(run/'manifest.sha256').read_text().split()[0]:raise RuntimeError('Manifest checksum mismatch')
 for name,digest in m['artifacts'].items():
  if sha(run/name)!=digest:raise RuntimeError('Original artifact changed: '+name)
 if sha(root/'inputs/stock_dec2022.csv')!=m['source_hashes']['stock_dec2022.csv']:raise RuntimeError('Stock hash mismatch')
 actual={};mismatch=[]
 for package,version in m['environment'].items():
  try:actual[package]=metadata.version(package)
  except metadata.PackageNotFoundError:actual[package]='MISSING'
  if actual[package]!=version:mismatch.append(package)
 if platform.python_version()!=m['python']:mismatch.append('python')
 if sys.platform=='win32':
  class M(ctypes.Structure):
   _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong)]+[(n,ctypes.c_ulonglong) for n in ['total','available','tp','ap','tv','av','ex']]
  s=M();s.length=ctypes.sizeof(s)
  if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s)):raise RuntimeError('Cannot read RAM')
  available=s.available
 else:
  fields={line.split(':')[0]:line.split(':')[1].strip().split()[0] for line in Path('/proc/meminfo').read_text().splitlines()}
  available=int(fields['MemAvailable'])*1024
 result={'hashes':'PASS','python':platform.python_version(),'expected_python':m['python'],'environment':actual,'version_mismatches':mismatch,'available_physical_bytes':available,'required_available_bytes':2147483648,'fit_attempts':m['fit_attempts'],'fit_limit':18,'training_executed':False,'ready':not mismatch and available>=2147483648}
 print(json.dumps(result,indent=2))
 if not result['ready']:raise RuntimeError('PREFLIGHT_BLOCKED: memory/environment; do not train or bypass automatically')
 return result
if __name__=='__main__':check(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent)
'''
 readme='''# Colab handoff — preflight only

The frozen run is copied byte-for-byte. No original artifact is regenerated. No training runner is included in this handoff; the notebook verifies upload/extraction, hashes, exact environment and >=2 GiB available RAM only. Training execution is a subsequent step after owner confirmation to use Colab and review of the checkpoint runner. No cells call fit, activate models, query databases or upload to third parties.

Keep the external ZIP SHA-256 from the local report. Upload manually only after approval. All included data are research data; do not share notebook outputs/public Drive links. No .env, credentials, operational database or unrelated research code is packaged.

Included: all files inventoried by the frozen manifest, manifest and checksum, stock_dec2022.csv for stockout feature construction, plan, environment lock, portable validator. Raw training/product CSV and original notebook are not copied: their hashes were verified locally and provenance is retained; frozen_features contains required feature/target inputs. The original freeze/verification runners are evidence and contain Windows paths; do not run them on Colab or recreate the snapshot.

Versions are from the Windows freezing environment, NOT recovered original Colab training versions. Python must be 3.12.3 in this strict preflight. A differing hosted Colab Python/runtime or unavailable package version stops preflight. Installing the listed versions or choosing a different recorded runtime requires review; do not silently accept mismatches. GPU is not required by the recipe. Do not change n_jobs=-1 or other parameters; only model jobs must be sequential.

Proposed subsequent workflow (maximum 18 fit attempts, failures count):
1. Two Jan17 regressors -> Jan2023 forecast; both 296 trees /31 leaves; specialist hard switch. Revalidate stockout membership against frozen candidate keys and ordered splits before classifier fitting.
2. Ten Hybrid30 regressors -> five pairs March-July2023 with exact mask, .25/.75 blend. Save metrics for March-July and April-July separately.
3. Five Stockout config4 OOF fits plus one finaldev fit; use saved fold/dev order. Pick OOF threshold using the original argmax F1 recipe, never test labels. Report full precision OOF threshold and separate results at .3299; no retuning.
4. Every fit: preflight RAM, durably write started record before fit (counts toward 18), run one model, save weights joblib/native TXT, full params/categories/upstream signature, references; reload inference parity check; atomically publish completed checkpoint and file checksums. Delete model/matrices and gc.collect before next job. Never rerun a started/failed fit automatically. Restart only skips completed jobs whose checkpoint AND outputs verify. Partial artifacts are quarantined, not counted as complete. No two serving fits after July2023.
5. OOM or hash/schema/order/version mismatch: stop, save failure record if possible; hard-kill recovery relies on prewritten started record. Never downsample, change dtypes/precision/parameters, train in parallel, autoactivate or write research databases.

Durability: keep working input snapshot unchanged; save new outputs to a separate execution directory linked to the frozen run hash. Checkpoint to owner-controlled Drive only after owner mounts/authorizes it; verify copied output hashes before reporting a stage durable. A file saved only in /content is temporary and must not be reported as a durable backup. If no durable storage is configured, do not start fits. Keep a single active runner/lease; two notebook copies must not reset the global 18-attempt ledger.
'''
 def md(s):return {'cell_type':'markdown','metadata':{},'source':s.splitlines(True)}
 def code(s):return {'cell_type':'code','metadata':{},'execution_count':None,'outputs':[],'source':s.splitlines(True)}
 nb={'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'}},'cells':[
  md('# Historical reproduction handoff — PREFLIGHT ONLY\nChỉ chạy sau khi chủ dự án xác nhận sử dụng Colab. Notebook không huấn luyện. Giữ ZIP SHA-256 do máy nguồn cung cấp; không lấy hash kỳ vọng từ ZIP vừa upload. Không tự mount Drive hoặc cài thư viện.'),
  code("from pathlib import Path\nimport hashlib, zipfile, importlib.util\nARCHIVE = Path('/content/historical-reproduction-colab.zip')\nEXPECTED_ZIP_SHA256 = ''  # điền hash từ báo cáo máy nguồn\nDEST = Path('/content/historical-reproduction-input')\nassert len(EXPECTED_ZIP_SHA256)==64, 'Thiếu hash ZIP kỳ vọng'\nh=hashlib.sha256()\nwith ARCHIVE.open('rb') as f:\n    for b in iter(lambda:f.read(1048576), b''): h.update(b)\nassert h.hexdigest()==EXPECTED_ZIP_SHA256, 'ZIP hash mismatch'\nassert not DEST.exists(), 'Không ghi đè snapshot đã giải nén; dùng lại sau khi kiểm hash'\nwith zipfile.ZipFile(ARCHIVE) as z:\n    for member in z.infolist():\n        path=(DEST/member.filename).resolve()\n        assert path.is_relative_to(DEST.resolve()), 'Unsafe ZIP path'\n    z.extractall(DEST)\nprint('ZIP verified and extracted; no training')"),
  code("spec=importlib.util.spec_from_file_location('portable_preflight', DEST/'portable_preflight.py')\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nresult=module.check(DEST)  # version/RAM mismatch raises; do not bypass"),
  md('## Dừng sau preflight\nNếu đạt, gửi kết quả môi trường/hash/RAM để tiếp tục bằng runner checkpoint đã được kiểm tra. Chưa có cell train. Cần cấu hình lưu checkpoint bền vững, ledger tối đa 18 attempt và single-runner trước khi bắt đầu. Xem README_COLAB.md và MODEL_REPRODUCTION_PLAN.md. Không chạy freeze_runner.py hoặc verification_runner.py trong bundle để tạo lại dữ liệu.')
 ]}
 # Normalize notebook cell source actual newlines.
 for cell in nb['cells']:cell['source']=''.join(cell['source']).replace('\\n','\n').splitlines(True)
 files={f'{RUN.name}/{name}':RUN/name for name in list(m['artifacts'])+['manifest.json','manifest.sha256']}
 files['inputs/stock_dec2022.csv']=stock
 files['MODEL_REPRODUCTION_PLAN.md']=ROOT/'docs/MODEL_REPRODUCTION_PLAN.md'
 generated={'portable_preflight.py':validator,'README_COLAB.md':readme,'environment.lock.json':json.dumps({'python':m['python'],'packages':m['environment'],'original_training_versions':'UNKNOWN'},indent=2)}
 generated['requirements-reproduction.txt']='\n'.join(p+'=='+v for p,v in m['environment'].items())+'\n'
 # Generated text embedded above uses escaped newlines where appropriate.
 checks={name:sha(path) for name,path in files.items()}
 for name,value in generated.items():checks[name]=hashlib.sha256(value.encode('utf8')).hexdigest()
 generated['CHECKSUMS.json']=json.dumps(checks,indent=2)
 archive=out/'historical-reproduction-colab.zip'
 with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,path in files.items():z.write(path,name)
  for name,value in generated.items():z.writestr(name,value)
 notebook=out/'Historical_Reproduction_Preflight.ipynb';notebook.write_text(json.dumps(nb,ensure_ascii=False,indent=2),encoding='utf8')
 (out/'README_COLAB.md').write_text(readme,encoding='utf8')
 summary={'archive':str(archive.relative_to(ROOT)),'zip_sha256':sha(archive),'zip_bytes':archive.stat().st_size,'notebook_sha256':sha(notebook),'frozen_manifest_sha256':sha(RUN/'manifest.json'),'includes_training_runner':False,'colab_executed':False,'fit_attempts':0}
 (out/'handoff.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
if __name__=='__main__':main()
