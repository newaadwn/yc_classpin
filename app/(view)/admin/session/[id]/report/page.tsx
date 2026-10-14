'use client';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useSessions} from '@/app/_controller/session-store';
import {GeneratedReportWorkspace} from '@/app/component/generated-report-workspace';
import {DemoReportWorkspace} from '@/app/component/demo-report-workspace';
import s from './page.module.css';
export default function ReportPage(){
 const {id}=useParams<{id:string}>();const {sessions,ready}=useSessions();const session=sessions.find(item=>item.id===id);
 if(id==='soi-demo')return <DemoReportWorkspace view="report"/>;
 if(!ready)return <main className={s.root}>자료를 불러오는 중…</main>;
 if(!session)return <main className={s.root}><h1>자료를 찾을 수 없습니다.</h1><Link href="/admin/dashboard">대시보드로</Link></main>;
 return <GeneratedReportWorkspace key={id} source={session} view="report"/>;
}