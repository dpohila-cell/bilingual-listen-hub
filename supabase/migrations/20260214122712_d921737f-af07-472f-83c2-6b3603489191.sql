
-- Create storage bucket for generated audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for all audio files
CREATE POLICY "Audio files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

-- Authenticated users can upload audio to their book folders
CREATE POLICY "Users can upload audio for own books"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio'
  AND auth.role() = 'authenticated'
);

-- Service role can manage all audio files (for edge functions)
CREATE POLICY "Service role can manage audio"
ON storage.objects FOR ALL
USING (bucket_id = 'audio')
WITH CHECK (bucket_id = 'audio');
