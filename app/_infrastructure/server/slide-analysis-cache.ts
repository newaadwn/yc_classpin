import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type CachedRegion = { alias?: string; label?: string; bboxNorm?: unknown; textRedacted?: string };
export type CachedPage = { sourceSha256: string; pageNumber: number; regions: CachedRegion[] };
export type SlideAnalysisCache = {
  signature: string;
  ocr: Map<string, CachedPage>;
  layout: Map<string, CachedPage>;
  renderBySource: Map<string, string>;
  renderFiles: string[];
};

const OCR_BASELINE = "output/report-ablation-v1/ocr";
const RESULTS = "output/model-benchmark-final-v1";
const state = globalThis as typeof globalThis & { slideAnalysisCache?: SlideAnalysisCache };

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function fileSignature(files: string[]) {
  const stats = await Promise.all(files.map((file) => stat(file)));
  return stats.map((item) => `${item.size}:${item.mtimeMs}`).join("|");
}

/**
 * 비식별화 렌더로 만든 PP-OCRv5·PP-DocLayoutV3 캐시를 읽는다.
 * 업로드 원본 checksum → 렌더 checksum 은 manifest 에 기록된 경로의 실제 bytes 로만 연결하고,
 * 페이지 번호로 짐작해 붙이지 않는다. 파일이 바뀌면 다시 읽는다.
 */
export async function loadSlideAnalysisCache(): Promise<SlideAnalysisCache> {
  const root = process.cwd();
  const baseline = path.join(root, OCR_BASELINE);
  const jsonFiles = [path.join(baseline, "manifest.json"), ...["paddleocr", "ppv3"].map((engine) => path.join(root, RESULTS, engine, "result.json"))];
  const cached = state.slideAnalysisCache;
  if (cached) {
    const signature = await fileSignature([...jsonFiles, ...cached.renderFiles]).catch(() => "");
    if (signature === cached.signature) return cached;
  }
  const manifest = JSON.parse(await readFile(jsonFiles[0], "utf8")) as { pages?: Array<{ sourceSha256?: string; renderedImage?: string }> };
  const renderBySource = new Map<string, string>();
  const renderFiles: string[] = [];
  for (const page of manifest.pages ?? []) {
    if (!page.sourceSha256 || !page.renderedImage) continue;
    const render = path.resolve(baseline, page.renderedImage);
    if (!render.startsWith(baseline + path.sep)) continue;
    try {
      renderBySource.set(page.sourceSha256, sha256(await readFile(render)));
      renderFiles.push(render);
    } catch { /* A missing render simply leaves that page unsupported. */ }
  }
  const [ocr, layout] = await Promise.all(jsonFiles.slice(1).map(async (file) => {
    const data = JSON.parse(await readFile(file, "utf8")) as { status?: string; pages?: CachedPage[] };
    if (data.status !== "complete" || !Array.isArray(data.pages)) throw new Error("SLIDE_ANALYSIS_INCOMPLETE");
    return new Map(data.pages.map((page) => [page.sourceSha256, page]));
  }));
  const next = { signature: await fileSignature([...jsonFiles, ...renderFiles]), ocr, layout, renderBySource, renderFiles };
  state.slideAnalysisCache = next;
  return next;
}

/** 슬라이드 이미지 checksum 과 일치하는 OCR·레이아웃 페이지. 없으면 null 로 실패를 닫는다. */
export function cachedSlidePages(cache: SlideAnalysisCache, sourceChecksum: string | null | undefined) {
  if (!sourceChecksum) return null;
  const render = cache.renderBySource.get(sourceChecksum) ?? sourceChecksum;
  const ocr = cache.ocr.get(render);
  const layout = cache.layout.get(render);
  return ocr && layout ? { ocr, layout } : null;
}
