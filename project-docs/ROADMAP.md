# Roadmap

The single consolidated backlog — both code audits (Claude + Codex) plus the locked
windowed translate/audio decision, merged and de-duplicated, ordered by priority.

Status legend: `Planned` → `In progress` → `Done`. When an item ships, flip it to `Done`
and record it in `CHANGELOG.md`.

---

## P0 — Security & cost (do first)

### P0.1 — Authenticate `tts-preview` · Planned
`tts-preview` only checks that an `Authorization` header exists; it never validates the
user via `auth.getUser()`. Anyone who knows the endpoint can spend Google TTS quota.
**Fix:** add the same `getUser()` check the other functions use. **Affects:**
`supabase/functions/tts-preview/index.ts`.

### P0.2 — Fix book deletion + tighten audio storage policy · Planned
Two problems in one area:
- Deletion leaves paid files behind. The ebook is removed by the wrong key
  (`[bookId]` instead of `books.file_path` = `userId/timestamp-name`), and the audio
  deletion only walks two path levels while files live three levels deep
  (`bookId/lang/voice/file`), so audio is not actually removed.
- The `audio` bucket RLS policy `"Service role can manage audio" FOR ALL` has no role
  restriction, so any authenticated user can read/overwrite/delete any audio; the upload
  policy checks only `authenticated`, not ownership.
**Fix:** delete by `file_path` and recurse the audio folder; restrict the `FOR ALL`
policy to `service_role` and scope upload to the user's own book path. **Affects:**
`src/pages/Library.tsx`, `supabase/migrations/*` (new migration).

---

## P1 — Correctness

### P1.1 — Windowed translate/audio (LOCKED) · Planned
Remove the whole-book translation path and keep only the on-demand windowed one (see
`PRODUCT_BEHAVIOR.md`). **Remove:** `translate-all` edge function, `useBackgroundTranslation`
hook, the 15s `refetchInterval` in `Player.tsx`. Audio is already windowed — leave it.
Removing `translate-all` also deletes one of the three duplicate translation copies.

### P1.2 — Reliable translation · Planned
Translation currently trusts the model to return exactly N items in array order and
attaches them by index; a short/reordered response silently mis-assigns translations, and
`translate-batch`'s fallback writes the original text into all three language fields. A
sentence is also treated as "translated" whenever `en_translation` is non-null, so a row
with English but empty Russian/Swedish is never retried.
**Fix:** request structured JSON output, attach translations by sentence **id**, validate
count, and re-translate partial rows. **Affects:** `translate-batch` (+ the shared
translation helper once consolidated, see P3.3).

### P1.3 — Honest `ready` status · Planned
The client sets `status=ready` whenever `sentence_count > 0`, even if `process-book`
errored or timed out, so a partially processed book can open. And the library lists both
`ready` and `processing` books with a no-op filter, so a `processing` book can be opened
into an empty player.
**Fix:** mark `ready` based on real completion; don't present/open `processing` books as
ready. **Affects:** `src/pages/UploadPage.tsx`, `src/pages/Library.tsx`,
`supabase/functions/process-book/index.ts`.

### P1.4 — `process-book` atomicity · Planned
On re-processing, old sentences are deleted then new ones inserted without a transaction;
a mid-way failure leaves the book in a half state. **Fix:** make the replace atomic (or
insert-then-swap). **Affects:** `supabase/functions/process-book/index.ts`.

---

## P2 — UX

### P2.1 — Collapse duplicate player controls · Planned
Rewind/FastForward are wired to the same handlers as Prev/Next
(`onRewind={goToPrev}`, `onForward={goToNext}`), so five buttons do three things.
**Fix:** give them a distinct action (e.g. ±10 sentences) or remove them.
**Affects:** `src/components/PlayerControls.tsx`, `src/pages/Player.tsx`.

### P2.2 — Upload validation + size limit · Planned
Drag-and-drop accepts any file (the `accept` filter only covers the file picker), and
there is no size limit, so a huge PDF can go into an expensive AI extraction. **Fix:**
validate the extension on drop and enforce a max size before upload. **Affects:**
`src/components/UploadZone.tsx`, `src/pages/UploadPage.tsx`.

### P2.3 — Card and settings polish · Planned
`BookCard` uses `parseInt(book.id)` on a UUID (often `NaN` → missing cover color) and can
show `NaN%` progress when totals are 0; Settings has dead disabled sections.
**Fix:** pick the cover color deterministically from the UUID, guard the percentage, label
or remove the disabled sections. **Affects:** `src/components/BookCard.tsx`,
`src/pages/SettingsPage.tsx`.

---

## P3 — Code quality & tests

### P3.1 — Fix ESLint + enable strict TS gradually · Planned
`npm run lint` fails with 11 errors / 15 warnings (explicit `any`, empty catch, missing
hook deps, a forbidden `require`). Strict TypeScript is off. **Fix:** clear the errors,
then turn on strict flags incrementally.

### P3.2 — Remove dead code · Planned
`shouldForceRegenerate` always returns false; `clearAudioCache` is a no-op; `VOICE_OPTIONS`
is imported unused in playback settings; placeholder prefetch comments. **Fix:** delete.

### P3.3 — Split oversized files + consolidate translation · Planned
`process-book` (~30 KB), `Player.tsx` (~23 KB), `usePlayer.ts` (~15 KB) are hard to
maintain. The translation prompt + JSON-repair + apply logic is copied in three places
(`translate-all`, `translate-batch`, `process-book`). **Fix:** split into small modules
and extract one shared translation helper in `supabase/functions/_shared/`. (P1.1 removes
the `translate-all` copy already.)

### P3.4 — Real tests · Planned
The suite is one trivial `true===true` test. **Fix:** add real tests for the upload flow,
deletion flow, translation retry/alignment, and player readiness.

---

## Done

_(Recorded here as items ship; full detail in `CHANGELOG.md`.)_

- Switch TTS voices to Google Chirp3-HD (en/ru/sv); surface `generate-audio` failures as
  a real `502`; complete the upload format hint from a single source. — 2026-06-18
- Adopt the two-agent Claude+Codex process (this file set). — 2026-06-18
