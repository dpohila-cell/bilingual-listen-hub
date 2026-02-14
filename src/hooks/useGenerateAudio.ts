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

  const generate = useCallback(async (language: Language) => {
    if (!bookId) return;
    setState({ isGenerating: true, progress: `Генерация аудио (${language})…`, error: null });

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
          body: JSON.stringify({ bookId, language }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Generation failed');

      setState({
        isGenerating: false,
        progress: `Готово! Сгенерировано: ${result.generated}, пропущено: ${result.skipped || 0}`,
        error: null,
      });
    } catch (err: any) {
      setState({ isGenerating: false, progress: '', error: err.message });
    }
  }, [bookId]);

  const generateBoth = useCallback(async (lang1: Language, lang2: Language) => {
    if (!bookId) return;
    setState({ isGenerating: true, progress: `Генерация аудио (${lang1})…`, error: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      for (const lang of [lang1, lang2]) {
        setState(s => ({ ...s, progress: `Генерация аудио (${lang})…` }));
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audio`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ bookId, language: lang }),
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Generation failed for ${lang}`);
      }

      setState({ isGenerating: false, progress: 'Все аудио сгенерированы!', error: null });
    } catch (err: any) {
      setState({ isGenerating: false, progress: '', error: err.message });
    }
  }, [bookId]);

  return { ...state, generate, generateBoth };
}
