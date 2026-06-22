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

### P3.4 — Real tests · Planned
The suite is one trivial `true===true` test. **Fix:** add real tests for the upload flow,
deletion flow, translation retry/alignment, and player readiness.

### P3.5 — Enable strict TypeScript (deferred from P3.1) · Planned
`strict`, `noImplicitAny`, and `strictNullChecks` are off. Turning them on will surface
many new errors across the codebase, so it is a separate incremental effort (enable one
flag at a time, fix the fallout per area). Not started.

---

## Done

_(Recorded here as items ship; full detail in `CHANGELOG.md`.)_

- Switch TTS voices to Google Chirp3-HD (en/ru/sv); surface `generate-audio` failures as
  a real `502`; complete the upload format hint from a single source. — 2026-06-18
- Adopt the two-agent Claude+Codex process (this file set). — 2026-06-18
