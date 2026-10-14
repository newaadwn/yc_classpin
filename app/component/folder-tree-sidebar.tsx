"use client";

import Image from "next/image";
import Link from "next/link";
import projectIcon from "@/assets/icons/project_icon.svg";
import { PanelLeftClose, PanelLeftOpen } from "@/app/component/icons";
import { PinLogo } from "@/app/component/pin-logo";
import { WorkspaceAccount } from "@/app/component/workspace-header";
import { useLanguage } from "@/app/_controller/language-context";
import type { ClassFolder } from "@/app/_model/types";
import styles from "./folder-tree-sidebar.module.css";

export function FolderTreeSidebar({ folders, open, activeFolderId, onToggle }: {
  folders: ClassFolder[];
  open: boolean;
  activeFolderId?: string | null;
  onToggle: () => void;
}) {
  const { t } = useLanguage();

  return (
    <aside className={`${styles.root} folder-tree-sidebar`} aria-label={t("folders.myFolders")}>
      <div className="folder-tree-brand">
        <PinLogo href="/admin/dashboard" />
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={t(open ? "session.collapseFolders" : "session.expandFolders")} title={t(open ? "session.collapseFolders" : "session.expandFolders")}>
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </button>
      </div>
      <nav aria-labelledby="folder-tree-title">
        <div className="folder-tree-heading">
          <Image src={projectIcon} alt="" />
          <b id="folder-tree-title">{t("folders.myFolders")}</b>
          <span>{folders.length}</span>
        </div>
        {folders.length > 0 && <ul className="folder-tree-list">
          {folders.map((folder) => (
            <li key={folder.id}>
              <Link href={`/admin/folders/${folder.id}`} title={folder.name} aria-label={t("folders.openFolder", { name: folder.name })} aria-current={folder.id === activeFolderId ? "page" : undefined}>
                <span className="folder-tree-initial" aria-hidden="true">{[...folder.name][0]}</span>
                <span className="folder-tree-name">{folder.name}</span>
              </Link>
            </li>
          ))}
        </ul>}
      </nav>
      <WorkspaceAccount className="folder-tree-account" />
    </aside>
  );
}
