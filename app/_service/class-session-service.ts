import { isParticipantQuestionAnchor, isQuestionMarker, normalizeClassFolderColorIndex, normalizeClassFolderName, normalizeClassFolderPurpose, normalizeClassFolderPurposeLabel, type CreateClassFolderInput, normalizeQuestionCategorySettings, type ClassFolder, type ClassSession, type NormalizedPoint, type Question, type QuestionCategorySettings, type Slide } from "@/app/_model/types";
import { ensureAnonymousUser, getAudienceSupabaseClient, getOwnerWriteSupabaseClient, getSessionUser, getSupabaseClient, supabaseConfigured } from "@/app/_infrastructure/supabase/client";

export const classSessionPersistenceEnabled = supabaseConfigured;

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  join_code: string;
  status: ClassSession["status"];
  started_at: string | null;
  ended_at: string | null;
  current_page: number;
  presentation_interactions: boolean;
  presentation_autoplay: boolean;
  show_question_pins: boolean;
  show_presentation_qr: boolean;
  presentation_qr_position: ClassSession["presentationQrPosition"];
  question_categories: unknown;
  created_at: string;
};

export type LectureRealtimeRow = Pick<LectureRow,
  "presentation_autoplay" | "current_page" | "status" | "started_at" | "ended_at" | "presentation_interactions" | "show_question_pins" |
  "show_presentation_qr" | "presentation_qr_position" | "question_categories"
>;

type ClassFolderRow = {
  id: string;
  name: string;
  created_at: string;
  color_index: number;
  purpose: unknown;
  purpose_label: unknown;
};

type SlideRow = {
  id: string;
  material_version_id: string;
  page_index: number;
  image_path: string;
  image_checksum: string | null;
};

async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type SlideInstructorNoteRow = {
  slide_id: string;
  body: string;
};

type DeletedSlideRow = {
  deleted_image_path: string;
  deleted_page_index: number;
  deleted_question_count: number;
};

type QuestionRow = {
  id: string;
  lecture_id: string;
  slide_id: string | null;
  category: Question["category"];
  marker?: unknown;
  raw_text: string;
  status: Question["status"];
  reaction_count?: number;
  reacted_by_me?: boolean;
  is_mine?: boolean;
  created_at: string;
  region_anchors: {
    kind?: Question["anchorKind"];
    coords?: { x?: number; y?: number; width?: number; height?: number; points?: unknown };
  } | Array<{
    kind?: Question["anchorKind"];
    coords?: { x?: number; y?: number; width?: number; height?: number; points?: unknown };
  }> | null;
  answers: Array<{ body: string; created_at: string }> | null;
};

type OwnedCourseGraphRow = {
  id: string;
  folder_id: string | null;
  lectures: Array<LectureRow & {
    materials: Array<{
      id: string;
      file_name: string;
      created_at: string;
      material_versions: Array<{
        id: string;
        version_no: number;
        slides: Array<SlideRow & {
          slide_instructor_notes: SlideInstructorNoteRow | SlideInstructorNoteRow[] | null;
        }>;
      }>;
    }>;
    questions: QuestionRow[];
  }>;
};

type AudienceLectureGraphRow = LectureRow & {
  materials: Array<{
    id: string;
    file_name: string;
    material_versions: Array<{
      id: string;
      version_no: number;
      slides: SlideRow[];
    }>;
  }>;
};

function toNormalizedPath(value: unknown): NormalizedPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.flatMap((point) => {
    if (!Array.isArray(point) || point.length !== 2) return [];
    const [x, y] = point;
    return typeof x === "number" && typeof y === "number" && x >= 0 && x <= 1 && y >= 0 && y <= 1
      ? [{ x, y }]
      : [];
  });
  return points.length >= 2 ? points : null;
}

/** 코스 개설·답변 같은 강사 전용 쓰기는 구글 로그인 세션을 요구한다. */
async function requireOwnerUser() {
  const user = await getSessionUser();
  if (!user || user.is_anonymous) throw new Error("강사 로그인(Google)이 필요합니다.");
  return user;
}

