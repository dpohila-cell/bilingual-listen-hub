
# Full Backend Setup for Bilingual Library

## Overview
Set up the complete backend infrastructure so uploaded books are persisted, processed, and appear in each user's private library. This includes database tables, file storage, authentication, and an edge function for book processing.

## Step 1: Database Schema (Migration)

Create the following tables with Row Level Security:

- **profiles** -- auto-created on signup via trigger, stores display name
- **books** -- stores book metadata (title, author, language, processing status), owned by user_id
- **sentences** -- stores original text + translations for each sentence in a book
- **user_progress** -- tracks reading position per user per book

Helper function:
- `user_owns_book(book_id)` -- security definer function used in RLS for sentences table

RLS policies ensure each user can only see/modify their own data.

## Step 2: Storage Bucket

Create a private `ebooks` storage bucket for uploaded files, with RLS policies restricting access to the file owner's folder.

## Step 3: Authentication

Add login/signup pages using email + password authentication. Protect the library, upload, and player routes so only authenticated users can access them. Create an AuthProvider context for session management.

## Step 4: Edge Function -- `process-book`

Create a new edge function that:
1. Receives the uploaded file path and book ID
2. Extracts text from the file (initially supports .txt; other formats can be added later)
3. Splits text into sentences
4. Calls an AI model (Lovable AI / Gemini) to generate translations (EN, RU, SV)
5. Inserts sentences into the database
6. Updates the book's processing status to "ready"

## Step 5: Update Upload Flow

Wire up the UploadPage to:
1. Require authentication
2. Upload the file to the `ebooks` storage bucket
3. Insert a new `books` row with status "processing"
4. Call the `process-book` edge function
5. Show real progress and navigate to the player when done

## Step 6: Update Library Page

Replace hardcoded demo data with real database queries:
- Fetch the user's books from the `books` table
- Fetch user progress from `user_progress`
- Show only books with status "ready"

## Step 7: Update Player Page

- Fetch sentences from the database instead of demo data
- Save/restore reading progress to `user_progress`

---

## Technical Details

### Database Tables

```text
profiles
  - id (uuid, PK, references auth.users)
  - display_name (text)
  - created_at (timestamptz)

books
  - id (uuid, PK)
  - user_id (uuid, NOT NULL, references auth.users)
  - title (text)
  - author (text)
  - original_language (text, default 'en')
  - file_path (text)
  - status (text, default 'processing') -- processing | ready | error
  - sentence_count (int, default 0)
  - created_at (timestamptz)

sentences
  - id (uuid, PK)
  - book_id (uuid, references books)
  - sentence_order (int)
  - original_text (text)
  - en_translation (text)
  - ru_translation (text)
  - sv_translation (text)
  - created_at (timestamptz)

user_progress
  - id (uuid, PK)
  - user_id (uuid, references auth.users)
  - book_id (uuid, references books)
  - last_sentence_position (int, default 0)
  - updated_at (timestamptz)
  - UNIQUE(user_id, book_id)
```

### RLS Policies Summary

- **profiles**: Users can read/update only their own profile
- **books**: Users can CRUD only their own books
- **sentences**: Users can read/insert sentences for books they own (via `user_owns_book`)
- **user_progress**: Users can CRUD only their own progress records

### New Files to Create

- `src/pages/AuthPage.tsx` -- Login/signup form
- `src/contexts/AuthContext.tsx` -- Auth session provider
- `src/components/ProtectedRoute.tsx` -- Route guard
- `supabase/functions/process-book/index.ts` -- Book processing edge function

### Files to Modify

- `src/App.tsx` -- Add auth routes, wrap with AuthProvider, protect routes
- `src/pages/Library.tsx` -- Query real data from database
- `src/pages/Player.tsx` -- Query sentences from database, save progress
- `src/pages/UploadPage.tsx` -- Upload file to storage, create book record, call edge function
- `src/components/BottomNav.tsx` -- May need auth-aware navigation
