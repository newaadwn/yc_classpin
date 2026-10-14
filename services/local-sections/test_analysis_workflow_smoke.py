"""Real local HTTP/model smoke. Synthetic slide elements, no mocked inference."""
import json
import time
import urllib.request
import sys

elements=[
    dict(id=0,kind='text',text='Convolution: apply a small kernel to the image to extract local features.',box=[.05,.15,.44,.4]),
    dict(id=1,kind='image',text='Convolution diagram: 3x3 kernel moves over the input image.',box=[.55,.15,.94,.4]),
    dict(id=2,kind='text',text='Pooling: reduce spatial resolution and computation using local aggregation.',box=[.05,.55,.44,.85]),
    dict(id=3,kind='image',text='Max Pooling diagram: a 2x2 patch becomes its maximum value.',box=[.55,.55,.94,.85]),
]
def post(endpoint,payload):
    request=urllib.request.Request('http://127.0.0.1:8769/'+endpoint,data=json.dumps(payload).encode(),headers={'Origin':'http://127.0.0.1:3000','Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=600) as response:return json.load(response)

if __name__=='__main__':
    from test_pptx_layout import NativeLayoutTests
    shape='<p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="300" cy="200"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Pooling</a:t></a:r></a:p></p:txBody></p:sp>'
    request=urllib.request.Request('http://127.0.0.1:8769/pptx-layout',data=NativeLayoutTests().make(shape),headers={'Origin':'http://127.0.0.1:3000','Content-Type':'application/octet-stream'})
    with urllib.request.urlopen(request,timeout=30) as response: native=json.load(response)
    assert native['pages'][0]['elements'][0]['box']==[.1,.2,.4,.6]
    print('PASS: real PPTX bytes -> native HTTP elements and normalized coordinates',flush=True)
    if '--native-only' in sys.argv:sys.exit(0)
    for granularity in ('coarse','fine'):
        config=dict(granularity=granularity,studentLevel='beginner',field='engineering_it',purposes=['concept'],focusElements=['concept','image'],language='ko',keyConcepts=['Convolution','Pooling'])
        payload=dict(elements=elements,config=config,previous=[])
        candidates=post('layout-candidates',payload)['candidates']
        started=time.perf_counter()
        result=post('native-sections',payload)
        assert result['status']=='complete' and result['sections']
        assert len(result['sections'])<=({'coarse':3,'fine':10}[granularity])
        assert len(result['sections'])==({'coarse':2,'fine':4}[granularity]),'Check semantic quality on this explicit two-topic fixture'
        assert all(any(e['text'] in s['text'] for s in result['sections']) for e in elements),'Content must not be omitted'
        print(json.dumps(dict(granularity=granularity,candidates=len(candidates),sections=result['sections'],seconds=round(time.perf_counter()-started,1)),ensure_ascii=True),flush=True)
