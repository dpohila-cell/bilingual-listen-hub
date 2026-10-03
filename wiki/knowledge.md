# Knowledge base: bilingual-listen-hub

## Contents

- [Headline](#headline)
- [Findings](#findings)
- [Rules and concepts](#rules-and-concepts)
- [Things](#things)
- [Sources](#sources)
- [Open questions](#open-questions)

## Headline

The app turns an uploaded ebook into sentence-by-sentence translation with
generated speech, in English, Russian and Swedish.

Two paid-quota security holes were found and closed here: an unauthenticated
endpoint that anyone could spend Google TTS credit through, and a storage policy
that let any signed-in user read, overwrite or delete any other user's audio.

## Findings

### An endpoint checked that a token existed, not that it was valid

`tts-preview` only checked for the presence of an `Authorization` header and
never called `auth.getUser()`. Anyone who knew the endpoint could spend Google
Text-to-Speech quota, which is money rather than inconvenience. The fix applied
the same `getUser()` check the other functions already used, and it was verified
live: a non-user token now returns `401` where it previously returned audio.

The general shape is worth carrying: a header that is present is not a user who
is authenticated, and the difference is invisible until someone bills you.

[sources: `docs/project-docs/ROADMAP.md` 336c…1dfa]

### A storage policy named the wrong role, so everyone was the service

The `audio` bucket carried a "Service role can manage audio" policy that applied
to role `public`, meaning every user. Any user could read, overwrite or delete
any other user's audio. The policy's name described intent while its role
described reality.

In the same area, deleting a book left paid files behind: the ebook was removed
by `[bookId]` instead of by `books.file_path`, and audio deletion walked two path
levels while the files live three deep at `bookId/lang/voice/file`.

[sources: `docs/project-docs/ROADMAP.md` 336c…1dfa]

### Every list that must not drift has one named home in code

The documentation refuses to restate lists that live in code, and names the file
instead: voices in `VOICE_OPTIONS` in `src/types/index.ts`, accepted upload
formats in `ACCEPTED_FORMATS` in `src/lib/uploadValidation.ts`. The documents
point at those rather than copying them.

This is why the format list and the voice list cannot quietly diverge between the
code and the docs.

[sources: `docs/project-docs/PRODUCT_BEHAVIOR.md` 0267…11d5]

### PDF is read from its text layer first, and the fallback can fail invisibly

A PDF is extracted from its own text layer first, with OpenAI kept as the
fallback for scanned PDFs, low-text PDFs, and parser failures. The behaviour
document goes further than the happy path: it records that the fallback can
return an empty or degenerate refusal instead of document text, which is a
failure that looks like an empty book rather than like an error.

[sources: `docs/project-docs/PRODUCT_BEHAVIOR.md` 0267…11d5, `README.md` e726…4bde]

### A configuration variable exists that the app never reads

`VITE_SUPABASE_PROJECT_ID` is kept for reference and tooling, but the application
code reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The
README says so explicitly and names the file that proves it,
`src/integrations/supabase/client.ts`.

Recorded because an unused variable in a config file is exactly what a future
reader will spend an hour changing before discovering it does nothing.

[sources: `README.md` e726…4bde]

### The whole app is static files plus a managed backend

The frontend is a single-page app served as static files from `docs/` on GitHub
Pages at `bi-reader.lynxpilot.io`. Everything else is Supabase: Auth, Postgres,
Storage, and Edge Functions on Deno. Every Postgres table carries row-level
security. The external paid services are OpenAI, for translation, PDF extraction
and fallback language detection, and Google Cloud Text-to-Speech for audio.

[sources: `docs/project-docs/ARCHITECTURE.md` b529…3e37]

## Rules and concepts

### The document that describes behaviour is the one to change first

`PRODUCT_BEHAVIOR.md` calls itself authoritative for upload, translation, audio
and playback, and requires being kept consistent with any change. `ARCHITECTURE.md`
holds the map, and `ROADMAP.md` holds the backlog with a status that flips to
`Done` and is then recorded in `CHANGELOG.md`.

[sources: `docs/project-docs/PRODUCT_BEHAVIOR.md` 0267…11d5, `docs/project-docs/ARCHITECTURE.md` b529…3e37, `docs/project-docs/ROADMAP.md` 336c…1dfa]

### CLAUDE.md and AGENTS.md are now both pointers; the rule set lives in PROJECT_INSTRUCTIONS.md

Superseded the same day it was written. An earlier 2026-10-03 change had just
consolidated `AGENTS.md`'s rules into `CLAUDE.md`. A second change later that
day carried the consolidation one step further: the full rule set (deployment
workflow, verification, documentation rules, environment facts, project notes)
moved out of `CLAUDE.md` into a new tool-neutral file, `PROJECT_INSTRUCTIONS.md`.
`CLAUDE.md` and `AGENTS.md` now both hold only a short reading-order pointer
(workspace instructions, then `PROJECT_INSTRUCTIONS.md`) and no rule content of
their own. `PROJECT_INSTRUCTIONS.md` opens with a header stating the project's
deliberate override of the default role split: Claude audits, plans, orchestrates
Codex, and reviews diffs; Codex writes the application code. The project now has
one rule set read by every tool, instead of rules split across entry files that
could drift apart.

[sources: `AGENTS.md` 4ff8…4392, `CLAUDE.md` 9721…5b87, `PROJECT_INSTRUCTIONS.md` 8b81…965f]

## Things

- **Supabase**: Auth, Postgres, Storage and Edge Functions for this app.
- **OpenAI**: translation, PDF text extraction, fallback language detection.
- **Google Cloud Text-to-Speech**: Chirp3-HD voices for English and Swedish,
  Wavenet with SSML for Russian.
- **bi-reader.lynxpilot.io**: where the static frontend is served.

## Sources

| File | Hash | Class |
|---|---|---|
| AGENTS.md | `4ff8…4392` | decision-grade |
| CLAUDE.md | `9721…5b87` | decision-grade |
| docs/project-docs/ARCHITECTURE.md | `b529…3e37` | decision-grade |
| docs/project-docs/CHANGELOG.md | `ea68…12f3` | decision-grade |
| docs/project-docs/PRODUCT_BEHAVIOR.md | `0267…11d5` | decision-grade |
| docs/project-docs/ROADMAP.md | `336c…1dfa` | decision-grade |
| docs/robots.txt | `5271…4cea` | decision-grade |
| PROJECT_INSTRUCTIONS.md | `8b81…965f` | decision-grade |
| public/robots.txt | `5271…4cea` | decision-grade |
| raw/thinking/.PROMPTS.md | `ea13…2f8a` | exploratory |
| README.md | `e726…4bde` | decision-grade |

## Open questions

1. The project shares Supabase and OpenAI with at least two other projects in
   this workspace. The central wiki already records that as a cross-project
   dependency for two of them; this is the third, and `/connect` should fold it
   in.
