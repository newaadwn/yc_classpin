"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useSlideUpload } from "@/app/_controller/use-slide-upload";
import { summarizeFolders, type FolderSummary } from "@/app/_model/stats";
import { CLASS_FOLDER_DEFAULT_COLOR_INDEX, CLASS_FOLDER_DEFAULT_PURPOSE, CLASS_UNFILED_COLOR_INDEX, type ClassFolderPurpose } from "@/app/_model/types";

export const UNFILED_ID = "unfiled";

export function useDashboardController() {
  const { t } = useLanguage();
  const { folders, sessions, createFolder, renameFolder, deleteFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderEditor, setFolderEditor] = useState<"new" | { id: string; name: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColorIndex, setFolderColorIndex] = useState(CLASS_FOLDER_DEFAULT_COLOR_INDEX);
  const [folderPurpose, setFolderPurpose] = useState<ClassFolderPurpose>(CLASS_FOLDER_DEFAULT_PURPOSE);
  const [folderPurposeLabel, setFolderPurposeLabel] = useState("");
  const [query, setQuery] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start,openSetup,setup } = useSlideUpload(null);

  const visibleSummaries = useMemo(() => {
    const summaries = summarizeFolders(folders, sessions, {
      id: UNFILED_ID,
      name: t("folders.unfiled"),
      createdAt: "",
      colorIndex: CLASS_UNFILED_COLOR_INDEX,
      purpose: CLASS_FOLDER_DEFAULT_PURPOSE
    });
    const needle = query.trim().toLocaleLowerCase();
    return needle ? summaries.filter((folder) => folder.name.toLocaleLowerCase().includes(needle)) : summaries;
  }, [folders, query, sessions, t]);

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderEditor) return;
    setFolderError(null);
    setSavingFolder(true);
    try {
      if (folderEditor === "new") await createFolder({ name: folderName, colorIndex: folderColorIndex, purpose: folderPurpose, purposeLabel: folderPurposeLabel });
      else await renameFolder(folderEditor.id, folderName);
      setFolderName("");
      setFolderEditor(null);
    } catch {
      setFolderError(t(folderEditor === "new" ? "folders.createError" : "folders.renameError"));
    } finally {
      setSavingFolder(false);
    }
  };

  const openFolderEditor = (folder: "new" | { id: string; name: string }) => {
    setFolderError(null);
    setFolderName(folder === "new" ? "" : folder.name);
    if (folder === "new") {
      setFolderColorIndex(CLASS_FOLDER_DEFAULT_COLOR_INDEX);
      setFolderPurpose(CLASS_FOLDER_DEFAULT_PURPOSE);
      setFolderPurposeLabel("");
    }
    setFolderEditor(folder);
  };

  const closeFolderEditor = () => {
    if (!savingFolder) setFolderEditor(null);
  };

  const removeFolder = async (folder: FolderSummary) => {
    if (deletingFolderId || !window.confirm(t("folders.deleteConfirm", { name: folder.name, count: folder.materialCount }))) return;
    setDeletingFolderId(folder.id);
    setFolderActionError(null);
    try {
      await deleteFolder(folder.id);
    } catch (error) {
      console.error("Class folder deletion failed", error);
      setFolderActionError(t("folders.deleteError"));
    } finally {
      setDeletingFolderId(null);
    }
  };

  return {
    t,
    folders,
    ready,
    inputRef,
    folderEditor,
    folderName,
    setFolderName,
    folderColorIndex,
    setFolderColorIndex,
    folderPurpose,
    setFolderPurpose,
    folderPurposeLabel,
    setFolderPurposeLabel,
    query,
    setQuery,
    folderError,
    savingFolder,
    deletingFolderId,
    folderActionError,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    phase,
    uploadPct,
    uploadError,
    slides,
    total,
    showPreview,
    busy,
    pick,
    setup,
    requestUpload: () => openSetup(()=>inputRef.current?.click()),
    submitFolder,
    openFolderEditor,
    closeFolderEditor,
    removeFolder,
    visibleSummaries
  };
}
