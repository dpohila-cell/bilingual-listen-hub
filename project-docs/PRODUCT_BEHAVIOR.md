# Product Behavior

The authoritative description of how Bilingual Listen Hub should behave. Read this before
changing upload, translation, audio, or playback. Keep it consistent with any change.

## Purpose

Help a user upload an ebook, get it translated sentence by sentence, and listen to it
bilingually (original language + one target language) with generated speech.

## Languages and voices

- Supported languages: English (`en`), Russian (`ru`), Swedish (`sv`).
- A book has one `original_language`; the second playback language is the user's choice
  (default: the original's counterpart — `en` ↔ `ru`).
- Voices: English and Swedish use Google Chirp3-HD voices; Russian uses Google Wavenet
  voices with SSML so punctuation and phrase starts are handled more clearly. The single
  source of truth is `VOICE_OPTIONS` in `src/types/index.ts`. The user picks and previews
  a voice per language in Settings.

## Upload

- Accepted formats (single source of truth = `ACCEPTED_FORMATS` in `src/lib/uploadValidation.ts`):
  EPUB, FB2, TXT, DOC, DOCX, PDF, MOBI, AZW, AZW3. PDF is extracted from its text layer
  first, with OpenAI kept as the fallback for scanned PDFs, low-text PDFs, or parser
  failures; the rest use built-in parsers.
- A book becomes `ready` only when it is genuinely processed. A book that is still
  `processing` (or failed) must not be presented or opened as if ready.
- Upload starts immediately after file selection. The initial `books.title` is derived
  from the filename and `books.author` starts blank; during processing, supported
  container formats may auto-fill metadata from the file (EPUB OPF, FB2 `title-info`,
  DOCX core properties). Unsupported formats keep the filename title. Users can rename
  the title and author later from the library.
- New EPUB and FB2 uploads may also extract a cover image for the library card. Cover
  extraction is best-effort only: if the image is missing, malformed, too large, or fails
  to upload, the book still processes normally and keeps the existing gradient placeholder.
- New uploads may also store chapter/section bookmarks. EPUB uses non-empty spine files,
  FB2 uses direct top-level body sections, and PDF/TXT/DOC/MOBI use a deliberately
  conservative heading detector (`Chapter`, `Глава`, `Kapitel`). Chapter extraction is
  metadata only: the flattened `sentences` list remains the source used for empty checks,
  language detection, first-playable translation, inserts, and playback.
- Extracted text is sanitized before it is stored as `sentences.original_text` (the text
  the TTS reads verbatim). Hidden/invisible characters that would make speech synthesis
  mispronounce or stall — control characters, zero-width and bidi marks, soft hyphens,
  BOM — are removed, and non-standard spaces (e.g. non-breaking space) are normalized to
  a regular space; paragraph newlines are preserved so sentence splitting still works.

## Translation and audio — windowed model (LOCKED DECISION, 2026-06-18)

Translation and audio are produced **only in a sliding window around the sentence being
played**, never for the whole book up front. This trades a small wait when jumping into a
new region for much lower cost (you only pay OpenAI/Google for what is actually listened
to) and a simpler system.

Agreed rules:

1. **Jump = short wait.** Seeking to an unprepared position triggers the prepare pipeline
   (translate → audio) for that window, with a visible "preparing…" indicator. This wait
   is accepted by design; it must never look like a silent hang.
2. **No whole-book translation.** The full background translation is removed entirely:
   the `translate-all` edge function, the `useBackgroundTranslation` hook, and the 15s
   `refetchInterval` that existed to surface its results. There is **no** "translate whole
   book" button. The only translation path is the on-demand windowed one driven by the
   player (`ensureTranslated` → `translate-batch`).
3. **Look-ahead = one window.** The next window is prepared when 5 sentences remain in the
   current one (`PREPARE_NEXT_WHEN_REMAINING = 5`). Window size is 10 sentences.
4. **Order within a window:** translate first, then voice. Audio for the original language
   needs no translation; audio for the second language is gated on its translation.
5. **Audio is already windowed** — leave it as is; only the translation side changes.

### Quality requirements that make the windowed model feel solid

- A clear "preparing…" state on first play and after any jump (never a silent stall).
- Robust retry with backoff inside window preparation, because Google Chirp3-HD can
  rate-limit bursts that now happen at the moment of listening.
- Translation must be reliable enough that audio gating works: translations attached to
  the correct sentence (by id, not array position) and partial translations (e.g. English
  filled but Russian/Swedish empty) re-attempted rather than treated as done.

## Playback

- Plays language 1, pauses (`pauseDuration`), plays language 2, pauses, advances.
- Playback order, speed, and pause length are per-book settings.
- Pausing or seeking immediately cancels in-flight playback.
- Before each clip starts, playback waits for browser `canplay` readiness and falls back
  to starting after about 3 seconds so it cannot hang forever.
- Books with more than one stored chapter show a flat Contents drawer in the player.
  Choosing a chapter seeks to that chapter's first sentence through the same preparation
  path as the range slider, so untranslated or unvoiced windows still show the normal
  preparation wait.

## Failure behavior

- A book must never get stuck in `processing`. If `process-book` fails for any
  reason (bad/oversized file, extraction error, OpenAI/Google error, unexpected
  throw), it marks the book `error` so the library shows a real failure the user
  can delete and re-upload — it must not hang as "Processing" forever. `ready` is
  reached only when the book is genuinely processed.
- If audio cannot be generated (e.g. Google billing disabled, invalid voice),
  `generate-audio` returns a real error (`502` with Google's message) and the player shows
  it — it must not stop silently.
- Deleting a book must remove its sentences, progress, the source file (`books.file_path`),
  the optional cover image (`books.cover_path`),
  and all generated audio under `bookId/` — leaving no paid storage behind.
