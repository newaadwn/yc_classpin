import s from './analysis-charts.module.css';
type Item={label:string;count:number};
const colors=['var(--color-brand)','#8b6bc2','#2e887a','#ba792b','#8993a3'];
export function TypeComposition({items}:{items:Item[]}){
 const total=items.reduce((n,i)=>n+i.count,0);
 if(!total)return <p className={s.empty}>분류할 질문이 없습니다.</p>;
 return <div className={s.composition}><div className={s.stack} aria-hidden="true">{items.map((item,i)=><span key={item.label} style={{width:`${item.count/total*100}%`,background:colors[i%colors.length]}}/>)}</div><div className={s.legend}>{items.map((item,i)=><div key={item.label}><i style={{background:colors[i%colors.length]}}/><span>{item.label}</span><b>{item.count}건</b><small>{Math.round(item.count/total*100)}%</small></div>)}</div></div>;
}
export function AnswerDonut({items}:{items:Item[]}){
 const total=items.reduce((n,i)=>n+i.count,0),done=total-(items[0]?.count??0);let offset=0;
 const palette=['#d49a38','var(--color-brand)','#2e887a'];
 const stops=items.map((item,i)=>{const start=offset;offset+=total?item.count/total*100:0;return `${palette[i]} ${start}% ${offset}%`;});
 return <div className={s.answer}><div className={s.donut} style={{background:total?`conic-gradient(${stops.join(',')})`:'var(--color-border)'}} aria-label={total?`답변 처리 ${Math.round(done/total*100)}퍼센트`:'등록된 질문 없음'}><div><b>{total?`${Math.round(done/total*100)}%`:'—'}</b><small>{total?'답변 처리':'질문 없음'}</small></div></div><div className={s.legend}>{items.map((item,i)=><div key={item.label}><i style={{background:palette[i]}}/><span>{item.label}</span><b>{item.count}건</b></div>)}</div></div>;
}
export function PageHeatmap({items}:{items:Item[]}){
 const max=Math.max(1,...items.map(i=>i.count));const top=[...items].sort((a,b)=>b.count-a.count)[0];
 return <div><div className={s.heatmap} aria-label="페이지 순서별 질문 밀도">{items.slice(0,24).map(item=><span key={item.label} title={`${item.label}페이지 · 질문 ${item.count}건`} style={{background:item.count?`color-mix(in srgb,var(--color-brand) ${20+item.count/max*80}%,var(--color-bg-surface))`:'var(--color-bg-page)',color:item.count/max>.5?'white':'var(--color-text-primary)'}}>{item.label}<small>{item.count}</small></span>)}</div><p className={s.caption}>{top?.count?`최다 ${top.label}페이지 · ${top.count}건`:'등록된 질문 없음'}{items.length>24?` · 첫 24/${items.length}페이지 표시`:''}</p><small className={s.scale}>각 칸: 페이지 / 질문 수 · 진할수록 질문 많음</small></div>;
}