function toQuestion(row: QuestionRow, sessionId: string, slideIndexById: ReadonlyMap<string, number>): Question {
  const anchorValue = row.region_anchors;
  const anchor = Array.isArray(anchorValue) ? anchorValue[0] : anchorValue;
  const path = toNormalizedPath(anchor?.coords?.points);
  const answerRows = [...(row.answers ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    id: row.id,
    sessionId,
    slideIndex: row.slide_id ? slideIndexById.get(row.slide_id) ?? 0 : 0,
    x: anchor?.coords?.x ?? path?.[0]?.x ?? null,
    y: anchor?.coords?.y ?? path?.[0]?.y ?? null,
    anchorKind: anchor?.kind === "path" && path ? "path" : anchor?.kind === "box" ? "box" : "point",
    width: anchor?.coords?.width ?? null,
    height: anchor?.coords?.height ?? null,
    path,
    category: row.category,
    marker: isQuestionMarker(row.marker) ? row.marker : "pin",
    text: row.raw_text,
    status: row.status,
    answer: answerRows[answerRows.length - 1]?.body,
    isMine: row.is_mine ?? false,
    reactionCount: Math.max(0, row.reaction_count ?? 0),
    reactedByMe: row.reacted_by_me ?? false,
    createdAt: row.created_at
  };
}

function toQuestions(rows: QuestionRow[], sessionId: string, slides: Slide[]): Question[] {
  const slideIndexById = new Map(slides.map((slide) => [slide.id, slide.pageIndex]));
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => toQuestion(row, sessionId, slideIndexById));
}

export async function persistSession(session: ClassSession) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!session.courseId || !session.materialId || !session.materialVersionId) throw new Error("강의 저장 정보가 완전하지 않습니다.");
  const user = await requireOwnerUser();
  const { error: courseError } = await client.from("courses").insert({ id: session.courseId, owner_id: user.id, folder_id: session.folderId, title: session.title, visibility: "link" });
  if (courseError) throw courseError;
  const { error: lectureError } = await client.from("lectures").insert({
    id: session.id,
    course_id: session.courseId,
    title: session.title,
    join_code: session.code,
    status: session.status,
    current_page: session.currentSlide,
    presentation_interactions: session.presentationInteractions,
    presentation_autoplay: session.presentationAutoplay,
    show_question_pins: session.showQuestionPins,
    show_presentation_qr: session.showPresentationQr,
    presentation_qr_position: session.presentationQrPosition,
    question_categories: session.questionCategories,
    started_at: new Date().toISOString()
  });
  if (lectureError) throw lectureError;
  const type = session.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "slide_deck";
  const { error: materialError } = await client.from("materials").insert({ id: session.materialId, course_id: session.courseId, lecture_id: session.id, type, file_name: session.fileName });
  if (materialError) throw materialError;
  const { error: versionError } = await client.from("material_versions").insert({ id: session.materialVersionId, material_id: session.materialId, version_no: 1, source_path: `${user.id}/${session.id}/${session.fileName}` });
  if (versionError) throw versionError;
  const slideRows = [];
  for (const slide of session.slides) {
    // 변환 단계에서 이미 Storage 에 올라온 슬라이드는 그대로 참조한다.
    let imagePath = slide.imagePath ?? "";
    let imageChecksum = slide.imageChecksum ?? null;
    if (!imagePath && slide.imageUrl) {
      imagePath = `${user.id}/${session.id}/${slide.id}.jpg`;
      const image = await fetch(slide.imageUrl).then((response) => response.blob());
      imageChecksum = await sha256Blob(image);
      const { error: uploadError } = await client.storage.from("lecture-slides").upload(imagePath, image, { contentType: image.type || "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
    }
    slideRows.push({ id: slide.id, material_version_id: session.materialVersionId, page_index: slide.pageIndex, image_path: imagePath, image_checksum: imageChecksum });
  }
  const { error: slidesError } = await client.from("slides").insert(slideRows);
  if (slidesError) throw slidesError;
}

const toClassFolder = (folder: ClassFolderRow): ClassFolder => {
  const purpose = normalizeClassFolderPurpose(folder.purpose);
  return {
    id: folder.id,
    name: folder.name,
    createdAt: folder.created_at,
    colorIndex: folder.color_index,
    purpose,
    purposeLabel: normalizeClassFolderPurposeLabel(purpose, folder.purpose_label)
  };
};

export async function fetchOwnedClassFolders(): Promise<ClassFolder[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .select("id, name, created_at, color_index, purpose, purpose_label")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ClassFolderRow[]).map(toClassFolder);
}

