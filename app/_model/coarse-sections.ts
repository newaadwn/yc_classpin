import type {Sector} from './question-map';

// Geometric grouping proposals, not semantic inference. Ignore decorative metadata.
export function coarseSections(regions:Sector[]):Sector[]{
 const content=regions.filter(r=>!['header','footer','number','vision_footnote'].includes(r.name)&&r.y+r.h/2>.12&&r.w*r.h>.002);
 if(!content.length)return [];
 const bounds=(rs:Sector[])=>{const x=Math.max(.015,Math.min(...rs.map(r=>r.x))-.012),y=Math.max(.12,Math.min(...rs.map(r=>r.y))-.012);return {x,y,w:Math.min(.985,Math.max(...rs.map(r=>r.x+r.w))+.012)-x,h:Math.min(.98,Math.max(...rs.map(r=>r.y+r.h))+.012)-y};};
 const groups:Sector[][]=[content];
 while(groups.length<3){
  let best:{index:number;score:number;left:Sector[];right:Sector[]}|null=null;
  groups.forEach((group,index)=>{
   for(const axis of ['x','y'] as const){
    const size=axis==='x'?'w':'h';
    const sorted=[...group].sort((a,b)=>a[axis]-b[axis]);
    for(let k=1;k<sorted.length;k++){
     const left=sorted.slice(0,k),right=sorted.slice(k);
     const gap=right[0][axis]-Math.max(...left.map(r=>r[axis]+r[size]));
     if(gap<.035)continue;
     const a=bounds(left),b=bounds(right);
     if(a.w*a.h<.035||b.w*b.h<.035)continue;
     if(!best||gap>best.score)best={index,score:gap,left,right};
    }
   }
  });
  if(!best)break;
  const split=best as {index:number;left:Sector[];right:Sector[]};
  groups.splice(split.index,1,split.left,split.right);
 }
 return groups.map((g,i)=>({id:`core-${i}`,name:`핵심 덩어리 ${i+1}`,...bounds(g)}));
}
