import Link from 'next/link';
import type {ReactNode} from 'react';
import {PinLogo} from './pin-logo';
import s from './analysis-shell-header.module.css';

export function AnalysisShellHeader({sessionId,title,active,back,actions}:{sessionId:string;title:string;active:'studio'|'report';back:string;actions?:ReactNode}){
 return <header className={s.header}>
  <div className={s.identity}><PinLogo href="/admin/dashboard"/><span className={s.divider}/><div><Link className={s.back} href={back}>← 자료 목록</Link><strong title={title}>{title}</strong></div></div>
  <nav className={s.tabs} aria-label="분석 작업 공간"><Link href={`/admin/session/${sessionId}/qa-studio`} aria-current={active==='studio'?'page':undefined}>QA Studio</Link><Link href={sessionId==='soi-demo'?'/admin/dashboard':`/admin/session/${sessionId}/report`} aria-current={active==='report'?'page':undefined} title={sessionId==='soi-demo'?'실제 자료를 선택해 결과보고서를 확인하세요':undefined}>{sessionId==='soi-demo'?'실제 자료 보고서 ↗':'결과보고서'}</Link></nav>
  <div className={s.actions}>{actions}</div>
 </header>;
}
