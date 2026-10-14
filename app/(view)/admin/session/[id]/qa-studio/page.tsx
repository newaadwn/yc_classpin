"use client";
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useSessions} from '@/app/_controller/session-store';
import {GeneratedReportWorkspace} from '@/app/component/generated-report-workspace';
import {DemoReportWorkspace} from '@/app/component/demo-report-workspace';
export default function Page(){
 const {id}=useParams<{id:string}>();const {sessions,ready}=useSessions();
 if(id==='soi-demo')return <DemoReportWorkspace view="studio"/>;
 if(!ready)return <main>자료를 불러오는 중…</main>;
 const session=sessions.find(s=>s.id===id);
 if(!session)return <main>자료를 찾을 수 없습니다. <Link href="/admin/dashboard">대시보드</Link></main>;
 return <GeneratedReportWorkspace key={id} source={session} view="studio"/>;
}