export async function createClassFolder(input: CreateClassFolderInput): Promise<ClassFolder> {
  const name = normalizeClassFolderName(input.name);
  const colorIndex = normalizeClassFolderColorIndex(input.colorIndex);
  const purpose = normalizeClassFolderPurpose(input.purpose);
  const purposeLabel = normalizeClassFolderPurposeLabel(purpose, input.purposeLabel);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .insert({ owner_id: user.id, name, color_index: colorIndex, purpose, purpose_label: purposeLabel })
    .select("id, name, created_at, color_index, purpose, purpose_label")
    .single();
  if (error) throw error;
  return toClassFolder(data as ClassFolderRow);
}

export async function renameClassFolder(folderId: string, name: string): Promise<void> {
  const normalizedName = normalizeClassFolderName(name);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .update({ name: normalizedName })
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이름을 바꿀 폴더를 찾지 못했습니다.");
}

export async function deleteClassFolder(folderId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .delete()
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제할 폴더를 찾지 못했습니다.");
}

export async function moveSessionToFolder(courseId: string, folderId: string | null): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("courses")
    .update({ folder_id: folderId })
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이동할 강의 자료를 찾지 못했습니다.");
}

/** 코스와 cascade 데이터를 지운 뒤 더는 참조되지 않는 원본·렌더 이미지를 회수한다. */
export async function deleteClassSession(courseId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data: materialData, error: materialError } = await client.from("materials")
    .select("id")
    .eq("course_id", courseId);
  if (materialError) throw materialError;
  const materialIds = (materialData ?? []).map((material) => material.id as string);

  let sourcePaths: string[] = [];
  let imagePaths: string[] = [];
  if (materialIds.length) {
    const { data: versionData, error: versionError } = await client.from("material_versions")
      .select("id, source_path")
      .in("material_id", materialIds);
    if (versionError) throw versionError;
    const versions = (versionData ?? []) as Array<{ id: string; source_path: string }>;
    sourcePaths = [...new Set(versions.map((version) => version.source_path).filter((path) => path.startsWith(`${user.id}/`)))];
    const versionIds = versions.map((version) => version.id);
    if (versionIds.length) {
      const { data: slideData, error: slideError } = await client.from("slides")
        .select("image_path")
        .in("material_version_id", versionIds);
      if (slideError) throw slideError;
      imagePaths = [...new Set((slideData ?? []).map((slide) => slide.image_path as string).filter((path) => path.startsWith(`${user.id}/`)))];
    }
  }

  const { data, error } = await client.from("courses")
    .delete()
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제할 강의 자료를 찾지 못했습니다.");

  const cleanup = [
    sourcePaths.length ? client.storage.from("course-materials").remove(sourcePaths) : null,
    imagePaths.length ? client.storage.from("lecture-slides").remove(imagePaths) : null
  ].filter((request): request is NonNullable<typeof request> => request !== null);
  const results = await Promise.all(cleanup);
  results.forEach(({ error: storageError }) => {
    // DB 삭제는 이미 끝났다. 재시도로 복구할 수 없는 전체 실패로 보이지 않는다.
    if (storageError) console.error("Deleted class material storage cleanup failed", storageError);
  });
}

const APPENDABLE_SLIDE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SLIDE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SLIDES_PER_APPEND = 20;

