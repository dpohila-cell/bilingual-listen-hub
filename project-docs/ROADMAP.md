# Roadmap

The single consolidated backlog — both code audits (Claude + Codex) plus the locked
windowed translate/audio decision, merged and de-duplicated, ordered by priority.

Status legend: `Planned` → `In progress` → `Done`. When an item ships, flip it to `Done`
and record it in `CHANGELOG.md`.

---

## P0 — Security & cost (do first)

### P0.1 — Authenticate `tts-preview` · Done (2026-06-18)
`tts-preview` only checked that an `Authorization` header existed; it never validated the
user via `auth.getUser()`. Anyone who knew the endpoint could spend Google TTS quota.
**Fixed:** added the same `getUser()` check the other functions use. Verified live — a
non-user token now returns `401` (previously returned audio). **Affected:**
`supabase/functions/tts-preview/index.ts` (deployed v4).

### P0.2 — Fix book deletion + tighten audio storage policy · Done (2026-06-18)
Two problems in one area:
- Deletion left paid files behind. The ebook was removed by the wrong key (`[bookId]`
  instead of `books.file_path`), and the audio deletion only walked two path levels while
  files live three deep (`bookId/lang/voice/file`).
- The `audio` `"Service role can manage audio" FOR ALL` policy applied to role `public`
  (everyone), so any user could read/overwrite/delete any audio; the upload policy only
  checked `authenticated`.
**Fixed:** delete the ebook by `book.filePath` and walk all 3 audio levels; dropped both
over-broad policies (service role bypasses RLS, clients never upload audio) and added a
scoped `DELETE` policy gated on `user_owns_book`. Migration applied to prod; verified
public read still serves audio (200) and the broad policies are gone. Client delete path
is a manual check (needs a browser session). **Affected:** `src/pages/Library.tsx`,
`src/types/index.ts`, `supabase/migrations/20260618120000_tighten_audio_storage_policies.sql`.

---

## P1 — Correctness

### P1.1 — Windowed translate/audio (LOCKED) · Done (2026-06-18)
Removed the whole-book translation path; only the on-demand windowed one remains (see
`PRODUCT_BEHAVIOR.md`). **Removed:** `translate-all` edge function source,
`useBackgroundTranslation` hook, the 15s `refetchInterval` in `Player.tsx`, and the
`triggerBackgroundTranslation` call in `process-book` (inline first-batch translation
kept). `process-book` redeployed via the Supabase CLI. Audio was already windowed.
**Manual cleanup left:** the deployed `translate-all` function is now orphaned (nothing
calls it) — delete it in the Supabase dashboard when convenient (the harness blocks
deleting a live function from here).

### P1.2 — Reliable translation · Done (2026-06-18)
Translation trusted the model to return exactly N items in array order and attached them by
index; a short/reordered response mis-assigned translations, and the fallback wrote the
original text into all three language fields. A sentence was also treated as "translated"
whenever `en_translation` was non-null, so a row with English but empty Russian/Swedish was
never retried.
**Fixed:** `translate-batch` now treats a sentence as needing translation if **any** of
en/ru/sv is empty (partial retry), tags each sentence `[n]` in the prompt and maps results
back by `n` (id-aligned), validates each item (integer `n` in range, non-empty strings, no
double-apply), drops the garbage fallback, and returns a `complete` flag. The client
(`useTranslateBatch`) now retries incomplete ranges (in-flight guard prevents concurrent
duplicates) instead of deduping a range forever. Deployed via CLI. Structured JSON output
is deferred to P3.3 (consolidation). **Affected:** `supabase/functions/translate-batch/index.ts`,
`src/hooks/useTranslateBatch.ts`.

### P1.3 — Honest `ready` status · Done (2026-06-22)
The client sets `status=ready` whenever `sentence_count > 0`, even if `process-book`
errored or timed out, so a partially processed book can open. And the library lists both
`ready` and `processing` books with a no-op filter, so a `processing` book can be opened
into an empty player.
**Fixed:** the upload page now trusts the stored book status after `process-book` returns:
`ready` opens the player and generates the initial audio batch, `error` returns to upload,
and still-`processing` books return to the library without forcing `ready`. The library
now lists `ready`, `processing`, and `error` books, but only opens `ready` books; other
states show clear status messages and remain deletable. **Affected:**
`src/types/index.ts`, `src/pages/UploadPage.tsx`, `src/pages/Library.tsx`,
`src/components/BookCard.tsx`.

