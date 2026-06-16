# Bilingual Listen Hub

Bilingual Listen Hub is a React and Supabase app for uploading ebooks, translating sentence-by-sentence content, and listening with generated audio.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn-ui
- Supabase Auth, Database, Storage, and Edge Functions
- OpenAI for translation, language detection, and PDF text extraction
- Google Cloud Text-to-Speech (Chirp3-HD voices) for generated audio

## Local Development

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build the static site into `docs/`:

```sh
npm run build -- --outDir docs
```

## Environment

The frontend reads Supabase config from `.env`:

```env
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Supabase Edge Functions also need server-side secrets set in the Supabase project:

```env
OPENAI_API_KEY=
GOOGLE_TTS_API_KEY=
OPENAI_TRANSLATION_MODEL=gpt-4o-mini
```

> **Google billing must be enabled.** `GOOGLE_TTS_API_KEY` belongs to a Google
> Cloud project that must have billing active, otherwise the Text-to-Speech API
> returns `403 PERMISSION_DENIED` and no audio is produced. The `generate-audio`
> function surfaces this as a `502` with Google's message so the player shows a
> real error instead of stopping silently. Available voices are defined in
> `src/types/index.ts` (`VOICE_OPTIONS`) — currently Google Chirp3-HD across
> English, Russian, and Swedish.

Optional model overrides:

```env
OPENAI_MODEL=
OPENAI_TRANSLATION_MODEL=
OPENAI_DOCUMENT_MODEL=
OPENAI_BASE_URL=
```

## Supabase Setup

Apply the migrations in `supabase/migrations`, deploy the functions in `supabase/functions`, then set the required function secrets in your Supabase dashboard or CLI.

## Deployment

The frontend is hosted on **GitHub Pages**, served from the committed `docs/`
folder on the `main` branch. The custom domain `bi-reader.lynxpilot.io` is set
via `public/CNAME` (copied into `docs/` on every build), and `vite.config.ts`
copies `index.html` to `404.html` for SPA routing.

To publish frontend changes:

```sh
npm run build -- --outDir docs   # rebuild docs/ (keeps CNAME and 404.html)
git add -A && git commit -m "..." && git push
```

GitHub Pages republishes from `docs/` within a few minutes.

Edge Functions deploy separately to Supabase (CLI `supabase functions deploy`,
the dashboard, or the Supabase MCP) — they are not affected by the Pages build.
