'use client';
import {useState} from 'react';
import type {ClassSession} from '@/app/_model/types';
import {makeFixtures,makeSessionFixtures,summarize,type TopicState} from './model';
export function useStudio(session:ClassSession,{sourceQuestions=false}:{sourceQuestions?:boolean}={}){
 const [fixtures]=useState(()=>sourceQuestions?makeSessionFixtures(session):makeFixtures(session));
 const initialCount=sourceQuestions?session.questions.length:100;
 const [count,setCount]=useState(initialCount),[snapshot,setSnapshot]=useState(initialCount);
 const [mode,setMode]=useState<'lecture'|'questions'|'map'>('lecture');
 const [done,setDone]=useState<string[]>([]),[held,setHeld]=useState<string[]>([]);
 const [undoState,setUndo]=useState<{done:string[];held:string[]}|null>(null);
 const [active,setActive]=useState<string|null>(null),[tab,setTab]=useState<TopicState>('waiting');
 const [votes,setVotes]=useState<Record<string,Record<number,'yes'|'no'>>>({});
 const current=fixtures.slice(0,count),topics=summarize(current,done,held);
 const frozen=summarize(fixtures.slice(0,snapshot),[],[]).map(t=>topics.find(item=>item.id===t.id)!).filter(Boolean);
 function save(){setUndo({done:[...done],held:[...held]});}
 function complete(ids:string[]){save();const valid=ids.filter(id=>current.some(q=>q.id===id&&q.status==='unanswered'&&!done.includes(id)));setDone([...new Set([...done,...valid])]);}
 function hold(id:string){save();setHeld([...new Set([...held,id])]);setActive(null);}
 function restore(id:string){save();setHeld(held.filter(x=>x!==id));setDone(done.filter(qid=>!current.some(q=>q.id===qid&&q.topic===id)));setTab('waiting');setActive(id);}
 function vote(topic:string,person:number,value:'yes'|'no'){setVotes(prev=>({...prev,[topic]:{...prev[topic],[person]:value}}));}
 return {fixtures,current,count,snapshot,mode,setMode,done,held,topics,frozen,active,setActive,tab,setTab,votes,vote,
  complete,hold,restore,canUndo:!!undoState,undo:()=>{if(undoState){setDone(undoState.done);setHeld(undoState.held);setUndo(null);}},
  arrive:()=>setCount(c=>Math.min(fixtures.length,c+10)),refresh:()=>setSnapshot(count),
  start:()=>{setSnapshot(count);setMode('questions');setTab('waiting');}};
}