### P1.4 — `process-book` atomicity · Done (2026-06-22)
On re-processing, old sentences were deleted then new ones inserted in batches that
**swallowed errors**, after which the book was unconditionally marked `ready` — so a
partially-inserted book could be presented as ready.
**Fixed (status-guard, not a DB transaction):** `process-book` sets `status='processing'`
at the start of work, and a batch insert error is now fatal — it marks the book `error`
and returns `500` instead of continuing. The final `ready` is therefore only reached when
all sentences inserted. Combined with P1.3 (only `ready` books open), a half-replaced book
is never usable. A transactional RPC was rejected for simplicity and to avoid a
`SECURITY DEFINER` function that could wipe arbitrary books. Deployed via CLI. **Affected:**
`supabase/functions/process-book/index.ts`.

### P1.5 — PDF extraction + no stuck `processing` · Done (2026-06-23)
A PDF upload hung forever on "Processing". Root causes: (1) `generateFromPdf`
sent OpenAI bare base64 instead of a data URL, so every PDF failed at extraction
(PDF had never actually worked); (2) the `process-book` catch-all returned 500
without setting a status, stranding the book in `processing`.
**Fixed:** `generateFromPdf` builds `data:<mime>;base64,…` via a shared
`buildFileDataUrl` helper (unit-tested); the catch-all best-effort marks the book
`error`, scoped to an ownership-verified book and guarded by `.eq('status','processing')`
so it can't overwrite a concurrent `ready`. Redeployed `process-book` v11; the
stuck row was set to `error`. **Affected:** `supabase/functions/process-book/index.ts`,
`supabase/functions/_shared/openai.ts`, `supabase/functions/_shared/fileDataUrl.ts`,
`src/test/openai.test.ts`.

### P1.6 — Robust large-PDF extraction · Done (code) · deploy pending (2026-06-24)
**Reproduced live:** a real PDF extracted only ~26 pages and playback stopped near
page 24 because no sentences exist past the truncation point. **Root cause:** the whole
PDF is sent in one AI call asking for the whole book in one response, but
`extractTextWithAI` → `generateFromPdf` passes no `max_output_tokens`, so it hits the
model's output cap (gpt-4o-mini ≈ 16k tokens ≈ ~25–30 pages). The book's tail is silently
dropped. Raising the cap does not scale — 16k is the hard ceiling, so a whole book never
fits in one response.
Also still open from before: inline base64 in the Responses API is capped (~33.5M chars ≈
~24 MB) while uploads allow up to 25 MB, and the in-function base64 conversion
(`Array.from(bytes).map(...).join('')`) is memory-heavy.
**Fixed in code:** PDF processing now tries `unpdf` text-layer extraction first and uses
the parsed text only when enough pages contain meaningful text and the total extracted
letters are sufficient. The `unpdf` import is dynamic and wrapped in `try/catch`, so
import-time or parser failures return `null` and degrade to the unchanged OpenAI
extraction path. AI remains the fallback for scanned/image PDFs and weak text layers.
**Deploy pending:** `process-book` has not yet been redeployed.

### P1.7 — Sanitize extracted text before storage · Done (code) · deploy pending (2026-06-24)
Hidden/invisible characters leaked from extraction into `sentences.original_text` (the
text TTS reads verbatim) — control chars, zero-width and bidi marks, soft hyphens, BOM,
non-standard spaces — making audio speak garbage. Only `stripNullBytes` ran globally;
per-format cleanup was uneven.
**Fixed:** added a single pure `sanitizeExtractedText` in
`supabase/functions/_shared/text.ts` and call it at the one chokepoint in `process-book`
where all format extractors converge, just before `splitIntoSentences`. It normalizes
line endings, drops C0/C1 controls (preserving `\n`), removes zero-width/bidi/soft-hyphen/
BOM, normalizes Unicode spaces, and NFC-normalizes — without touching paragraph newlines
so sentence splitting is unchanged. Covered by a Vitest unit test using public-domain
text with injected hidden characters. `npx tsc --noEmit -p tsconfig.app.json` clean,
`npm test` 20/20. **Affected:** `supabase/functions/_shared/text.ts`,
`supabase/functions/process-book/index.ts`, `src/test/text.test.ts`.
**Deploy pending:** `process-book` redeploy to Supabase was blocked by the environment
pending explicit user authorization — not yet live in production.

