import type {Question} from './types';
import type {QuestionType, SectionQuestionCluster, TeachingSection} from './section-questions';

export type PinFilter = {status:'all'|'open'|'done'; type:'all'|'unknown'|QuestionType};
export type Point = {x:number;y:number};
export const UNASSIGNED = '__unassigned__';
export const SECTION_COLORS = ['var(--viz-cat-facility)','var(--viz-cat-clean)','var(--viz-cat-mobility)','var(--viz-cat-convenience)','var(--viz-cat-safety)','var(--viz-cat-idea)'];
export const isPoint = <T extends Pick<Question,'x'|'y'>>(q:T):q is T & Point => q.x!==null&&q.y!==null&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1;
export const shortCount = (count:number)=>count>99?'99+':String(count);

/** Filter membership, not counts alone; preserve the original cluster identity. */
export function filterPinClusters(clusters:readonly SectionQuestionCluster[],filter:PinFilter) {
  return clusters.flatMap(cluster=>{
    if(filter.type!=='all'&&(cluster.questionType??'unknown')!==filter.type)return [];
    const questions=cluster.questions.filter(q=>filter.status==='all'||(filter.status==='open'?q.original.status==='unanswered':q.original.status!=='unanswered'));
    if(!questions.length)return [];
    return [{...cluster,questions,questionCount:questions.length,representativeQuestion:questions.some(q=>q.original.text===cluster.representativeQuestion)?cluster.representativeQuestion:questions[0].original.text}];
  });
}
export function summarizeSections(sections:readonly TeachingSection[],clusters:readonly SectionQuestionCluster[]) {
  const bySection=new Map<string,SectionQuestionCluster[]>();
  for(const c of clusters){const id=c.sectionId??UNASSIGNED;const list=bySection.get(id)??[];list.push(c);bySection.set(id,list);}
  const rows:{id:string;section:TeachingSection|null;title:string;color:string;number:number;pattern:string}[]=sections.map((section,index)=>({id:section.id,section,title:section.title,color:SECTION_COLORS[index%SECTION_COLORS.length],number:index+1,pattern:index>=SECTION_COLORS.length?'dashed':'solid'}));
  if(bySection.has(UNASSIGNED))rows.push({id:UNASSIGNED,section:null,title:'페이지 전체·섹션 미지정',color:'var(--color-text-secondary)',number:0,pattern:'dashed'});
  return rows.map(row=>{
    const groups=bySection.get(row.id)??[];
    const questions=groups.flatMap(c=>c.questions);
    return {...row,clusters:groups,count:questions.length,open:questions.filter(q=>q.original.status==='unanswered').length,types:Object.fromEntries([...new Set(groups.map(c=>c.questionType??'unknown'))].map(type=>[type,groups.filter(c=>(c.questionType??'unknown')===type).reduce((sum,c)=>sum+c.questionCount,0)]))};
  });
}

/** Only synthetic markers are clamped/displaced. Raw anchors are never changed. */
export function clampToSection(point:Point,section:TeachingSection,width:number,height:number):Point {
  const px=Math.min(24/Math.max(1,width),section.width/2),py=Math.min(24/Math.max(1,height),section.height/2);
  return {x:Math.max(section.x+px,Math.min(section.x+section.width-px,point.x)),y:Math.max(section.y+py,Math.min(section.y+section.height-py,point.y))};
}
export function getClusterMarkerPosition(questions:readonly Question[],section:TeachingSection,width=1000,height=563):Point {
  const points=questions.filter(isPoint);
  const point=points.length?{x:points.reduce((n,q)=>n+q.x,0)/points.length,y:points.reduce((n,q)=>n+q.y,0)/points.length}:{x:section.x+section.width/2,y:section.y+section.height/2};
  return clampToSection(point,section,width,height);
}
export function placeClusterMarkers(clusters:readonly SectionQuestionCluster[],section:TeachingSection,width:number,height:number) {
  const placed:Point[]=[];
  return clusters.map(cluster=>{
    const anchor=getClusterMarkerPosition(cluster.questions.map(q=>q.original),section,width,height);
    const candidates=[anchor];
    for(let ring=1;ring<=5;ring++)for(let i=0;i<12;i++)candidates.push(clampToSection({x:anchor.x+Math.cos(i*Math.PI/6)*ring*48/Math.max(1,width),y:anchor.y+Math.sin(i*Math.PI/6)*ring*48/Math.max(1,height)},section,width,height));
    const distance=(p:Point)=>placed.length?Math.min(...placed.map(q=>Math.hypot((p.x-q.x)*width,(p.y-q.y)*height))):Infinity;
    const point=candidates.find(p=>distance(p)>=48)??candidates.reduce((a,b)=>distance(b)>distance(a)?b:a);
    placed.push(point);
    return {id:cluster.id,cluster,...point,anchor,displaced:Math.hypot((point.x-anchor.x)*width,(point.y-anchor.y)*height)>1};
  });
}
