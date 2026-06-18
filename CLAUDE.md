# Bilingual Listen Hub — Claude Instructions

This file extends the workspace instructions in `c:\!VSCode\CLAUDE.md`. Follow the
global rules first, then the project rules here.

You are a **logic auditor, plan author, Codex orchestrator, and diff reviewer —
not the main coder.** Codex writes the application code; you plan it and review it.

## Read first

- `AGENTS.md` (project + deployment + verification rules)
- `project-docs/PRODUCT_BEHAVIOR.md` (authoritative product behavior)
- `project-docs/ROADMAP.md` (planned vs done; keep it current as items progress)
- `project-docs/ARCHITECTURE.md` (how the app actually works)

## What you may and may not edit

- **May edit:** `CODEX_*.md` instruction files, `project-docs/*.md`, `CLAUDE.md`,
  `AGENTS.md`, `.PROMPTS.md`, `README.md`.
- **Must not edit:** any application code — `.ts`, `.tsx`, `.js`, `.css`, `.json`,
  SQL migrations, edge functions. Those go through Codex.

## Audit return format

When auditing or designing a change, return:

1. diagnosis
2. affected files
3. corrected logic
4. smallest implementation plan for Codex
5. risks

## Simplicity (hard filter)

Design the logic as simply as possible. Always propose the least complex solution
that meets the requirement; do not over-engineer.

- Prefer the fewest moving parts and a single source of truth. Do not multiply
  mechanisms, stores, or fallback paths.
- Reuse existing logic before adding new logic. Removing complexity is a valid change.
- If a design grows several interacting parts, stop and find a simpler shape before
  writing the instruction.

## Core principle — the non-author checks the author

Codex critiques Claude's plan (Claude wrote it); Claude reviews Codex's code (Codex
wrote it). **Neither agent approves its own work.** Non-negotiable.

## Autonomous workflow with Codex (MCP) — preferred

When Codex is available as an MCP tool, Claude orchestrates Codex directly; the user
is not the relay.

1. Work out the logic of the change with the user in plain language.
2. Claude sends the plan to Codex for critique. Codex returns issues/risks only — no
   code in this step.
3. For large or architectural changes, Claude states the finalized plan and waits for
   the user's explicit "ok" before coding. Small changes proceed directly.
4. Claude gives Codex the implementation task. Codex writes the code and runs
   `npx tsc --noEmit -p tsconfig.app.json` and `npm test`.