### P1.8 — Russian TTS quality · Done (code) · deploy pending (2026-06-24)
Russian audio is poor — commas ignored, words run together — while English from the same
pipeline reads fine. The text is sent as plain text (no SSML) with the Chirp3-HD Russian
voice; Chirp3-HD is the newest "smart" voice family but does **not** support SSML and is
markedly weaker on Russian prosody than on English. Because the same punctuation reads
correctly in English, the cause is the voice, not our text.
**Fixed in code:** Russian voices now use Wavenet ids in `VOICE_OPTIONS` and
`generate-audio` defaults to `ru-RU-Wavenet-D`. A shared TTS helper sends Chirp voices as
plain `{ text }` and non-Chirp voices as SSML with a leading 300 ms break and XML-escaped
text; `generate-audio` and `tts-preview` both use it. Stored old Russian Chirp voice ids
fall back to the current first Russian voice. **Deploy pending:** `generate-audio` and
`tts-preview` have not yet been redeployed.

### P1.9 — Clipped phrase starts · Done (code) · deploy pending (2026-06-24)
The beginning of almost every phrase is swallowed. Two compounding causes: (1) **Bluetooth
A2DP idle wake-up** — headphones power down the link during the inter-sentence pauses and
clip ~0.1–0.3 s when the next clip starts (real, known behavior); (2) **the player starts
playback before buffering** — `playAudioElement` sets `audio.src` and calls `audio.play()`
immediately, without waiting for `canplay`/`canplaythrough`, so the first frames can drop.
**Fixed in code:** Wavenet SSML clips get a leading 300 ms break through P1.8, and
`playAudioElement` now waits for `canplay` before calling `play()`. The wait has a
3-second timeout fallback and cleanup removes both the listener and timer, so readiness
can never deadlock. Silent keep-alive remains deferred.

---

## P2 — UX

### P2.1 — Collapse duplicate player controls · Done (2026-06-22)
Rewind/FastForward are wired to the same handlers as Prev/Next
(`onRewind={goToPrev}`, `onForward={goToNext}`), so five buttons do three things.
**Fixed:** Rewind/FastForward now skip backward/forward by 10 sentences while Prev/Next
still move by one sentence. **Affected:** `src/hooks/usePlayer.ts`, `src/pages/Player.tsx`.

### P2.2 — Upload validation + size limit · Done (2026-06-22)
Drag-and-drop accepted any file (the `accept` filter only covers the file picker), and
there was no size limit, so a huge PDF could go into an expensive AI extraction.
**Fixed:** `UploadZone` now validates every file (drag-drop and picker) against
`ACCEPTED_FORMATS` and a 25 MB cap, rejecting with a toast before it reaches upload.
**Affected:** `src/components/UploadZone.tsx`.

### P2.3 — Card and settings polish · Done (2026-06-22)
`BookCard` uses `parseInt(book.id)` on a UUID (often `NaN` → missing cover color) and can
show `NaN%` progress when totals are 0; Settings has dead disabled sections.
**Fixed:** pick the cover color deterministically from the UUID, guard and clamp the
percentage, and label the disabled sections as "Coming soon". **Affected:** `src/components/BookCard.tsx`,
`src/pages/SettingsPage.tsx`.

---

## P3 — Code quality & tests

### P3.1 - Fix ESLint errors - Done (2026-06-22)
Cleared the lint errors without changing the global TypeScript `strict` flag: removed
remaining explicit `any` usage in touched player/library paths, documented intentionally
ignored storage catches, converted empty component prop interfaces to type aliases, and
replaced the Tailwind CommonJS plugin `require` with an ESM import. Warnings may remain
as lower-priority cleanup.

### P3.2 - Remove dead code - Done (2026-06-22)
Deleted the always-false audio regeneration helper, the no-op `clearAudioCache` export,
unused playback-settings voice import, no-op prefetch placeholder comments, and the old
commented-out splitter implementation in `process-book`. Kept `buildAudioUrl`, which is
still used by playback.

### P3.3 — Translation consolidation · Done (2026-06-22)
`process-book` (~30 KB), `Player.tsx` (~23 KB), `usePlayer.ts` (~15 KB) are hard to
maintain. The translation prompt + JSON-repair + apply logic is copied in three places
(`translate-all`, `translate-batch`, `process-book`). **Fix:** split into small modules
and extract one shared translation helper in `supabase/functions/_shared/`. (P1.1 removes
the `translate-all` copy already.)

Consolidation is done: `translate-batch` and `process-book` now use the shared
`supabase/functions/_shared/translation.ts` helper. Splitting oversized files is deferred
to a later cleanup so this change stays focused on translation behavior.

