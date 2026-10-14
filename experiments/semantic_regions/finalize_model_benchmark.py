"""Preserve the RGB EasyOCR trial, then rerun only its corrected BGR pipeline."""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path


def main():
    source=Path('output/model-benchmark-cpu-v1')
    destination=Path('output/model-benchmark-final-v1')
    if destination.exists():raise FileExistsError('Preserve previous final run')
    deadline=time.monotonic()+7200
    while time.monotonic()<deadline:
        path=source/'results.json'
        if path.exists():
            try:data=json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:time.sleep(2);continue
            if len(data['runs'])==7 and all(r['status'] in {'complete','screened-out'} for r in data['runs']):break
        time.sleep(2)
    else:raise TimeoutError('Primary run did not finish')
    destination.mkdir()
    for engine in ('tesseract','paddleocr','ppv3','pps','florence'):
        shutil.copytree(source/engine,destination/engine)
    for filename in ('protocol.json','inventory.json','base.json','ocr-paddle.json',
                     'layout-small.json','layout-florence.json','llm-small.json','llm-granite.json'):
        shutil.copyfile(source/filename,destination/filename)
    (destination/'correction.json').write_text(json.dumps({
        'reason':'EasyOCR ndarray RGB/BGR mismatch corrected; old OCR and its report excluded.',
        'preservedOriginal':str(source),'corrected':'easyocr + ocr-easy',
        'reused':'All other completed sequential CPU measurements, unchanged.',
        'scope':'5 complete report combinations, 2 layout-stage exclusions; no production mutation.'
    },ensure_ascii=False,indent=2),encoding='utf-8')
    subprocess.run([sys.executable,str(Path(__file__).with_name('model_benchmark.py')),'--output',str(destination)],check=True)
    print('Corrected model benchmark finished',flush=True)


if __name__=='__main__':main()
