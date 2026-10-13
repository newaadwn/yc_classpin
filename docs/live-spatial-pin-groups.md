# Live spatial question grouping

Scope authorized by the user on 2026-10-06, based on the 2026-09-29 meeting (38:21–40:49).

- Existing instructor player and presentation: nearby point pins become count markers.
- Grouping is display-only, per slide; all members must be within 72 rendered pixels of one another. Resizing recomputes groups; original normalized coordinates remain untouched.
- Open a marker to classify its questions using the existing condense model and local embedding service. Show representative source questions, counts and expandable originals, not a fabricated generated summary.
- Different topics remain separate. Failed/unavailable semantic analysis is explicitly labelled; identical text and generic requests remain available.
- Original pins can be expanded; hovering or focusing a meaning group highlights its original anchors. Individual questions retain their existing answer/detail workflow.
- The user authorized further development on 2026-10-06: complete only unanswered members of a meaning group and undo the most recent completion. Local demo completion uses the session store; remote mode retains existing authorized RPCs. Undo will not overwrite changed text or a subsequent answer in demo mode. No schema changes or production writes were performed.
- Open spatial membership is snapshotted. New nearby questions are applied only through the explicit new-question button. Status display still follows the live store.
- OFF restores existing rendering. Page changes clear selection. The panel supports keyboard navigation, Escape and outside-click dismissal.
- QA Studio remains unchanged. Validate with pure grouping tests, lint/type checking and local browser checks.

Verification (2026-10-06): pure grouping tests, targeted ESLint and TypeScript passed. Headless Chromium checked live and presentation views, semantic grouping of six synthetic questions into three topics using the real local Qwen embedding model, originals, toggle, Escape, outside click and a 600px viewport. Production database was not accessed or reset. Local demo entry `/demo/soi?view=live&sample=clusters` creates a separate clearly labelled synthetic session; normal SOI questions are retained in their original session.

Follow-up browser checks passed: hover highlights exactly three members, completion updates only those three, undo restores them, arrival preserves the six-question snapshot and explicit apply shows seven. Build passed; final targeted lint and type checks cover the demo initialization ordering correction. Full repository lint has pre-existing errors in experiment and temporary scripts.