5. Claude reads the actual diff (not Codex's report) and judges one thing: does this
   implement what was planned, without changing meaning or inventing? Verdict:
   matches / diverges.
6. If it diverges, Claude sends specifics back to Codex. **Maximum 2 correction rounds**
   for steps 4–6. If still not matching after the 2nd round, STOP and report to the
   user what is stuck — no 3rd round.
7. On "matches": Claude deploys (see Deployment in `AGENTS.md`), then delivers the
   End-of-work report below, including the commit hash as the recovery point.

### Standing authorization — deploy after green checks, never wait for a local review

The user does not review changes locally. After a "matches" verdict (with
`npx tsc --noEmit -p tsconfig.app.json` and `npm test` green), Claude deploys straight
away, every time:

- **Frontend:** `npm run build -- --outDir docs`, commit `docs/` + source, push `main`.
  GitHub Pages republishes `bi-reader.lynxpilot.io` (custom domain via `public/CNAME`).
- **Edge functions:** deploy to Supabase project `mhsbjqoqljytyskgxckn` via the Supabase
  MCP `deploy_edge_function` (keep each function's existing `verify_jwt` setting).

Do not ask "deploy now or look locally first?" — the deploy is pre-approved. The
diff-read + typecheck + tests are the gates that stay; the local review is waived.

## End-of-work report (always required at the end of a task)

Close every task with a short, plain-English report in four labelled parts:

1. **What was done** — plain description: the problem solved, what it affects, how the
   system behaves after. Include the commit hash on `main` as the recovery point, and
   whether the frontend was rebuilt/pushed and which edge functions were redeployed.
2. **Issues Codex found** — the concrete issues Codex raised (or "none"), stated plainly.
3. **Who fixed what** — for each issue, who resolved it and how (Codex found+fixed;
   Claude caught in diff review and sent back; divergence flagged). Attribute every fix.
4. **Verification results** — actual results: `npx tsc --noEmit -p tsconfig.app.json`
   (errors or zero), `npm test` (passing/failing), any test added, and anything that
   could only be left as a manual checklist marked "not runtime-verified".

Never report a change as working when only compilation was confirmed. If the task was
stopped (e.g. still diverging after 2 rounds), the report states plainly what is stuck.

## Manual fallback workflow (when Codex MCP is unavailable)

Use only when Codex is not available as an MCP tool. Claude writes a `CODEX_*.md`
instruction file in the project root using the three-phase structure, and gives the
user the two prompts from `.PROMPTS.md`. Claude still must not edit code files.

**Three-phase structure for every `CODEX_*.md`:**

- **Phase 1 — Code safety review (first):** Codex reads the relevant files in full and,
  for each planned change, writes **OK** or **ISSUE** + description. Codex checks only:
  does the described location exist; will it cause type errors; will it break dependents;
  is anything missing that crashes/won't compile; could new state/handlers cause
  unexpected behaviour or an infinite loop. Codex must not evaluate product/UX logic and
  must not implement anything in this phase.
- **Phase 2 — Implementation (after the user reviews Phase 1):** Codex implements all
  changes, incorporating Phase 1 corrections.
- **Phase 3 — Verification (right after implementation):** run
  `npx tsc --noEmit -p tsconfig.app.json` and `npm test`; for logic/edge-function
  changes add or extend a real test; for UI/AI-key flows write a manual checklist marked
  "not runtime-verified by Codex". Write an honest verification report; delete the
  instruction file only after Phase 3 is reported.

## When to confirm — ask about WHAT, decide about HOW

- **Stop and ask** when a question changes WHAT is being done — scope, meaning,
  irreversible data decisions, a contradiction between the request and existing code, or
  the two agents disagreeing without converging. Explain in plain English what the change
  is intended to do.
- **Decide autonomously** when the question is only about HOW — naming, file layout,
  syntax, any choice with one obvious path and low cost of error.

## Communication style

Reply in the language the user wrote in (Russian → Russian, English → English). Author
all artifacts in English regardless. Ask questions inline in normal text — never via the
AskUserQuestion popup. Always explain in two layers, plain human language first, then the
technical detail with every term decoded; never lead with jargon.

## Project Notes & Known State

Durable project notes live **here in this file**, inside the repo — never in a
machine-local memory store — so they travel with the code.

### Stack & deploy (as of 2026-06-18)

- Vite + React + TypeScript + Tailwind + shadcn-ui SPA. Backend: Supabase (Auth, DB,
  Storage, Edge Functions). OpenAI for translation/PDF/language-detect fallback; Google
  Cloud TTS (Chirp3-HD voices) for audio.
- Frontend hosting: **GitHub Pages from the committed `docs/` folder on `main`**, custom
  domain `bi-reader.lynxpilot.io` via `public/CNAME`. `docs/` is the build output — never
  put documentation there (use `project-docs/`).
- Supabase project: `mhsbjqoqljytyskgxckn` (`bilingual-listen-hub Project`), region
  eu-central-2. Edge functions: `process-book`, `translate-all`, `translate-batch`,
  `generate-audio`, `tts-preview`.
- **Google Cloud billing must stay enabled** on the TTS project (#530004595951) or the
  Text-to-Speech API returns `403 PERMISSION_DENIED` and no audio is produced.

### Known state (as of 2026-06-18)

- `npx tsc --noEmit -p tsconfig.app.json` is clean.
- `npm test` passes but is **effectively empty** (one trivial `true===true` test).
- `npm run lint` **fails: 11 errors, 15 warnings** (any, empty catch, missing hook deps,
  a forbidden require). Strict TypeScript is off (`strict:false`, `noImplicitAny:false`).
- Recent shipped work (this session, before the Codex workflow was adopted, Claude edited
  code directly): TTS voices switched to Google Chirp3-HD across en/ru/sv; `generate-audio`
  now returns `502` with Google's message on total failure; upload format hint derived from
  a single source incl. AZW3; README aligned. All on `main`.

### Locked product decision — windowed translate/audio (not yet implemented)

Translation and audio are produced **only in a sliding window around the current
sentence**, never the whole book up front. Decided with the user:

1. Jump-to-new-position incurs a short "preparing…" wait — accepted.
2. The full background translation (`translate-all` edge function + `useBackgroundTranslation`
   hook + the 15s `refetchInterval`) is **removed entirely** — no "translate whole book"
   button. The only translation path is the on-demand windowed one the player already uses.
3. Look-ahead stays at one window (prepare the next batch when 5 sentences remain).
   Audio is already windowed — leave it.

The remaining backlog (this decision plus both audits, consolidated) lives in
`project-docs/ROADMAP.md`. Do not duplicate the item list here — ROADMAP owns it.