export function validateSlideImages(files: readonly File[]) {
  if (files.length < 1 || files.length > MAX_SLIDES_PER_APPEND) throw new Error("슬라이드는 한 번에 1~20장까지 추가할 수 있습니다.");
  if (files.some((file) => !APPENDABLE_SLIDE_TYPES.has(file.type) || file.size > MAX_SLIDE_IMAGE_BYTES)) {
    throw new Error("10MB 이하의 PNG, JPG, WebP 이미지만 추가할 수 있습니다.");
  }
}

/** 기존 자료 버전의 끝에 이미지 슬라이드를 원자적으로 추가한다. */
export async function appendSessionSlides(session: ClassSession, files: File[]): Promise<Slide[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!session.materialVersionId) throw new Error("슬라이드를 추가할 자료 버전을 찾지 못했습니다.");
  validateSlideImages(files);

  const user = await requireOwnerUser();
  const uploadedPaths: string[] = [];
  try {
    const newSlides = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const imagePath = `${user.id}/${session.id}/appended/${id}.${extension}`;
      const imageChecksum = await sha256Blob(file);
      const { error: uploadError } = await client.storage.from("lecture-slides").upload(imagePath, file, {
        contentType: file.type,
        upsert: false
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(imagePath);
      newSlides.push({ id, image_path: imagePath, image_checksum: imageChecksum });
    }

    const { data, error } = await client.rpc("append_lecture_slides", {
      target_material_version_id: session.materialVersionId,
      new_slides: newSlides
    });
    if (error) throw error;
    return ((data ?? []) as SlideRow[])
      .sort((a, b) => a.page_index - b.page_index)
      .map((slide) => ({
        id: slide.id,
        pageIndex: slide.page_index,
        title: `Slide ${slide.page_index + 1}`,
        imagePath: slide.image_path,
        imageChecksum: slide.image_checksum ?? undefined,
        imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
        speakerNote: ""
      }));
  } catch (error) {
    if (uploadedPaths.length) await client.storage.from("lecture-slides").remove(uploadedPaths);
    throw error;
  }
}

/** 슬라이드와 연결 데이터를 DB에서 삭제한 뒤 공개 Storage 객체를 회수한다. */
export async function deleteSessionSlide(slideId: string): Promise<DeletedSlideRow> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.rpc("delete_lecture_slide", { target_slide_id: slideId });
  if (error) throw error;
  const deleted = ((data ?? []) as DeletedSlideRow[])[0];
  if (!deleted) throw new Error("삭제된 슬라이드 정보를 받지 못했습니다.");
  const { error: storageError } = await client.storage.from("lecture-slides").remove([deleted.deleted_image_path]);
  if (storageError) console.error("Deleted slide storage cleanup failed", storageError);
  return deleted;
}

