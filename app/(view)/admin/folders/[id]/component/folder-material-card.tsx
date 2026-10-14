"use client";

import { Folder, MoreHorizontal, Trash2 } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { countBy } from "@/app/_model/stats";
import type { ClassFolder, ClassSession } from "@/app/_model/types";
import styles from "./folder-material-card.module.css";

export function FolderMaterialCard({ session, folders, view, moving, selected, onSelect, onMove, onDelete }: {
  session: ClassSession;
  folders: ClassFolder[];
  view: "grid" | "list";
  moving: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (folderId: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const unanswered = countBy(session.questions, "unanswered");

  return (
    <article className={`${styles.root} ${styles[view]} ${selected ? styles.selected : ""}`}>
      <button type="button" className={styles.link} aria-label={t("folders.selectMaterial", { title: session.title })} aria-pressed={selected} aria-controls="folder-material-detail" onClick={onSelect}>
        <span className={styles.thumb}>{session.slides[0] && <SlideCanvas slide={session.slides[0]} compact />}</span>
        <span className={styles.body}>
          <b title={session.title}>{session.title}</b>
          <small title={session.fileName}>{session.fileName}</small>
          <span className={styles.stats}>
            <span><b>{session.slides.length}</b>{t("common.slide")}</span>
            <span><b>{session.questions.length}</b>{t("common.question")}</span>
            <span><b>{unanswered}</b>{t("status.unanswered")}</span>
          </span>
        </span>
      </button>

      <details className={styles.menu} name="material-card-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary className={`icon-btn ${styles.menuTrigger}`} aria-label={`${session.title}: ${t("folders.moveTo")}`} title={t("folders.moveTo")} aria-disabled={moving} onClick={(event) => { if (moving) event.preventDefault(); }}>{moving ? <span className="spinner dark" /> : <MoreHorizontal />}</summary>
        <div className={styles.popover}>
          <label>
            <span><Folder />{t("folders.moveTo")}</span>
            <select value={session.folderId ?? ""} aria-label={t("folders.moveMaterial", { title: session.title })} disabled={moving} onChange={(event) => onMove(event.target.value)}>
              <option value="">{t("folders.unfiled")}</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <button type="button" className={styles.destructive} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}><Trash2 />{t("materials.deleteConfirm")}</button>
        </div>
      </details>
    </article>
  );
}
