"use client";

import Link from "next/link";
import { Folder, MoreHorizontal, Pencil, Trash2 } from "@/app/component/icons";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { useLanguage } from "@/app/_controller/language-context";
import type { FolderSummary } from "@/app/_model/stats";
import styles from "./folder-card.module.css";

const accentClasses = [styles.accent0, styles.accent1, styles.accent2, styles.accent3, styles.accent4, styles.accent5];

export function FolderCard({ folder, deleting, onRename, onDelete }: {
  folder: FolderSummary;
  deleting: boolean;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <article className={`${styles.root} ${accentClasses[folder.colorIndex] ?? styles.accent2}`}>
      <Link className={styles.link} href={`/admin/folders/${folder.id}`} aria-label={t("folders.openFolder", { name: folder.name })}>
        <span className={styles.visual} aria-hidden="true">
          <span className={styles.paper} />
          <span className={`${styles.cover} ${folder.cover ? "" : styles.empty}`}>
            {folder.cover ? <SlideCanvas slide={folder.cover} compact /> : <Folder />}
          </span>
        </span>
        <span className={styles.body}>
          <span className={styles.title}><b>{folder.name}</b></span>
          <span className={styles.stats}>
            <span><b>{folder.materialCount}</b>{t("folders.materials")}</span>
          </span>
        </span>
      </Link>
      {onRename && onDelete && (
        <details className={styles.menu} name="folder-card-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary className={`icon-btn ${styles.menuTrigger}`} aria-label={t("folders.folderMenu", { name: folder.name })} title={t("folders.folderMenu", { name: folder.name })} aria-disabled={deleting} onClick={(event) => { if (deleting) event.preventDefault(); }}>{deleting ? <span className="spinner dark" /> : <MoreHorizontal />}</summary>
          <div className={styles.popover}>
            <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onRename(); }}><Pencil />{t("folders.rename")}</button>
            <button type="button" className={styles.destructive} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}><Trash2 />{t("folders.delete")}</button>
          </div>
        </details>
      )}
    </article>
  );
}