/** Realtime INSERT 뒤 현재 자료 버전의 전체 슬라이드를 다시 읽는다. */
export async function fetchSessionSlides(session: ClassSession, asAudience = false): Promise<Slide[]> {
  if (!session.materialVersionId) return session.slides;
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return session.slides;
  if (asAudience) await ensureAnonymousUser();

  const { data, error } = await client.from("slides")
    .select("id, material_version_id, page_index, image_path, image_checksum")
    .eq("material_version_id", session.materialVersionId)
    .order("page_index", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as SlideRow[];
  const noteBySlide = new Map<string, string>();
  if (!asAudience && rows.length) {
    await requireOwnerUser();
    const { data: noteData, error: noteError } = await client.from("slide_instructor_notes")
      .select("slide_id, body")
      .in("slide_id", rows.map((slide) => slide.id));
    if (noteError) throw noteError;
    ((noteData ?? []) as SlideInstructorNoteRow[]).forEach((note) => noteBySlide.set(note.slide_id, note.body));
  }
  return rows.map((slide) => ({
    id: slide.id,
    pageIndex: slide.page_index,
    title: `Slide ${slide.page_index + 1}`,
    imagePath: slide.image_path,
    imageChecksum: slide.image_checksum ?? undefined,
    imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
    ...(asAudience ? {} : { speakerNote: noteBySlide.get(slide.id) ?? "" })
  }));
}

/** 현재 Google 강사가 소유한 강의 전체를 DB에서 복원한다. */
export async function fetchOwnedSessions(): Promise<ClassSession[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();
  const { data, error } = await client.from("courses").select(`
    id,
    folder_id,
    lectures!inner(
      id,
      course_id,
      title,
      join_code,
      status,
      current_page,
      started_at, ended_at,
      presentation_interactions,
      presentation_autoplay,
      show_question_pins,
      show_presentation_qr,
      presentation_qr_position,
      question_categories,
      created_at,
      materials!materials_lecture_id_fkey(
        id,
        file_name,
        created_at,
        material_versions(
          id,
          version_no,
          slides(
            id,
            material_version_id,
            page_index,
            image_path,
            image_checksum,
            slide_instructor_notes(slide_id, body)
          )
        )
      ),
      questions(
        id,
        lecture_id,
        slide_id,
        category,
        marker,
        raw_text,
        status,
        reaction_count,
        created_at,
        region_anchors(kind, coords),
        answers(body, created_at)
      )
    )
  `)
    .eq("owner_id", user.id)
    .neq("lectures.status", "archived");
  if (error) throw error;

  return ((data ?? []) as unknown as OwnedCourseGraphRow[])
    .flatMap((course) => course.lectures.map((lecture) => ({ course, lecture })))
    .sort((a, b) => b.lecture.created_at.localeCompare(a.lecture.created_at))
    .flatMap(({ course, lecture }) => {
      const material = [...lecture.materials].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const version = material && [...material.material_versions].sort((a, b) => b.version_no - a.version_no)[0];
      if (!material || !version) return [];
      const slides = [...version.slides]
        .sort((a, b) => a.page_index - b.page_index)
        .map((slide): Slide => {
          const noteValue = slide.slide_instructor_notes;
          const note = Array.isArray(noteValue) ? noteValue[0] : noteValue;
          return {
            id: slide.id,
            pageIndex: slide.page_index,
            title: `Slide ${slide.page_index + 1}`,
            imagePath: slide.image_path,
            imageChecksum: slide.image_checksum ?? undefined,
            imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
            speakerNote: note?.body ?? ""
          };
        });
      const questions = toQuestions(lecture.questions, lecture.id, slides);
      return [{
        id: lecture.id,
        folderId: course.folder_id,
        code: lecture.join_code,
        courseId: course.id,
        materialId: material.id,
        materialVersionId: version.id,
        title: lecture.title,
        fileName: material.file_name,
        status: lecture.status,
        startedAt: lecture.started_at,
        endedAt: lecture.ended_at,
        currentSlide: lecture.current_page,
        presentationInteractions: lecture.presentation_interactions,
        presentationAutoplay: lecture.presentation_autoplay,
        showQuestionPins: lecture.show_question_pins,
        showPresentationQr: lecture.show_presentation_qr,
        presentationQrPosition: lecture.presentation_qr_position,
        questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
        createdAt: lecture.created_at,
        slides,
        questions
      }];
    });
}

/** 현재 강사가 소유한 슬라이드의 발표 메모만 생성하거나 갱신한다. */
export async function saveSlideInstructorNote(slideId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { error } = await client.from("slide_instructor_notes").upsert({
    slide_id: slideId,
    body,
    updated_at: new Date().toISOString()
  }, { onConflict: "slide_id" });
  if (error) throw error;
}

export async function fetchLiveSession(joinCode: string): Promise<ClassSession | null> {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data, error } = await client.from("lectures")
    .select(`
      id,
      course_id,
      title,
      join_code,
      status,
      current_page,
      started_at, ended_at,
      presentation_interactions,
      presentation_autoplay,
      show_question_pins,
      show_presentation_qr,
      presentation_qr_position,
      question_categories,
      created_at,
      materials!materials_lecture_id_fkey(
        id,
        file_name,
        material_versions(
          id,
          version_no,
          slides(id, material_version_id, page_index, image_path, image_checksum)
        )
      )
    `)
    .eq("join_code", joinCode.toUpperCase())
    .eq("status", "live")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lecture = data as unknown as AudienceLectureGraphRow;
  const material = lecture.materials[0];
  const version = material && [...material.material_versions].sort((a, b) => b.version_no - a.version_no)[0];
  if (!material || !version) return null;
  const slides: Slide[] = [...version.slides].sort((a, b) => a.page_index - b.page_index).map((slide) => ({
    id: slide.id, pageIndex: slide.page_index, title: `Slide ${slide.page_index + 1}`,
    imagePath: slide.image_path,
    imageChecksum: slide.image_checksum ?? undefined,
    imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl
  }));
  const session: ClassSession = {
    id: lecture.id,
    folderId: null,
    code: lecture.join_code,
    courseId: lecture.course_id,
    materialId: material.id,
    materialVersionId: version.id,
    title: lecture.title,
    fileName: material.file_name,
    status: "live",
    currentSlide: lecture.current_page,
    startedAt: lecture.started_at,
    endedAt: lecture.ended_at,
    presentationInteractions: lecture.presentation_interactions,
    presentationAutoplay: lecture.presentation_autoplay,
    showQuestionPins: lecture.show_question_pins,
    showPresentationQr: lecture.show_presentation_qr,
    presentationQrPosition: lecture.presentation_qr_position,
    questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
    createdAt: lecture.created_at,
    slides,
    questions: []
  };
  const { data: questionData, error: questionError } = await client.rpc("find_lecture_questions", { target_lecture_id: session.id });
  if (questionError) throw questionError;
  return {
    ...session,
    questions: toQuestions(Array.isArray(questionData) ? questionData as unknown as QuestionRow[] : [], session.id, slides)
  };
}

