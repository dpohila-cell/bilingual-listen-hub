# Architecture

How Bilingual Listen Hub actually works, end to end. This is the map; product behavior
rules live in `PRODUCT_BEHAVIOR.md`.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn-ui. A single-page app
  served as static files from `docs/` on GitHub Pages (domain `bi-reader.lynxpilot.io`).
- **Backend:** Supabase — Auth, Postgres, Storage, Edge Functions (Deno).
- **External services:** OpenAI (translation, PDF text extraction, fallback language
  detection) and Google Cloud Text-to-Speech (audio, Chirp3-HD voices).

## Data model (Postgres, all with row-level security)

- `profiles` — one row per user, auto-created on signup.
- `books` — `id`, `user_id`, `title`, `author`, `original_language`, `file_path`,
  `status` (`processing` | `ready`), `sentence_count`.
- `sentences` — `book_id`, `sentence_order`, `original_text`, and `en_translation`,
  `ru_translation`, `sv_translation` (nullable until translated).
- `user_progress` — last read position per (user, book).
- `function_logs` — diagnostic log rows written by edge functions.

RLS: users can only read/write their own books, their own books' sentences (via
`user_owns_book`), and their own progress.

## Storage

- `ebooks` bucket (**private**) — uploaded source files at `userId/timestamp-filename`.
  The real key is stored in `books.file_path`.
- `audio` bucket (**public**) — generated MP3s at
  `bookId/<language>/<safeVoiceName>/<00001>.mp3`. The voice name is sanitized
  (non-alphanumeric → `_`). The player builds these public URLs directly.

## Edge functions (`supabase/functions/`)

- `process-book` — reads the uploaded file, extracts text per format (PDF via OpenAI;
  EPUB/DOCX via ZIP parsing; MOBI/AZW via PalmDoc; DOC via OLE2; FB2/TXT natively),
  detects language (by script first, OpenAI fallback), splits into sentences, stores them,
  and translates the first batch.
- `translate-batch` — translates one range of sentences on demand (used by the player).
- `translate-all` — translates the whole book in chained background batches.
  **Slated for removal** (see the windowed decision in `PRODUCT_BEHAVIOR.md`).
- `generate-audio` — synthesizes a batch of sentences for one language/voice via Google
  TTS and uploads MP3s. Returns `502` with Google's message if nothing could be generated.
- `tts-preview` — synthesizes a short sample for voice preview.

All functions use `verify_jwt=false` at the platform and (except `tts-preview` today)
validate the user themselves via `auth.getUser()` before doing work.

## Request flow

### Upload (`UploadPage` → `process-book`)
1. File uploaded to the `ebooks` bucket; a `books` row is created with `status=processing`.
2. `process-book` extracts text, detects language, stores sentences, translates the first
   batch.
3. The client checks `sentence_count`; if > 0 it sets `status=ready` and generates the
   first audio batch, then opens the player.

### Playback (`Player` + `usePlayer`)
1. All sentences are fetched (paginated past the 1000-row limit) into memory.
2. Before playing a batch, the player ensures the window is translated (`translate-batch`)
   and voiced (`generate-audio`) for both languages, then preloads the MP3s.
3. `usePlayer` plays language 1, pauses, plays language 2, pauses, advances. A
   generation counter cancels stale playback when the user pauses or seeks.
4. When 5 sentences remain in the current window, the next window is prepared silently.

## Frontend key modules

- `src/pages/Player.tsx` — playback orchestration (window prepare, prefetch, translation
  gating). Large; a split is on the roadmap.
- `src/hooks/usePlayer.ts` — the audio playback engine (two reusable audio elements, iOS
  unlock, speed, pause handling).
- `src/hooks/useGenerateAudio.ts`, `useTranslateBatch.ts`, `useBackgroundTranslation.ts` —
  client calls into the edge functions.
- `src/hooks/useVoiceSettings.ts` + `src/types/index.ts` (`VOICE_OPTIONS`) — voice list
  (single source of truth) and per-language voice selection with preview.
- `src/components/UploadZone.tsx` — drag/drop + file picker; `ACCEPTED_FORMATS` is the
  single source of truth for supported formats.

## Deploy

See `AGENTS.md`. Frontend = build into `docs/` + push `main` (GitHub Pages). Edge
functions = deploy to Supabase project `mhsbjqoqljytyskgxckn` independently.
