# Bilingual Listen Hub — Project Instructions

This file extends the workspace instructions in `c:\!VSCode\CLAUDE.md`. Follow the
global rules first, then the project rules below. Claude's role and the two-agent
workflow are defined in `CLAUDE.md`.

Production URL: https://bi-reader.lynxpilot.io/

## Product Purpose

Bilingual Listen Hub lets a user upload an ebook, get it translated sentence by
sentence, and listen to it bilingually (original + one target language) with generated
audio. The authoritative description of how it should behave is
`project-docs/PRODUCT_BEHAVIOR.md` — read it before changing upload, translation, audio
generation, or playback behavior.

## Deployment Workflow

This project does **not** auto-deploy from a single push. There are two separate
deploy targets.

- **Frontend (GitHub Pages):** served from the committed `docs/` folder on `main`.
  To publish: `npm run build -- --outDir docs`, then commit `docs/` together with the
  source change, then push `main`. GitHub Pages republishes within a few minutes.
  - `docs/` is the **build output** — never store documentation or hand-written files
    there; they are wiped on rebuild. Documentation lives in `project-docs/`.
  - The custom domain is set by `public/CNAME` (`bi-reader.lynxpilot.io`), which Vite
    copies into `docs/` on every build, and `vite.config.ts` copies `index.html` to
    `404.html` for SPA routing. Confirm `docs/CNAME` exists after a build.
- **Edge functions (Supabase):** deploy each changed function to project
  `mhsbjqoqljytyskgxckn` via the Supabase MCP `deploy_edge_function`, or the Supabase
  CLI / dashboard. Preserve each function's existing `verify_jwt` setting. Edge function
  deploys are independent of the Pages build.
- If a change is committed but not pushed, or an edge function is changed but not
  deployed, say so plainly — production is not updated yet.

## Verification After Implementation

After any code change, verify it actually works, not only that it compiles, and finish
with an honest verification report (see the End-of-work report in `CLAUDE.md`).

- Always run `npx tsc --noEmit -p tsconfig.app.json` (zero errors) and `npm test`.
- For logic / edge-function changes: add or extend a real test that runs the changed
  code with representative input and asserts the actual output. The current suite is
  effectively empty (one trivial test) — building real tests is itself a roadmap item,
  and new logic work should add coverage rather than rely on the trivial test.
- For UI/runtime-only changes and AI/TTS flows that need external keys: these cannot be
  run headlessly here. Provide a short manual verification checklist (exact steps and
  exact expected result) marked "not runtime-verified".
- Never claim a change "works" when only compilation was confirmed.

## Documentation Rules

Any product or workflow decision agreed in conversation must be reflected in
`project-docs/` before or together with implementation.

- Product behavior changes (upload, translation, audio, playback): update
  `project-docs/PRODUCT_BEHAVIOR.md`.
- Module / data-flow / storage-layout changes: update `project-docs/ARCHITECTURE.md`.
- User-visible or project-visible changes: add an entry to `project-docs/CHANGELOG.md`.
- Keep `project-docs/ROADMAP.md` current: advance an item's status
  (`Planned` → `In progress` → `Done`) as it moves, and record shipped changes in
  `CHANGELOG.md`. Add newly agreed future work to `ROADMAP.md` so done vs not-done
  stays visible.

## Environment Facts

- Supabase project: `mhsbjqoqljytyskgxckn` (region eu-central-2). Storage buckets:
  `ebooks` (private), `audio` (public).
- Frontend env (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` are read
  by the app; `VITE_SUPABASE_PROJECT_ID` is kept for reference only.
- Edge-function secrets (set in Supabase): `OPENAI_API_KEY`, `GOOGLE_TTS_API_KEY`,
  optional `OPENAI_TRANSLATION_MODEL` / `OPENAI_MODEL` / `OPENAI_DOCUMENT_MODEL` /
  `OPENAI_BASE_URL`.
- **Google Cloud billing must stay enabled** on the TTS project (#530004595951), or the
  Text-to-Speech API returns `403 PERMISSION_DENIED` and no audio is generated.