export async function submitQuestion(session: ClassSession, question: Question) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  if (!isParticipantQuestionAnchor(question)) throw new Error("Invalid question anchor.");
  const user = await ensureAnonymousUser();
  if (!user || !session.courseId) throw new Error("Supabase session is missing ownership context.");
  const slide = session.slides[question.slideIndex];
  if (!slide) throw new Error("질문을 남길 슬라이드를 찾지 못했습니다.");
  const { error } = await client.rpc("receive_question", {
    request_id: question.id, target_lecture_id: session.id, target_slide_id: slide.id,
    question_text: question.text, question_category: question.category, question_marker: question.marker,
    target_x: question.x, target_y: question.y
  });
  if (error) throw error;
}

export async function updateQuestion(questionId: string, values: Pick<Question, "category" | "marker" | "text">) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const { data, error } = await client.from("questions")
    .update({ category: values.category, marker: values.marker, raw_text: values.text, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("status", "unanswered")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("수정할 수 있는 질문을 찾지 못했습니다.");
}

/** 참여자 본인의 미답변 질문 PIN 을 같은 자료의 다른 위치·슬라이드로 옮긴다(DB 함수가 권한을 검증). */
export async function moveQuestionPin(session: ClassSession, questionId: string, slideIndex: number, point: NormalizedPoint) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const slide = session.slides[slideIndex];
  if (!slide) throw new Error("PIN을 옮길 슬라이드를 찾지 못했습니다.");
  const { error } = await client.rpc("move_own_question_pin", {
    target_question_id: questionId,
    target_slide_id: slide.id,
    target_x: point.x,
    target_y: point.y
  });
  if (error) throw error;
}

export async function setQuestionReaction(questionId: string, reacted: boolean) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const { error } = await client.rpc("set_question_reaction", {
    target_question_id: questionId,
    target_reacted: reacted
  });
  if (error) throw error;
}

export async function postAnswer(questionId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) return;
  const user = await requireOwnerUser();
  const { error } = await client.from("answers").insert({ question_id: questionId, author_id: user.id, body, visibility: "participants" });
  if (error) throw error;
}

export async function markQuestionResolved(questionId: string) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("questions").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", questionId);
  if (error) throw error;
}

