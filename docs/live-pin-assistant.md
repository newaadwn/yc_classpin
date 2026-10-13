# Live PIN assistant — local development

User-authorized scope (2026-09-11), branch AI_Develop:
- Preserve existing PIN visibility switch and student submission/reaction/answer flows.
- Instructor PIN notification and visibility switches share the persisted session PIN setting. OFF hides PINs/alerts on the instructor screen and slideshow, including already-open windows; ON restores them. OFF does not block or delete student questions or hide the question list.
- Question-time PIN ON selects at most five unanswered questions through current slide,
  filtered by existing category, ordered by reactions, oldest, newest or current slide.
- Updated 2026-09-26: local answer AI starts only on instructor selection or explicit retry.
  Arrival/edit notifications do not enqueue inference. Every original is still saved; this is
  demand-driven inference, not question sampling. See `question-management-progress.md`.
- AI output is instructor-only, unverified, editable, and never sent automatically.
- The instructor PIN bubble also offers the same AI draft, generation status/retry, and manual answer editor. It shares the question-scoped draft with the side panel, protects existing text, and sends only on explicit instructor action. Presentation remains read-only.
- In the PIN bubble the AI draft is initially a light textarea placeholder, not a saved or sendable answer. “이 답변 넣기” explicitly copies it into the shared editable value in normal text color. Manual input overrides the preview; existing text is never overwritten.
- The instructor can dismiss the entire answer panel without answering or resolving a question. Clear only selection; preserve per-question answer drafts and AI behavior. Do not implicitly reselect the first question when selection is empty.
- Selecting a question in either list or TOP 5 navigates to its slide using existing live slide synchronization, selects its PIN and opens the answer panel without a blocking detail dialog. Manual answer drafts remain keyed by question.
- The default right panel covers all slides and all answer statuses. Always expose category filtering and sorting (category groups, empathy, newest, oldest, current slide first), display page numbers and filtered counts. Question time retains its answered-page cutoff and unanswered TOP-5 scope.
- Importance sorting is explicitly rule-based: important category first, then unanswered, reaction count descending, oldest first, deterministic ID ties. It does not claim AI-assessed significance or add inference cost.
- Reuse local Qwen3 4B runtime; no external AI charges/downloads. Sequential bounded requests.
- Ground against hash-matched cached OCR/layout, plus question and coordinates. No speaker notes.
  Missing/mismatched context fails closed. No claim of universal PDF support or instant completion.
- Authentication, owner check, loopback/local DB guard on every AI request. No DB migrations.
- Preserve local DB and uncommitted research. Test sorting, request validation, two browser roles,
  AI failure/success, draft insertion and explicit answer send. Do not reset the populated DB.

Verification 2026-09-11:
- Instructor and separate anonymous participant browsers: new PIN arrived live, notification
  appeared, OFF switch disabled notifications, TOP-5 filters rendered.
- Real Qwen3 4B answer generated in 71.6 seconds with an OCR-supported quote. Student saw
  no answer until instructor explicitly sent it. Draft insertion and manual send passed.
- Source image hash → recorded privacy render → verified render hash → OCR/layout cache
  provenance verified; page-number-only matching is prohibited.
- 600px viewport had no horizontal overflow; unauthenticated API 401, cross-origin 404.
- Sorting/fingerprint and existing experiment tests: 10 passing. No production writes.
- One clearly labelled local QA question and its test answer remain in the imported session.
