"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useSlideUpload } from "@/app/_controller/use-slide-upload";
import { countBy } from "@/app/_model/stats";
import type { ClassSession } from "@/app/_model/types";

type Filter = "all" | ClassSession["status"];

export function useMaterialsController() {
  const { t } = useLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions, ready } = useSessions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start, openSetup, setup } = useSlideUpload();

  const visible = useMemo(
    () => sessions
      .filter((session) => (filter === "all" || session.status === filter) && `${session.title} ${session.fileName}`.toLowerCase().includes(query.toLowerCase()))
      .map((session) => ({ session, open: countBy(session.questions, "unanswered") })),
    [filter, query, sessions]
  );

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  return {
    t,
    ready,
    inputRef,
    sessions,
    filter,
    setFilter,
    query,
    setQuery,
    filters: [
      { key: "all", label: t("common.all") },
      { key: "live", label: t("common.live") },
      { key: "ended", label: t("common.ended") }
    ] as const,
    phase,
    uploadPct,
    uploadError,
    slides,
    total,
    showPreview,
    busy,
    visible,
    pick,
    setup,
    requestUpload: () => openSetup(()=>inputRef.current?.click()),
    openSession: (id: string) => router.push(`/admin/session/${id}`)
  };
}
