"use client";

import {AnalysisSetupDialog} from "@/app/component/analysis-settings";
import { AdminShell } from "@/app/component/admin-shell";
import { LoadingScreen } from "@/app/component/loading-screen";
import { FileText, MessageCircleQuestion, Plus, Search, Upload } from "@/app/component/icons";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { SlidePreview } from "@/app/component/slide-preview";
import { UploadProgress } from "@/app/component/upload-progress";
import { useMaterialsController } from "./controller";
import styles from "./page.module.css";

export default function MaterialsPage() {
  const {
    t, ready, inputRef, sessions, filter, setFilter, query, setQuery, filters, phase, uploadPct,
    uploadError, slides, total, showPreview, busy, visible, pick, requestUpload, openSession, setup
  } = useMaterialsController();

  if (!ready) return <LoadingScreen />;

  return (
    <AdminShell>
      {setup&&<AnalysisSetupDialog {...setup}/>}
      <div className={`${styles.root} admin-page`}>
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />
        <div className="page-head">
          <div><h1>{t("nav.materials")}</h1><p>{t("materials.description")}</p></div>
          <div className="page-actions"><button className="btn primary" onClick={requestUpload} disabled={busy}>{busy ? <span className="spinner" /> : <Plus />}{busy ? t("materials.converting") : t("materials.upload")}</button></div>
        </div>

        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
        {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
        {showPreview && <SlidePreview slides={slides} total={total} />}

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("materials.search")} /></div>
          <div className="filter-tabs">{filters.map(({ key, label }) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
          <button className="btn secondary" onClick={requestUpload} disabled={busy}><Upload />{t("home.chooseFile")}</button>
        </div>

        {visible.length ? (
          <div className="material-grid">
            {visible.map(({ session, open }) => (
              <button className="material-card" key={session.id} onClick={() => openSession(session.id)}>
                <span className="material-thumb"><SlideCanvas slide={session.slides[0]} compact /><em className={`live-badge ${session.status}`}><i />{session.status === "live" ? t("common.live") : t("common.ended")}</em></span>
                <span className="material-body">
                  <b>{session.title}</b>
                  <small><FileText />{session.fileName}</small>
                  <span className="material-stats"><span><b>{session.slides.length}</b>{t("common.slide")}</span><span><b>{session.questions.length}</b>{t("common.question")}</span><span className={open ? "alert" : ""}><b>{open}</b>{t("status.unanswered")}</span></span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-empty">
              <MessageCircleQuestion />
              <b>{sessions.length ? t("materials.noMatch") : t("materials.none")}</b>
              <span>{sessions.length ? t("materials.changeSearch") : t("materials.emptyHint")}</span>
              {!sessions.length && <button className="btn primary" onClick={requestUpload} disabled={busy}><Upload />{t("materials.upload")}</button>}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
