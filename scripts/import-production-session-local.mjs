import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const localUrl = process.env.SUPABASE_URL;
const localSecret = process.env.SUPABASE_SECRET_KEY;
const workerUrl = (process.env.AI_REPORT_LOCAL_WORKER_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
if (!localUrl || !localSecret || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(localUrl)) {
  throw new Error("This importer only accepts a local Supabase URL and requires its secret key.");
}

const encodedPayload = process.env.AI_REPORT_IMPORT_PAYLOAD_BASE64;
let inputLine;
if (encodedPayload) {
  inputLine = Buffer.from(encodedPayload, "base64").toString("utf8");
} else {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  inputLine = await new Promise((resolve, reject) => {
    lines.once("line", (line) => { resolve(line); lines.close(); });
    lines.on("error", reject);
  });
}
const input = JSON.parse(inputLine ?? "null");
if (!input || typeof input !== "object" || !Array.isArray(input.slides) || input.slides.length < 1 || input.slides.length > 300) {
  throw new Error("Invalid imported session payload.");
}
if (typeof input.sourceProjectUrl !== "string" || !input.sourceProjectUrl.startsWith("https://")) {
  throw new Error("A production Supabase HTTPS URL is required.");
}

const client = createClient(localUrl, localSecret, { auth: { persistSession: false, autoRefreshToken: false } });
const ensure = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const latestReport = ensure(await client.from("ai_reports")
  .select("owner_id")
  .eq("status", "ready")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle(), "find local instructor");
if (!latestReport?.owner_id) throw new Error("Create a local instructor fixture before importing a production session.");
const ownerId = latestReport.owner_id;

const folderId = randomUUID();
const courseId = randomUUID();
const lectureId = randomUUID();
const materialId = randomUUID();
const versionId = randomUUID();
const uploadedPaths = [];
const slideRows = [];
const anchorRows = [];
const questionRows = [];
const answerRows = [];
const imageChecksums = [];

ensure(await client.from("session_folders").insert({ id: folderId, owner_id: ownerId, name: "SOi 전체 분석" }), "insert folder");
ensure(await client.from("courses").insert({ id: courseId, owner_id: ownerId, folder_id: folderId, title: input.courseTitle || input.lectureTitle || "SOi" }), "insert course");
ensure(await client.from("lectures").insert({
  id: lectureId,
  course_id: courseId,
  title: input.lectureTitle || "SOi",
  join_code: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
  status: "ended",
}), "insert lecture");
ensure(await client.from("materials").insert({ id: materialId, course_id: courseId, lecture_id: lectureId, type: "pdf", file_name: input.fileName || "SOi.pdf" }), "insert material");

for (const sourceSlide of [...input.slides].sort((a, b) => a.pageIndex - b.pageIndex)) {
  if (!Number.isInteger(sourceSlide.pageIndex) || typeof sourceSlide.imagePath !== "string" || sourceSlide.imagePath.includes("..")) {
    throw new Error("Invalid source slide.");
  }
  const sourceUrl = `${input.sourceProjectUrl.replace(/\/$/, "")}/storage/v1/object/public/lecture-slides/${sourceSlide.imagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`download slide ${sourceSlide.pageIndex + 1}: HTTP ${response.status}`);
  const image = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha256").update(image).digest("hex");
  const slideId = randomUUID();
  const imagePath = `${ownerId}/${lectureId}/${slideId}.jpg`;
  ensure(await client.storage.from("lecture-slides").upload(imagePath, image, { contentType: response.headers.get("content-type") || "image/jpeg" }), `upload slide ${sourceSlide.pageIndex + 1}`);
  uploadedPaths.push(imagePath);
  imageChecksums.push(checksum);
  slideRows.push({
    id: slideId,
    material_version_id: versionId,
    page_index: sourceSlide.pageIndex,
    image_path: imagePath,
    image_checksum: checksum,
    width_px: sourceSlide.widthPx ?? null,
    height_px: sourceSlide.heightPx ?? null,
  });

  for (const sourceQuestion of sourceSlide.questions ?? []) {
    const questionId = randomUUID();
    let regionId = null;
    if (sourceQuestion.anchor?.kind && sourceQuestion.anchor?.coords) {
      regionId = randomUUID();
      anchorRows.push({
        id: regionId,
        slide_id: slideId,
        material_version_id: versionId,
        kind: sourceQuestion.anchor.kind,
        coords: sourceQuestion.anchor.coords,
        created_by: "user",
      });
    }
    questionRows.push({
      id: questionId,
      course_id: courseId,
      lecture_id: lectureId,
      slide_id: slideId,
      region_id: regionId,
      author_id: null,
      is_anonymous: true,
      category: sourceQuestion.category || "concept",
      raw_text: sourceQuestion.text,
      status: sourceQuestion.status || "unanswered",
      marker: sourceQuestion.marker || (regionId ? "pin" : "question"),
      reaction_count: Number.isInteger(sourceQuestion.reactionCount) ? sourceQuestion.reactionCount : 0,
      created_at: sourceQuestion.createdAt,
      updated_at: sourceQuestion.updatedAt,
    });
    for (const answer of sourceQuestion.answers ?? []) {
      answerRows.push({
        id: randomUUID(),
        question_id: questionId,
        author_id: ownerId,
        body: answer.body,
        visibility: answer.visibility || "public",
        is_ai_generated: Boolean(answer.isAiGenerated),
        created_at: answer.createdAt,
      });
    }
  }
}

const versionChecksum = createHash("sha256").update(imageChecksums.join(":"), "utf8").digest("hex");
ensure(await client.from("material_versions").insert({ id: versionId, material_id: materialId, version_no: 1, source_path: `${ownerId}/${lectureId}/imported-source.pdf`, checksum: versionChecksum }), "insert version");
ensure(await client.from("slides").insert(slideRows), "insert slides");
if (anchorRows.length) ensure(await client.from("region_anchors").insert(anchorRows), "insert anchors");
if (questionRows.length) ensure(await client.from("questions").insert(questionRows), "insert questions");
if (answerRows.length) ensure(await client.from("answers").insert(answerRows), "insert answers");

const inspection = ensure(await client.rpc("inspect_ai_report_selection", {
  target_owner_id: ownerId,
  target_selection_kind: "material",
  target_folder_id: folderId,
  target_material_ids: [materialId],
}), "inspect selection");
const snapshot = ensure(await client.rpc("create_ai_report_snapshot", {
  target_owner_id: ownerId,
  target_selection_kind: "material",
  target_folder_id: folderId,
  target_material_ids: [materialId],
  target_expected_source_fingerprint: inspection.sourceFingerprint,
  target_idempotency_key: `production-copy-${randomUUID()}`,
  target_request_hash: createHash("sha256").update(randomUUID()).digest("hex"),
  target_model_fingerprint: "fake:local:fake-generation:fake/generation-v1:fake-critic:fake/critic-v1",
  target_prompt_version: "ai-report-prompts.v1",
  target_schema_version: "ai-report-canonical.v1",
  target_pricing_at: new Date().toISOString(),
  target_estimated_cost_min_usd: 0,
  target_estimated_cost_max_usd: 0,
}), "create snapshot");

const taskResponse = await fetch(`${workerUrl}/tasks`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jobId: snapshot.jobId, stage: "prepare" }),
  signal: AbortSignal.timeout(300_000),
});
// A large local synchronous fan-out may finish its queued slide work after the
// initial HTTP request times out. The report row remains authoritative.
if (!taskResponse.ok && taskResponse.status !== 503) throw new Error(`worker prepare: HTTP ${taskResponse.status}`);

let report;
for (let attempt = 0; attempt < 300; attempt += 1) {
  report = ensure(await client.from("ai_reports").select("status, progress_completed, progress_total, safe_error_code").eq("id", snapshot.reportId).single(), "read report");
  if (["ready", "failed"].includes(report.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (report?.status !== "ready") throw new Error(`report did not complete: ${report?.status ?? "timeout"} ${report?.safe_error_code ?? ""}`);

process.stdout.write(JSON.stringify({
  folderId,
  lectureId,
  reportId: snapshot.reportId,
  slides: slideRows.length,
  questions: questionRows.length,
  status: report.status,
}));
