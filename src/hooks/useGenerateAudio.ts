import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Language } from '@/types';
import { VOICE_OPTIONS } from '@/types';
import { clearAudioCache } from './usePlayer';

interface GenerateAudioState {
  isGenerating: boolean;
  progress: string;
  error: string | null;
}

const VOICE_CACHE_KEY = 'audio-voice-cache';
const BATCH_SIZE = 10;

function getVoiceCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VOICE_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function setVoiceCacheEntry(bookId: string, lang: string, voiceId: string) {
  const cache = getVoiceCache();
  cache[`${bookId}/${lang}`] = voiceId;
  localStorage.setItem(VOICE_CACHE_KEY, JSON.stringify(cache));
}

function shouldForceRegenerate(bookId: string, lang: string, voice: string | undefined): boolean {
  if (!voice) return false;
  const cache = getVoiceCache();
  const cacheKey = `${bookId}/${lang}`;
  const cachedVoice = cache[cacheKey];
  if (!cachedVoice) {
    const defaultVoice = VOICE_OPTIONS[lang as Language]?.[0]?.id;
    return voice !== defaultVoice;
  }
  return cachedVoice !== voice;
}

export function useGenerateAudio(bookId: string | undefined) {
  const [state, setState] = useState<GenerateAudioState>({
    isGenerating: false,
    progress: '',
    error: null,
  });

  // Track which sentence ranges have been generated per language to avoid duplicate calls
  const generatedRangesRef = useRef<Record<string, Set<number>>>({});

  const resetRanges = useCallback(() => {
    generatedRangesRef.current = {};
  }, []);

  const generateBatch = useCallback(async (
    language: Language,
    startOrder: number,
    voice?: string,
    forceRegenerate?: boolean,
    silent?: boolean, // don't show progress UI for background prefetch
  ) => {
    if (!bookId) return;

    // Check if this range was already generated (unless forcing)
    const langKey = `${language}-${voice || 'default'}`;
    const ranges = generatedRangesRef.current[langKey] || new Set<number>();
    if (!forceRegenerate) {
      if (ranges.has(startOrder)) return;
    }

    if (!silent) {
      setState(s => ({ ...s, isGenerating: true, progress: `Generating audio (${language})…`, error: null }));
    }

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
          body: JSON.stringify({
            bookId,
            language,
            voice,
            forceRegenerate: forceRegenerate || false,
            startOrder,
            count: BATCH_SIZE,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Generation failed');

      if (!forceRegenerate && !result.skippedMissingTranslation) {
        ranges.add(startOrder);
        generatedRangesRef.current[langKey] = ranges;
      }

      if (voice) setVoiceCacheEntry(bookId, language, voice);
      if (forceRegenerate) clearAudioCache();

      if (!silent) {
        setState(s => ({ ...s, isGenerating: false, progress: '' }));
      }
    } catch (err: any) {
      if (!silent) {
        setState({ isGenerating: false, progress: '', error: err.message });
      }
      console.error('Audio batch generation error:', err);
    }
  }, [bookId]);

  const generateBothBatch = useCallback(async (
    lang1: Language,
    lang2: Language,
    startOrder: number,
    voice1?: string,
    voice2?: string,
    forceRegenerate?: boolean,
    silent?: boolean,
  ) => {
    if (!bookId) return;

    const force1 = forceRegenerate || shouldForceRegenerate(bookId, lang1, voice1);
    const force2 = forceRegenerate || shouldForceRegenerate(bookId, lang2, voice2);

    if (force1 || force2) {
      resetRanges();
    }

    if (!silent) {
      setState({ isGenerating: true, progress: `Generating audio…`, error: null });
    }

    await Promise.all([
      generateBatch(lang1, startOrder, voice1, force1, silent),
      generateBatch(lang2, startOrder, voice2, force2, silent),
    ]);

    if (!silent) {
      setState({ isGenerating: false, progress: '', error: null });
    }
  }, [bookId, generateBatch, resetRanges]);

  return { ...state, generateBatch, generateBothBatch, resetRanges };
}
