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
- Google TTS for generated audio

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

Optional model overrides:

```env
OPENAI_MODEL=
OPENAI_TRANSLATION_MODEL=
OPENAI_DOCUMENT_MODEL=
OPENAI_BASE_URL=
```

## Supabase Setup

Apply the migrations in `supabase/migrations`, deploy the functions in `supabase/functions`, then set the required function secrets in your Supabase dashboard or CLI.
