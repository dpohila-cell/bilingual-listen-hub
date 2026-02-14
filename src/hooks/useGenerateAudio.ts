import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Language } from '@/types';

interface GenerateAudioState {
  isGenerating: boolean;
  progress: string;
  error: string | null;
}

export function useGenerateAudio(bookId: string | undefined) {
  const [state, setState] = useState<GenerateAudioState>({
    isGenerating: false,
    progress: '',
    error: null,
  });

  const generate = useCallback(async (language: Language, voice?: string) => {
    if (!bookId) return;
    setState({ isGenerating: true, progress: `Generating audio (${language})…`, error: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ bookId, language, voice }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Generation failed');

      setState({
        isGenerating: false,
        progress: `Done! Generated: ${result.generated}, skipped: ${result.skipped || 0}`,
        error: null,
      });
    } catch (err: any) {
      setState({ isGenerating: false, progress: '', error: err.message });
    }
  }, [bookId]);

  const generateBoth = useCallback(async (lang1: Language, lang2: Language, voice1?: string, voice2?: string) => {
    if (!bookId) return;
    setState({ isGenerating: true, progress: `Generating audio (${lang1})…`, error: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const langs = [
        { lang: lang1, voice: voice1 },
        { lang: lang2, voice: voice2 },
      ];

      for (const { lang, voice } of langs) {
        setState(s => ({ ...s, progress: `Generating audio (${lang})…` }));
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audio`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ bookId, language: lang, voice }),
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Generation failed for ${lang}`);
      }

      setState({ isGenerating: false, progress: 'All audio generated!', error: null });
    } catch (err: any) {
      setState({ isGenerating: false, progress: '', error: err.message });
    }
  }, [bookId]);

  return { ...state, generate, generateBoth };
}
