export const DEFAULT_QUESTION_CATEGORY_KEYS = ["concept", "why", "example", "error", "important"] as const;
export const LEGACY_QUESTION_CATEGORY_KEYS = ["praise", "improve", "confusing", "bug", "idea"] as const;
const BUILT_IN_QUESTION_CATEGORY_KEYS: readonly string[] = [...DEFAULT_QUESTION_CATEGORY_KEYS, ...LEGACY_QUESTION_CATEGORY_KEYS];
export type DefaultQuestionCategory = typeof DEFAULT_QUESTION_CATEGORY_KEYS[number];
export type QuestionCategory = string;
export type QuestionStatus = "unanswered" | "answered" | "resolved";
export type QuestionAnchorKind = "point" | "box" | "path";
export type PresentationQrPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const QUESTION_MARKERS = ["pin", "question", "smile", "idea"] as const;
export type QuestionMarker = typeof QUESTION_MARKERS[number];

export const QUESTION_CATEGORY_LABEL_MAX = 40;
export const QUESTION_CATEGORY_MAX = 20;
const QUESTION_CATEGORY_STORED_MAX = 50;
const QUESTION_CATEGORY_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type QuestionCategorySetting = { label: string; enabled: boolean; archived: boolean };
export type QuestionCategorySettings = Record<string, QuestionCategorySetting>;

export const defaultQuestionCategorySettings = (): QuestionCategorySettings => Object.fromEntries(
  DEFAULT_QUESTION_CATEGORY_KEYS.map((key) => [key, { label: "", enabled: true, archived: false }])
);

export function normalizeQuestionCategorySettings(value: unknown): QuestionCategorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultQuestionCategorySettings();
  const settings: QuestionCategorySettings = {};
  Object.entries(value as Record<string, unknown>).slice(0, QUESTION_CATEGORY_STORED_MAX).forEach(([key, item]) => {
    if (!QUESTION_CATEGORY_KEY.test(key) || !item || typeof item !== "object" || Array.isArray(item)) return;
    const setting = item as Record<string, unknown>;
    const label = typeof setting.label === "string" ? [...setting.label.trim()].slice(0, QUESTION_CATEGORY_LABEL_MAX).join("") : "";
    const builtIn = BUILT_IN_QUESTION_CATEGORY_KEYS.includes(key);
    if (!builtIn && !label) return;
    settings[key] = {
      label,
      enabled: typeof setting.enabled === "boolean" ? setting.enabled : true,
      archived: typeof setting.archived === "boolean" ? setting.archived : false
    };
  });
  if (!Object.values(settings).some((setting) => setting.enabled && !setting.archived)) {
    Object.assign(settings, defaultQuestionCategorySettings());
  }
  return settings;
}

export function isValidQuestionCategorySettings(value: unknown): value is QuestionCategorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  const active = entries.filter(([, item]) => {
    const setting = item as Partial<QuestionCategorySetting> | null;
    return setting?.enabled === true && setting.archived !== true;
  });
  return entries.length <= QUESTION_CATEGORY_STORED_MAX
    && active.length >= 1
    && entries.filter(([, item]) => (item as Partial<QuestionCategorySetting> | null)?.archived !== true).length <= QUESTION_CATEGORY_MAX
    && entries.every(([key, item]) => {
      if (!QUESTION_CATEGORY_KEY.test(key) || !item || typeof item !== "object" || Array.isArray(item)) return false;
      const setting = item as Partial<QuestionCategorySetting>;
      const builtIn = BUILT_IN_QUESTION_CATEGORY_KEYS.includes(key);
      return typeof setting.label === "string"
        && setting.label === setting.label.trim()
        && [...setting.label].length <= QUESTION_CATEGORY_LABEL_MAX
        && (builtIn || setting.label.length > 0)
        && typeof setting.enabled === "boolean"
        && typeof setting.archived === "boolean";
    });
}

export const enabledQuestionCategories = (settings: QuestionCategorySettings) =>
  Object.keys(settings).filter((key) => settings[key].enabled && !settings[key].archived);

export const configuredQuestionCategories = (settings: QuestionCategorySettings) =>
  Object.keys(settings).filter((key) => !settings[key].archived);

export const acceptsQuestionCategory = (settings: QuestionCategorySettings, category: QuestionCategory) =>
  enabledQuestionCategories(settings).includes(category);

export const questionCategoryLabel = (
  settings: QuestionCategorySettings,
  category: QuestionCategory,
  fallback: (category: QuestionCategory) => string
) => settings[category]?.label || fallback(category);

export const questionCategoryClass = (settings: QuestionCategorySettings, category: QuestionCategory) => {
  if (BUILT_IN_QUESTION_CATEGORY_KEYS.includes(category)) return category;
  const custom = Object.keys(settings).filter((key) => !BUILT_IN_QUESTION_CATEGORY_KEYS.includes(key));
  return `custom-${Math.max(0, custom.indexOf(category)) % 5}`;
};

export const isQuestionMarker = (value: unknown): value is QuestionMarker =>
  typeof value === "string" && (QUESTION_MARKERS as readonly string[]).includes(value);

export const questionMarkerEmoji = (marker: QuestionMarker): string | null =>
  marker === "question" ? "❓" : marker === "smile" ? "🙂" : marker === "idea" ? "💡" : null;

export interface NormalizedPoint {
  x: number;
  y: number;
}

/** admin = 구글 로그인 강사, participant = QR 익명 수강생 */
export type UserRole = "admin" | "participant";

