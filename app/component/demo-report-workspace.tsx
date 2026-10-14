"use client";
import {useEffect,useState} from 'react';
import {createSoiDemoSession,type SoiDemoSource} from '@/app/_model/soi-demo';
import type {ClassSession} from '@/app/_model/types';
import {GeneratedReportWorkspace} from './generated-report-workspace';
export function DemoReportWorkspace({view}:{view:'studio'|'report'}){
 const [session,setSession]=useState<ClassSession|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/demo/soi/demo-data.json',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('샘플 자료를 불러오지 못했습니다.');return r.json() as Promise<SoiDemoSource>;}).then(data=>{if(!controller.signal.aborted)setSession(createSoiDemoSession(data));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
 if(!session)return <main style={{padding:32}}><p role={error?'alert':'status'}>{error||'샘플 자료를 불러오는 중…'}</p>{error&&<button onClick={()=>location.reload()}>다시 시도</button>}</main>;
 return <GeneratedReportWorkspace source={session} view={view}/>;
}
