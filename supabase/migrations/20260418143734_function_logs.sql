CREATE TABLE IF NOT EXISTS public.function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  message text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_function_logs_created_at
  ON public.function_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_function_logs_book_id
  ON public.function_logs (book_id);
