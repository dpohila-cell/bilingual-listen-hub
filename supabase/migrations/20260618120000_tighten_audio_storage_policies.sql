-- Tighten audio bucket policies (P0.2)
-- The old "Service role can manage audio" was FOR ALL on role public (everyone),
-- letting any user read/write/delete any audio. Service role bypasses RLS anyway,
-- so it is not needed. Clients never upload audio (generate-audio uses the service
-- role), so the authenticated-only INSERT policy is dropped too. Client-side book
-- deletion (Library) needs a scoped DELETE policy.
DROP POLICY IF EXISTS "Service role can manage audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload audio for own books" ON storage.objects;

CREATE POLICY "Users can delete audio of own books"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio'
  AND public.user_owns_book(((storage.foldername(name))[1])::uuid)
);
