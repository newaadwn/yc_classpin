"use client";

import Image from "next/image";
import { Pencil, Search, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";
import { LoadingScreen } from "@/app/component/loading-screen";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { SlidePreview } from "@/app/component/slide-preview";
import { UploadProgress } from "@/app/component/upload-progress";
import type { TranslationKey } from "@/app/_model/i18n";
import { CLASS_FOLDER_COLOR_OPTIONS, CLASS_FOLDER_PURPOSE_LABEL_MAX, type ClassFolderPurpose } from "@/app/_model/types";
import { FolderCard } from "./component/folder-card";
import { UNFILED_ID, useDashboardController } from "./controller";
import styles from "./page.module.css";
import {AnalysisSetupDialog} from '@/app/component/analysis-settings';

const folderColorOptions: Array<{ value: number; label: TranslationKey; className: string }> = [
  { value: CLASS_FOLDER_COLOR_OPTIONS[0], label: "folders.colorBlue", className: styles.colorBlue },
  { value: CLASS_FOLDER_COLOR_OPTIONS[1], label: "folders.colorPurple", className: styles.colorPurple },
  { value: CLASS_FOLDER_COLOR_OPTIONS[2], label: "folders.colorOrange", className: styles.colorOrange },
  { value: CLASS_FOLDER_COLOR_OPTIONS[3], label: "folders.colorGreen", className: styles.colorGreen },
  { value: CLASS_FOLDER_COLOR_OPTIONS[4], label: "folders.colorRed", className: styles.colorRed },
];

const folderPurposeOptions: Array<{ value: ClassFolderPurpose; label: TranslationKey; description: TranslationKey }> = [
  { value: "qa", label: "folders.purposeQa", description: "folders.purposeQaDescription" },
  { value: "feedback", label: "folders.purposeFeedback", description: "folders.purposeFeedbackDescription" },
  { value: "education", label: "folders.purposeEducation", description: "folders.purposeEducationDescription" },
  { value: "brainstorming", label: "folders.purposeBrainstorming", description: "folders.purposeBrainstormingDescription" },
  { value: "other", label: "folders.purposeOther", description: "folders.purposeOtherDescription" },
];

export default function DashboardPage() {
  const {
    t, folders, ready, inputRef, folderEditor, folderName, setFolderName, folderColorIndex,
    setFolderColorIndex, folderPurpose, setFolderPurpose, folderPurposeLabel, setFolderPurposeLabel, query, setQuery,
    folderError, savingFolder, deletingFolderId, folderActionError, sidebarOpen, toggleSidebar,
    phase, uploadPct, uploadError, slides, total, showPreview, busy, pick, requestUpload,setup,
    submitFolder, openFolderEditor, closeFolderEditor, removeFolder, visibleSummaries
  } = useDashboardController();

  if (!ready) return <LoadingScreen />;
  const selectedPurpose = folderPurposeOptions.find((option) => option.value === folderPurpose) ?? folderPurposeOptions[0];

  return (
    <main className={`${styles.root} folder-workspace folder-dashboard-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      {setup&&<AnalysisSetupDialog {...setup}/>}
      <FolderTreeSidebar folders={folders} open={sidebarOpen} onToggle={toggleSidebar} />

      <div className="folder-dashboard-content">
        <div className="admin-page folder-dashboard">
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

          <div className="page-head">
            <div><h1>{t("folders.dashboardTitle")}</h1><p>{t("folders.dashboardDescription")}</p></div>
            <div className="folder-dashboard-actions">
              <AdminSearch className="folder-dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("folders.search")} />
              <button type="button" className="btn folder-upload-button" onClick={requestUpload} disabled={busy}><Image src="/assets/icons/upload_icon.svg" alt="" width={34} height={24} />{t("folders.uploadUnfiled")}</button>
              <button type="button" className="btn primary" onClick={() => openFolderEditor("new")}><Image src="/assets/icons/folder_icon.svg" alt="" width={29} height={24} />{t("folders.newFolder")}</button>
            </div>
          </div>

          {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
          {folderActionError && <div className="session-folder-error" role="alert">{folderActionError}</div>}
          {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
          {showPreview && <SlidePreview slides={slides} total={total} />}

          <section className="folder-section" aria-labelledby="folder-list-title">
            <h2 id="folder-list-title" className="sr-only">{t("folders.myFolders")}</h2>
            {visibleSummaries.length ? (
              <div className="folder-grid">
                {visibleSummaries.map((folder) => <FolderCard key={folder.id} folder={folder} deleting={deletingFolderId === folder.id} onRename={folder.id === UNFILED_ID ? undefined : () => openFolderEditor(folder)} onDelete={folder.id === UNFILED_ID ? undefined : () => void removeFolder(folder)} />)}
              </div>
            ) : <div className="panel folder-empty"><Search /><b>{t("folders.noMatch")}</b><span>{t("folders.changeSearch")}</span></div>}
          </section>
        </div>
      </div>

      {folderEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFolderEditor(); }}>
          <section className={`share-modal folder-modal ${folderEditor === "new" ? styles.createModal : ""}`} role="dialog" aria-modal="true" aria-labelledby="folder-editor-title" aria-describedby="folder-editor-description" onKeyDown={(event) => { if (event.key === "Escape") closeFolderEditor(); }}>
            {folderEditor !== "new" && <button type="button" className="modal-close" aria-label={t("folders.closeModal")} onClick={closeFolderEditor} disabled={savingFolder}><X /></button>}
            {folderEditor === "new" ? (
              <header className={styles.createModalHeader}>
                <h2 id="folder-editor-title">{t("folders.newFolderTitle")}</h2>
                <p id="folder-editor-description">{t("folders.newFolderDescription")}</p>
              </header>
            ) : (
              <>
                <span className="modal-icon"><Pencil /></span>
                <h2 id="folder-editor-title">{t("folders.renameTitle")}</h2>
                <p id="folder-editor-description">{t("folders.renameDescription")}</p>
              </>
            )}
            <form className={`folder-form ${folderEditor === "new" ? styles.createForm : ""}`} onSubmit={submitFolder}>
              <label className="folder-field">
                <span>{t("folders.folderName")}</span>
                <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder={t("folders.folderNamePlaceholder")} disabled={savingFolder} />
              </label>
              {folderEditor === "new" && (
                <>
                  <fieldset className={styles.optionGroup}>
                    <legend>{t("folders.folderColor")}</legend>
                    <div className={styles.colorOptions}>
                      {folderColorOptions.map((option) => (
                        <label className={styles.colorOption} key={option.value}>
                          <input className="sr-only" type="radio" name="folder-color" value={option.value} checked={folderColorIndex === option.value} onChange={() => setFolderColorIndex(option.value)} disabled={savingFolder} aria-label={t(option.label)} />
                          <span className={`${styles.colorSwatch} ${option.className}`} aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className={styles.optionGroup} aria-describedby={folderPurpose === "other" ? undefined : "folder-purpose-description"}>
                    <legend>{t("folders.folderPurpose")}</legend>
                    <div className={styles.purposeOptions}>
                      {folderPurposeOptions.map((option) => (
                        <label className={styles.purposeOption} key={option.value}>
                          <input className="sr-only" type="radio" name="folder-purpose" value={option.value} checked={folderPurpose === option.value} onChange={() => setFolderPurpose(option.value)} disabled={savingFolder} />
                          <span>{t(option.label)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {folderPurpose === "other" ? (
                    <input className={styles.purposeLabelInput} value={folderPurposeLabel} onChange={(event) => setFolderPurposeLabel(event.target.value)} maxLength={CLASS_FOLDER_PURPOSE_LABEL_MAX} placeholder={t("folders.purposeOtherLabelPlaceholder")} aria-label={t("folders.purposeOtherLabel")} disabled={savingFolder} />
                  ) : (
                    <p id="folder-purpose-description" className={styles.purposeDescription} aria-live="polite">{t(selectedPurpose.description)}</p>
                  )}
                </>
              )}
              {folderError && <div className="session-folder-error" role="alert">{folderError}</div>}
              <div className="folder-modal-actions">
                <button type="button" className="btn secondary" onClick={closeFolderEditor} disabled={savingFolder}>{t("folders.cancel")}</button>
                <button type="submit" className="btn primary" disabled={savingFolder || !folderName.trim()}>{savingFolder ? <span className="spinner" /> : folderEditor !== "new" && <Pencil />}{savingFolder ? t(folderEditor === "new" ? "folders.creating" : "folders.renaming") : t(folderEditor === "new" ? "folders.create" : "folders.renameSave")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