### P3.4 — Real tests · Done (2026-06-22)
The suite was one trivial `true===true` test. **Fixed:** extracted pure translation
JSON repair/alignment, sentence splitting, and upload validation helpers, then replaced
the placeholder test with focused Vitest coverage for those behavior-neutral units.
Broader upload/deletion/player integration tests remain future work.

### P3.5 — Enable strict TypeScript (deferred from P3.1) · Done (2026-06-22)
Enabled TypeScript `strict` for the app config and removed the `noImplicitAny: false`
override. This was nearly free because the codebase was already strict-clean; only the
test `matchMedia` mock needed an explicit `onchange` type.

---

## P4 — Content enrichment (new features, agreed 2026-06-24)

Shared root: container formats (EPUB, FB2; partly DOCX, MOBI) already carry title, author,
cover image, and chapter boundaries, and `process-book` already opens these containers.
PDF/TXT/DOC carry little or none of this, so every item below degrades by format and is
weakest for PDF. **Scope decision: new uploads only** — already-uploaded books are not
backfilled unless re-uploaded. Best done as one parsing enrichment that feeds all three,
not three separate passes.

### P4.1 — Auto-fill title & author from the book · Done (code) · deploy pending (2026-06-24)
Upload now starts immediately after file selection: the book row is created up front with
a non-empty filename-derived title, blank author, and `status=processing`. During
`process-book`, EPUB OPF, FB2 `title-info`, and DOCX `docProps/core.xml` metadata are
parsed with a pure tested helper and used to update the book. Metadata title replaces the
filename title when present; metadata author is only written if the current author is
blank. PDF/TXT/DOC/MOBI keep the filename title for now. Users can rename title/author
later from the library. **Deploy pending:** the changed `process-book` function has not
yet been redeployed.

### P4.2 — Cover image in Library · Done (code) · deploy pending (2026-06-24)
New EPUB and FB2 uploads now try to extract a cover image during `process-book`. EPUB uses
the OPF cover manifest reference; FB2 uses `<coverpage>` plus embedded `<binary>` image
data. Valid covers are capped at 5 MB, uploaded to the public `audio` bucket as
`bookId/cover.<ext>`, and stored in `books.cover_path`. `BookCard` renders the cover with
the existing fixed-size box and falls back to the gradient on missing/broken images.
Deletion explicitly removes the root-level cover object. Cover work is best-effort and
cannot fail book processing. **Deploy pending:** migration not applied, `process-book` not
redeployed, frontend not rebuilt into `docs/`.

### P4.3 — Sections / chapter navigation · Done (code) · deploy pending (2026-06-25)
Goal: jump between sections. The player engine already supports jump-to-position (windowed
prepare), so a chapter jump = seek to its first `sentence_order`. **Agreed design (kept
deliberately simple):**
- **Structure from the file when present:** EPUB spine items and FB2 `<section>` give real,
  stable chapter boundaries (filter out empty/very short front-matter sections).
- **Structureless formats (TXT, and PDF/DOC text after extraction):** a cheap deterministic
  heading regex (e.g. `^(chapter|глава|kapitel)\s+\w+`). No AI — avoids
  hallucinated, non-deterministic chapters and avoids enlarging the fragile PDF extraction.
- **AI-inferred chapters: deferred.** Rejected for the default path because (a) it mixes
  guesses with file-truth, (b) the real cost is re-aligning AI output to our own sentence
  numbering, and (c) adding structure to the same PDF response worsens the P1.6 truncation
  risk. Only revisit later as a separate, optional pass using inline chapter markers, never
  coupled to the critical extraction call.
- **UI: a flat "Contents" drawer/sheet** (tap a chapter → jump), **not** a left
  Explorer-style folder tree — the tree is a desktop metaphor that clashes with this
  mobile-first app and over-models what is usually a flat chapter list.
**Implemented in code:** added a `chapters` table migration, pure chapter parsing helpers,
best-effort chapter row insertion after sentence insertion, and a player Contents sheet
that maps chapter starts back into the loaded sentence array. **Deploy pending:** migration
not applied, `process-book` not redeployed, frontend not rebuilt into `docs/`.

---

## Done

_(Recorded here as items ship; full detail in `CHANGELOG.md`.)_

- Switch TTS voices to Google Chirp3-HD (en/ru/sv); surface `generate-audio` failures as
  a real `502`; complete the upload format hint from a single source. — 2026-06-18
- Adopt the two-agent Claude+Codex process (this file set). — 2026-06-18