export interface Profile {
  id: string;
  role: UserRole;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export const CLASS_FOLDER_NAME_MAX = 80;
export const CLASS_FOLDER_COLOR_COUNT = 6;
export const CLASS_FOLDER_DEFAULT_COLOR_INDEX = 2;
export const CLASS_UNFILED_COLOR_INDEX = CLASS_FOLDER_DEFAULT_COLOR_INDEX;
export const CLASS_FOLDER_COLOR_OPTIONS = [2, 3, 1, 5, 0] as const;
export const CLASS_FOLDER_PURPOSES = ["qa", "feedback", "education", "brainstorming", "other"] as const;
export type ClassFolderPurpose = typeof CLASS_FOLDER_PURPOSES[number];
export const CLASS_FOLDER_DEFAULT_PURPOSE: ClassFolderPurpose = "qa";
export const CLASS_FOLDER_PURPOSE_LABEL_MAX = 40;

export function normalizeClassFolderName(value: string) {
  const name = value.trim();
  const length = [...name].length;
  if (length < 1 || length > CLASS_FOLDER_NAME_MAX) {
    throw new Error(`폴더 이름은 1~${CLASS_FOLDER_NAME_MAX}자로 입력해 주세요.`);
  }
  return name;
}

export function classFolderColorIndexForOrder(index: number) {
  return (Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0) % CLASS_FOLDER_COLOR_COUNT;
}

export function normalizeClassFolderColorIndex(value: unknown, fallbackIndex = CLASS_FOLDER_DEFAULT_COLOR_INDEX) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < CLASS_FOLDER_COLOR_COUNT
    ? value
    : classFolderColorIndexForOrder(fallbackIndex);
}

export function normalizeClassFolderPurpose(value: unknown): ClassFolderPurpose {
  return typeof value === "string" && (CLASS_FOLDER_PURPOSES as readonly string[]).includes(value)
    ? value as ClassFolderPurpose
    : CLASS_FOLDER_DEFAULT_PURPOSE;
}

/** 직접 입력한 카테고리 이름은 `기타` 목적에서만 유지한다. */
export function normalizeClassFolderPurposeLabel(purpose: ClassFolderPurpose, value: unknown): string | null {
  if (purpose !== "other" || typeof value !== "string") return null;
  const label = [...value.trim()].slice(0, CLASS_FOLDER_PURPOSE_LABEL_MAX).join("");
  return label || null;
}

export interface CreateClassFolderInput {
  name: string;
  colorIndex: number;
  purpose: ClassFolderPurpose;
  /** `기타` 목적에서 직접 입력한 카테고리 이름. 다른 목적에서는 사용하지 않는다. */
  purposeLabel?: string | null;
}

export interface ClassFolder {
  id: string;
  name: string;
  createdAt: string;
  colorIndex: number;
  purpose: ClassFolderPurpose;
  /** `기타` 목적에서 직접 입력한 카테고리 이름. 다른 목적에서는 null이다. */
  purposeLabel?: string | null;
}

export interface Slide {
  id: string;
  pageIndex: number;
  title: string;
  imageUrl?: string;
  /** lecture-slides 버킷 안의 경로. 변환 단계에서 이미 올라간 이미지를 가리킨다. */
  imagePath?: string;
  /** 업로드한 이미지 bytes의 SHA-256. AI snapshot에서 원본 교체를 탐지한다. */
  imageChecksum?: string;
  /** 강의자 전용 발표 메모. 청중 세션 조회에는 포함하지 않는다. */
  speakerNote?: string;
}

export interface Question {
  id: string;
  sessionId: string;
  slideIndex: number;
  x: number | null;
  y: number | null;
  anchorKind?: QuestionAnchorKind;
  width?: number | null;
  height?: number | null;
  path?: NormalizedPoint[] | null;
  category: QuestionCategory;
  marker: QuestionMarker;
  text: string;
  status: QuestionStatus;
  answer?: string;
  /** 공개 참여자 조회에서만 계산된다. 작성자 UUID 자체는 노출하지 않는다. */
  isMine: boolean;
  reactionCount: number;
  reactedByMe: boolean;
  createdAt: string;
}

type QuestionAnchor = Pick<Question, "anchorKind" | "x" | "y" | "width" | "height" | "path">;

export type ParticipantQuestionInput = Pick<Question, "slideIndex" | "category" | "marker" | "text"> & {
  /** Reused when retrying an uncertain submission. */
  requestId?: string;
  anchorKind: "point";
  x: number | null;
  y: number | null;
  width: null;
  height: null;
  path: null;
};

export function isParticipantQuestionAnchor(anchor: QuestionAnchor) {
  return isParticipantPointAnchor(anchor) || (anchor.anchorKind === "point"
    && anchor.x === null && anchor.y === null
    && anchor.width == null && anchor.height == null && anchor.path == null);
}

export function isParticipantPointAnchor(anchor: QuestionAnchor) {
  return anchor.anchorKind === "point"
    && typeof anchor.x === "number" && Number.isFinite(anchor.x) && anchor.x >= 0 && anchor.x <= 1
    && typeof anchor.y === "number" && Number.isFinite(anchor.y) && anchor.y >= 0 && anchor.y <= 1
    && anchor.width == null && anchor.height == null && anchor.path == null;
}

export interface ClassSession {
  id: string;
  folderId: string | null;
  courseId?: string;
  materialId?: string;
  materialVersionId?: string;
  code: string;
  title: string;
  fileName: string;
  status: "live" | "ended";
  startedAt?: string | null;
  endedAt?: string | null;
  currentSlide: number;
  presentationInteractions: boolean;
  presentationAutoplay: boolean;
  showQuestionPins: boolean;
  showPresentationQr: boolean;
  presentationQrPosition: PresentationQrPosition;
  questionCategories: QuestionCategorySettings;
  createdAt: string;
  slides: Slide[];
  questions: Question[];
}
