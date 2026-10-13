# AI question placement — local development

User-authorized scope (2026-09-22), branch AI_Develop:
- A participant can type a question without tapping the slide. On send, the participant screen posts the lecture id, material id, current page and text to `POST /api/dev/question-placement`.
- The server decides: target page, target region, point coordinates, an existing enabled PIN category, confidence, and duplicate/related existing questions. It never writes to the database.
- Page rule: an explicit page number in the question wins; otherwise the current page is analyzed first; other pages are searched only when the current page has no matching content and another page has strong evidence (matching numbers, two or more matching words, or high embedding similarity). Deictic words ("이 그래프", "여기") keep the current page.
- Pipeline: cached PP-OCRv5 lines + PP-DocLayoutV3 regions (hash-matched to the slide image, never matched by page number) → region list → cue parsing (page, element type, position, table row/column ordinal, numbers, content words, color) → lexical/number matching + Qwen3-Embedding-0.6B similarity → page/region candidates → point (number line, n-th table data row, or region center) → confidence and reasons.
- Confidence ≥ 0.70 creates the PIN immediately through the existing participant insert path (RLS). Lower confidence shows "이 위치가 맞나요?" with the suggested pin, the estimated region outline and up to three candidates; the participant can drag the pin, tap another spot or change page before registering. While the confirmation is shown, local Qwen3 4B re-judges the question against the top candidates and updates the suggestion unless the participant already moved it. The participant can also change the suggested category there; a chosen category is kept even if the re-judgement arrives later. Questions without any location cue (no content word, number, element type or position) and results already at auto confidence skip the Qwen3 4B step on both client and server (`analysis.llmSkipped`), so the shared CPU lock is not held for nothing.
- A strong duplicate pauses creation and offers empathy on the existing question or "그래도 새로 질문하기". Related questions are listed after creation.
- The participant can move the PIN of their own unanswered question later (after auto creation, or from the edit composer) within the same live material version through `public.move_own_question_pin` (migration `20260921201500`). No other schema change.
- Instructor lists, categories, importance, empathy, notifications and AI answer drafts are unchanged; new PINs reach the instructor screen, slideshow and other participants through the existing realtime/snapshot paths. The slideshow window stays read-only (no text input there).
- Rule scores are not AI judgements; the UI and reasons state which stage decided (search, search + embedding, or Qwen3 4B) and never auto-send anything.

Runtime and limits:
- Local development only: development build, loopback request, local Supabase, anonymous participant token. The route reads with the caller token; no service key.
- Supported materials: only slides whose image hash matches the cached benchmark analysis (currently the 15-page SOi deck). Other materials fail closed with a manual PIN fallback.
- Colors in the question cannot be verified from OCR text; such questions are capped below auto confidence.
- Duplicate check embeds at most 120 existing questions per request (pages ±1 of the target and unanswered first); the rest are still compared lexically.
- Embeddings: `Qwen/Qwen3-Embedding-0.6B-GGUF` Q8_0 (Apache-2.0, revision 370f27d, sha256 checked), served by the local WinGet llama.cpp `llama-server` started on demand and stopped after 20 idle minutes. Region vectors are cached under `output/question-placement/` (not in Git). Missing model → lexical search only, reported as such.
- LLM re-judgement: Qwen3 4B Q4_K_M via `experiments/semantic_regions/question_placement_llm.py`, CPU, shares the inference lock with the instructor AI answer; busy/failed runs keep the search result and are shown as skipped.
- `tmp/start-local-dev.ps1` checks local Supabase, applies pending migrations locally without reset, downloads the embedding model once, and starts Next.js on 127.0.0.1:3000.

Verification requirements:
- Pure logic tests: `node --test --experimental-strip-types app/_model/question-placement.test.ts`.
- Real deck: the four example questions and the 17 existing PIN questions (no wrong auto placement), cross-page questions, two browser roles with realtime reflection on the instructor screen and slideshow, confirm/move flows, duplicate prompt, embedding and Qwen3 4B paths. Do not reset the populated local DB.
