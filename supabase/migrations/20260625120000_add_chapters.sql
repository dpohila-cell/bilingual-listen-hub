CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL,
  title text,
  start_sentence_order integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(book_id, chapter_index)
);

CREATE INDEX idx_chapters_book_start_sentence
  ON public.chapters (book_id, start_sentence_order);

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read chapters of own books"
  ON public.chapters
  FOR SELECT
  USING (public.user_owns_book(book_id));

CREATE POLICY "Users can insert chapters for own books"
  ON public.chapters
  FOR INSERT
  WITH CHECK (public.user_owns_book(book_id));

CREATE POLICY "Users can update chapters of own books"
  ON public.chapters
  FOR UPDATE
  USING (public.user_owns_book(book_id))
  WITH CHECK (public.user_owns_book(book_id));

CREATE POLICY "Users can delete chapters of own books"
  ON public.chapters
  FOR DELETE
  USING (public.user_owns_book(book_id));
