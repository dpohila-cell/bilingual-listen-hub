# Changelog

User-visible and project-visible changes, newest first.

## 2026-06-24

- **Robust large-PDF extraction (P1.6):** PDF processing now tries a real text-layer
  parser before OpenAI, avoiding the one-response AI output cap that truncated long PDFs
  after roughly 25-30 pages. The parser is dynamically imported inside a guarded function:
  any import/runtime/parser failure returns `null`, and scanned or low-text PDFs fall back
  to the existing AI extraction path unchanged. Added unit coverage for the pure usability
  decision helper. **Deploy pending:** `process-book` has not yet been redeployed.

- **Clean text before audio (P1.7):** The text extracted from an uploaded book is now
  cleaned before it is saved, so the spoken audio no longer reads invisible junk. Hidden
  characters that don't show on screen but confuse text-to-speech — control characters,
  zero-width marks, text-direction marks, soft hyphens, byte-order marks — are removed,
  and unusual spaces (like the non-breaking space) become ordinary spaces. Paragraph
  breaks are kept, so the split into sentences is unchanged. Implemented as one shared
  `sanitizeExtractedText` helper called at the single point in `process-book` where every
  file format converges, with a unit test built from public-domain text seeded with hidden
  characters. Typecheck clean, tests 20/20. **Deploy pending:** the `process-book`
  redeploy was blocked pending explicit authorization, so this is not yet live.

## 2026-06-23

- **PDF upload fix + honest failure status (P1.5):** Two problems made a PDF
  upload (e.g. "The Little Prince") hang forever on "Processing". (1) PDF text
  extraction sent the file to OpenAI as bare base64, but the Responses API
  expects a data URL (`data:application/pdf;base64,…`), so every PDF failed —
  PDF extraction had in fact never worked. (2) The `process-book` catch-all
  returned 500 without setting the book's status, leaving it stuck in
  `processing` permanently. **Fixed:** `generateFromPdf` now builds a proper
  data URL (via a shared `buildFileDataUrl` helper, with a Vitest unit test),
  and on any unexpected failure `process-book` best-effort marks the book
  `error` — but only a book whose ownership it already verified, and only while
  its status is still `processing` (so a concurrent run that already reached
  `ready` is never clobbered). `process-book` redeployed (v11). The one stuck
  "The Little Prince" row was set to `error` so it can be deleted/re-uploaded.

## 2026-06-22

- **Strict TypeScript (P3.5):** Enabled TypeScript `strict` for the app config and
  removed the `noImplicitAny: false` override. The only code change needed was an
  explicit DOM-compatible type for the test `matchMedia.onchange` mock.
- **Real tests (P3.4):** Extracted pure translation JSON repair/alignment, sentence
  splitting, and upload validation helpers, then replaced the placeholder test with
  focused Vitest coverage for those units.
- **Translation consolidation (P3.3):** Moved the shared translation prompt,
  JSON-repair parsing, numbered response validation, and result alignment into
  `supabase/functions/_shared/translation.ts`. `translate-batch` and `process-book` now
  use the same translation helper; oversized file splitting is deferred.
- **Code quality cleanup (P3.1/P3.2):** Removed dead audio/cache and splitter code,
  cleared ESLint errors with mechanical type/import/catch fixes, and left the global
  TypeScript `strict` flag unchanged.
- **Card and settings polish (P2.3):** Book cards now choose stable cover colors from
  UUIDs, progress bars avoid invalid or oversized percentages, and disabled Settings
  rows are labeled "Coming soon".
- **Upload validation (P2.2):** Dropping or picking an unsupported file type, or any file
  over 25 MB, is now rejected with a clear message instead of being uploaded (and, for
  PDFs, sent into expensive AI extraction).
- **Player controls (P2.1):** Rewind and fast-forward now skip 10 sentences backward or
  forward. Previous and next still move one sentence at a time.
- **Processing reliability (P1.4):** If saving a book's sentences fails partway, the book
  is now marked failed instead of being silently marked ready with missing text. A book
  only becomes "ready" once all of its sentences are saved.
- **Upload / library correctness (P1.3):** Upload no longer marks a book `ready` just
  because some sentences exist. Ready books open normally and get the first audio batch;
  still-processing books return to the library with a processing message; failed books
  show as failed and can be deleted/re-uploaded. The library now displays ready,
  processing, and failed books while only allowing ready books to open in the player.

## 2026-06-18

- **Security (P0.1):** `tts-preview` now authenticates the real user (`auth.getUser()`)
  before calling Google. Previously any caller with the endpoint could spend Google TTS
  quota; a non-user token now returns `401`. Deployed as `tts-preview` v4.
- **Translation correctness (P1.2):** Sentence translations are now matched to the correct
  sentence (by an explicit number echoed back by the model) instead of by list position, so
  a malformed AI response can no longer shift translations onto the wrong sentences or
  overwrite them with the original text. Sentences with a missing language are now
  re-translated instead of being treated as done. Deployed.
- **Translation/cost (P1.1):** Removed the whole-book background translation. The book is
  now translated only in a window around what's being played (plus the first batch at
  upload), so you only pay to translate what you actually listen to. Deleted the
  `translate-all` function source, the `useBackgroundTranslation` hook, the player's 15s
  poll, and the trigger in `process-book` (redeployed). No user-visible change to playback.
- **Security / cost (P0.2):** Deleting a book now actually removes its source file and all
  its generated audio (previously both were left behind, costing storage). Tightened the
  `audio` storage policies so a user can no longer read/overwrite/delete other users'
  audio — only delete audio for books they own. Migration applied to prod; playback
  unaffected.
- **Process:** Adopted the two-agent Claude+Codex workflow (mirrored from the Rolewise
  project). Added `CLAUDE.md`, `AGENTS.md`, `.PROMPTS.md`, and the `project-docs/` set
  (`ARCHITECTURE.md`, `PRODUCT_BEHAVIOR.md`, `ROADMAP.md`, this file). Claude is the
  auditor/planner/reviewer; Codex is the coder; neither approves its own work.
- **Audio voices:** Switched text-to-speech from legacy Google WaveNet to Google
  Chirp3-HD across English, Russian, and Swedish (more natural speech). Voice names and
  genders in the UI are unchanged; only the underlying engine changed.
- **Audio errors:** `generate-audio` now returns a real `502` with Google's message when
  nothing could be generated (e.g. billing disabled), and the player shows the error
  instead of stopping silently.
- **Upload hint:** The supported-format list on the upload screen is now derived from a
  single source of truth and includes the previously missing AZW3.
- **Docs:** README aligned with the above (Chirp3-HD, Google billing note, GitHub Pages
  deployment, supported formats, unused `VITE_SUPABASE_PROJECT_ID`).

### Context discovered this session

- Frontend is hosted on GitHub Pages from the committed `docs/` folder on `main`, custom
  domain `bi-reader.lynxpilot.io` via `public/CNAME`.
- Google Cloud billing on the TTS project had lapsed, which silently stopped audio
  generation; re-enabling billing restored it.
