"use client";
import { useEffect, useState } from "react";
import type { ClassSession } from "@/app/_model/types";
import { sessionRuntime } from "@/app/_model/session-runtime";
import styles from "./session-runtime.module.css";

export function SessionRuntime({ session, presentation = false }: { session: ClassSession; presentation?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0);
    const timer = session.status === "live" ? setInterval(tick, 250) : undefined;
    document.addEventListener("visibilitychange", tick);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [session.id, session.status, session.startedAt, session.endedAt]);
  const value = sessionRuntime(session.startedAt, session.endedAt, session.status === "live", now ?? NaN);
  return <span className={`${styles.timer} ${presentation ? styles.presentation : ""}`} role="timer" aria-live="off" aria-label={`세션 ${session.status === "live" ? "LIVE" : "종료"} 러닝타임 ${value}`} title={session.startedAt ? "세션 시작 후 경과 시간" : "시작 시각 기록 없음"}>{presentation && session.status === "live" && <span className={styles.live}><i aria-hidden="true" />LIVE</span>}<span>러닝타임</span><b>{value}</b>{session.status === "ended" && <small>종료</small>}</span>;
}
