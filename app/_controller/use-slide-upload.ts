"use client";

import {analyzeLocalDeck} from "@/app/_service/local-sections";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { convertToSlides } from "@/app/_service/convert";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import { localizeUploadError } from "@/app/_model/i18n";
import type { Slide } from "@/app/_model/types";
import type {AnalysisConfig} from '@/app/_model/lecture-analysis';
import {prepareReview,courseOptions} from '@/app/_service/lecture-analysis-service';

/** idle → uploading(바이트 전송) → processing(서버 렌더링) → 이동 */
export type UploadPhase = "idle" | "uploading" | "processing";

/** 서버 렌더링이 이보다 오래 걸리면 슬라이드를 도착하는 대로 미리 보여준다. */
const PREVIEW_AFTER_MS = 2000;

/** 도착 순서가 뒤섞여 오므로 페이지 번호 순서로 끼워 넣는다. */
function insertByPage(list: Slide[], slide: Slide): Slide[] {
  return [...list, slide].sort((a, b) => a.pageIndex - b.pageIndex);
}

/**
 * 업로드 화면 두 곳이 공유하는 변환 흐름.
 *
 * 업로드 구간은 회선에 좌우돼 길어질 수 있어 진행률 바로 보여주고, 바이트가 다
 * 올라간 뒤(서버 렌더링)에는 진행률을 알 수 없어 부정 진행(processing) 상태로 둔다.
 * 렌더링이 2초를 넘기면 완성된 슬라이드를 도착하는 대로 미리 보여준다.
 */
export function useSlideUpload(folderId: string | null = null) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { createSession, sessions } = useSessions();
  const [setupOpen,setSetupOpen]=useState(false);
  const [fileName,setFileName]=useState('');
  const configuration=useRef<AnalysisConfig|null>(null);
  const pendingFile=useRef<File|undefined>(undefined);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [total, setTotal] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
  };
  useEffect(() => clearTimer, []);

  const start = useCallback(async (file?: File) => {
    if (!file) return;
    if(!configuration.current){pendingFile.current=file;setFileName(file.name);setSetupOpen(true);return;}
    setError(null);
    setUploadPct(0);
    setSlides([]);
    setTotal(0);
    setShowPreview(false);
    setPhase("uploading");
    try {
      const result = await convertToSlides(file, {
        onUploadProgress: (fraction) => {
          setUploadPct(Math.round(fraction * 100));
          if (fraction >= 1) {
            // 마지막 바이트까지 올라가면 이제 서버가 렌더링한다.
            setPhase("processing");
            clearTimer();
            previewTimer.current = setTimeout(() => setShowPreview(true), PREVIEW_AFTER_MS);
          }
        },
        onMeta: (count) => setTotal(count),
        onSlide: (slide) => setSlides((prev) => insertByPage(prev, slide)),
      });
      clearTimer();
      const session = await createSession({ folderId, title: file.name.replace(/\.(pdf|pptx?)$/i, ""), fileName: file.name, slides: result });
      if(configuration.current){
        prepareReview(session,configuration.current);
        void analyzeLocalDeck(session,file,{sessions});
        router.push(`/admin/session/${session.id}/analysis`);
      }else router.push(`/admin/session/${session.id}/qa-studio`);
    } catch (cause) {
      clearTimer();
      setError(cause instanceof Error ? localizeUploadError(locale, cause.message) : t("upload.failed"));
      setPhase("idle");
      setShowPreview(false);
    }
  }, [createSession, folderId, locale, router, t, sessions]);

  const openSetup=(pick:()=>void)=>{configuration.current=null;pendingFile.current=undefined;pick();};
  const setup=setupOpen?{courses:courseOptions(sessions),fileName,onCancel:()=>{setSetupOpen(false);pendingFile.current=undefined;configuration.current=null;},onSubmit:(config:AnalysisConfig)=>{configuration.current=config;setSetupOpen(false);const file=pendingFile.current;pendingFile.current=undefined;if(file)void start(file);}}:null;
  return { phase, uploadPct, error, slides, total, showPreview, busy: phase !== "idle", start, openSetup, setup };
}
