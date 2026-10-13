"""Opt-in real local inference smoke test; no production data or DB access."""
import json
import time
import urllib.request

if __name__=='__main__':
    questions=[
        {'text':'왜 먼저 게시하기 부담스럽죠?','context':'인터뷰: 첫 게시의 심리적 부담'},
        {'text':'처음 글 올리는 걸 꺼리는 이유가 뭐예요?','context':'인터뷰: 첫 게시의 심리적 부담'},
        {'text':'86%라는 수치는 어디서 나온 건가요?','context':'인터뷰: 50명 설문 결과'},
        {'text':'이 설문 통계의 출처가 궁금해요','context':'인터뷰: 50명 설문 결과'},
        {'text':'잘 모르겠어요','context':'해결방안: 게시 없이 가볍게 반응'},
        {'text':'잘 모르겠어요','context':'이탈 과정: 업로드 감소가 콘텐츠 감소로 이어짐'},
    ]
    started=time.perf_counter()
    req=urllib.request.Request('http://127.0.0.1:8769/question-groups',data=json.dumps({'questions':questions},ensure_ascii=False).encode(),headers={'Origin':'http://127.0.0.1:3000','Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=600) as response:result=json.load(response)
    print(json.dumps(result,ensure_ascii=False),round(time.perf_counter()-started,2),flush=True)
    groups=[set(g) for g in result['groups']]
    assert any({0,1}<=g for g in groups),'Paraphrases were not merged'
    assert any({2,3}<=g for g in groups),'Source requests were not merged'
    assert not any(0 in g and 2 in g for g in groups),'Different answer intents merged'
    assert not any(4 in g and 5 in g for g in groups),'Different referents merged'
    print('Semantic smoke passed')