export async function updateLecture(sessionId: string, values: {
  current_page?: number;
  status?: "live" | "ended";
  started_at?: string | null;
  ended_at?: string | null;
  presentation_interactions?: boolean;
  presentation_autoplay?: boolean;
  show_question_pins?: boolean;
  show_presentation_qr?: boolean;
  presentation_qr_position?: ClassSession["presentationQrPosition"];
  question_categories?: QuestionCategorySettings;
}) {
  const client = getOwnerWriteSupabaseClient();
  if (!client) return;
  // The authenticated request is already checked by the lectures owner RLS policy.
  // Asking PostgREST for the affected-row count keeps the write to one request
  // without returning and decoding a row just to detect a missing/denied target.
  const { count, error } = await client.from("lectures")
    .update(values, { count: "exact" })
    .eq("id", sessionId);
  if (error) throw error;
  if (count !== 1) throw new Error("저장할 수 있는 강의를 찾지 못했습니다.");
}

export function subscribeToLecture(
  sessionId: string,
  materialVersionId: string | undefined,
  onQuestionsRefresh: () => void,
  onLectureUpdate: (lecture: LectureRealtimeRow) => void,
  onSlidesRefresh: () => void,
  asAudience = false
): (() => void) | null {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  // Realtime reuses an existing channel with the same topic. React effects can
  // reconnect before an asynchronous removeChannel() has finished, so give
  // every subscription its own topic to avoid mutating a subscribed channel.
  let channel = client.channel(`lecture:${sessionId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `lecture_id=eq.${sessionId}` }, onQuestionsRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${sessionId}` }, (payload) => {
      onLectureUpdate(payload.new as LectureRealtimeRow);
    });
  if (materialVersionId) {
    channel = channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "slides",
      filter: `material_version_id=eq.${materialVersionId}`
    }, onSlidesRefresh);
  }
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

export async function fetchLectureSnapshot(session: ClassSession, asAudience = false): Promise<Pick<ClassSession, "presentationAutoplay" | "currentSlide" | "status" | "startedAt" | "endedAt" | "presentationInteractions" | "showQuestionPins" | "showPresentationQr" | "presentationQrPosition" | "questionCategories" | "questions"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const { data: lecture, error: lectureError } = await client.from("lectures")
    .select("presentation_autoplay, current_page, status, started_at, ended_at, presentation_interactions, show_question_pins, show_presentation_qr, presentation_qr_position, question_categories")
    .eq("id", session.id)
    .maybeSingle();
  if (lectureError) throw lectureError;
  const questionResult = asAudience
    ? await client.rpc("find_lecture_questions", { target_lecture_id: session.id })
    : await client.from("questions")
      .select("id, slide_id, category, marker, raw_text, status, reaction_count, created_at, region_anchors(kind, coords), answers(body, created_at)")
      .eq("lecture_id", session.id)
      .order("created_at", { ascending: false });
  const { data, error } = questionResult;
  if (error) throw error;
  const questions = toQuestions(
    Array.isArray(data) ? data as unknown as QuestionRow[] : [],
    session.id,
    session.slides
  );
  return {
    currentSlide: lecture?.current_page ?? session.currentSlide,
    startedAt: lecture ? lecture.started_at : session.startedAt,
    endedAt: lecture ? lecture.ended_at : session.endedAt,
    status: asAudience && !lecture ? "ended" : (lecture?.status as ClassSession["status"]) ?? session.status,
    presentationInteractions: lecture?.presentation_interactions ?? session.presentationInteractions,
    presentationAutoplay: lecture?.presentation_autoplay ?? session.presentationAutoplay,
    showQuestionPins: lecture?.show_question_pins ?? session.showQuestionPins,
    showPresentationQr: lecture?.show_presentation_qr ?? session.showPresentationQr,
    presentationQrPosition: (lecture?.presentation_qr_position as ClassSession["presentationQrPosition"]) ?? session.presentationQrPosition,
    questionCategories: normalizeQuestionCategorySettings(lecture?.question_categories ?? session.questionCategories),
    questions
  };
}
