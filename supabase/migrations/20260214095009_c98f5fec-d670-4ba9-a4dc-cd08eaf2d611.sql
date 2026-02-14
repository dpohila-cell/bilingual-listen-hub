
-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Books table
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  author text DEFAULT '',
  original_language text NOT NULL DEFAULT 'en',
  file_path text,
  status text NOT NULL DEFAULT 'processing',
  sentence_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own books" ON public.books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own books" ON public.books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own books" ON public.books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own books" ON public.books FOR DELETE USING (auth.uid() = user_id);

-- Sentences table
CREATE TABLE public.sentences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  sentence_order integer NOT NULL,
  original_text text NOT NULL,
  en_translation text,
  ru_translation text,
  sv_translation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sentences_book_order ON public.sentences (book_id, sentence_order);

-- Helper function: check if user owns a book (created AFTER books table)
CREATE OR REPLACE FUNCTION public.user_owns_book(_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.books
    WHERE id = _book_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Users can read sentences of own books" ON public.sentences FOR SELECT USING (public.user_owns_book(book_id));
CREATE POLICY "Users can insert sentences for own books" ON public.sentences FOR INSERT WITH CHECK (public.user_owns_book(book_id));

-- User progress table
CREATE TABLE public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  last_sentence_position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress" ON public.user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.user_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own progress" ON public.user_progress FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for ebooks
INSERT INTO storage.buckets (id, name, public) VALUES ('ebooks', 'ebooks', false);

CREATE POLICY "Users can upload to own folder" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own files" ON storage.objects FOR SELECT
  USING (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own files" ON storage.objects FOR DELETE
  USING (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);
