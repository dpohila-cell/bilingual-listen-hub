import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaybackSettings, Language, Sentence } from '@/types';

function getSentenceText(sentence: Sentence, lang: Language): string {
  const map: Record<Language, string> = {
    en: sentence.enTranslation,
    ru: sentence.ruTranslation,
    sv: sentence.svTranslation,
  };
  return map[lang] || sentence.originalText;
}

async function fetchTtsAudio(text: string, language: Language): Promise<HTMLAudioElement> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text, language }),
    }
  );

  if (!response.ok) {
    throw new Error(`TTS request failed: ${response.status}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  return audio;
}

function playAudio(audio: HTMLAudioElement, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.playbackRate = speed;
    audio.onended = () => resolve();
    audio.onerror = (e) => reject(e);
    audio.play().catch(reject);
  });
}

export function usePlayer(sentences: Sentence[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLang, setActiveLang] = useState<1 | 2 | null>(null);
  const [settings, setSettings] = useState<PlaybackSettings>({
    language1: 'en',
    language2: 'ru',
    playbackOrder: '1-2',
    playbackSpeed: 1,
    pauseDuration: 2,
  });

  const abortRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Audio cache to avoid re-fetching
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const getCachedAudio = useCallback(async (text: string, lang: Language) => {
    const key = `${lang}:${text}`;
    if (audioCacheRef.current.has(key)) {
      const cached = audioCacheRef.current.get(key)!;
      cached.currentTime = 0;
      return cached;
    }
    const audio = await fetchTtsAudio(text, lang);
    audioCacheRef.current.set(key, audio);
    return audio;
  }, []);

  const stopCurrent = useCallback(() => {
    abortRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      // Check abort periodically
      const checkAbort = setInterval(() => {
        if (abortRef.current) {
          clearTimeout(timer);
          clearInterval(checkAbort);
          resolve();
        }
      }, 50);
    });
  }, []);

  const playSentence = useCallback(
    async (index: number) => {
      if (abortRef.current || index >= sentences.length) {
        setIsPlaying(false);
        setActiveLang(null);
        setIsLoading(false);
        return;
      }

      const sentence = sentences[index];
      setCurrentIndex(index);

      const lang1 = settings.playbackOrder === '1-2' ? settings.language1 : settings.language2;
      const lang2 = settings.playbackOrder === '1-2' ? settings.language2 : settings.language1;
      const activeLang1: 1 | 2 = settings.playbackOrder === '1-2' ? 1 : 2;
      const activeLang2: 1 | 2 = settings.playbackOrder === '1-2' ? 2 : 1;

      const text1 = getSentenceText(sentence, lang1);
      const text2 = getSentenceText(sentence, lang2);

      try {
        // Fetch audio for language 1
        setIsLoading(true);
        const audio1 = await getCachedAudio(text1, lang1);
        if (abortRef.current) return;

        // Pre-fetch audio for language 2 in background
        const audio2Promise = getCachedAudio(text2, lang2);

        // Play language 1
        setIsLoading(false);
        setActiveLang(activeLang1);
        currentAudioRef.current = audio1;
        await playAudio(audio1, settings.playbackSpeed);
        if (abortRef.current) return;

        // Pause between languages
        setActiveLang(null);
        await wait(settings.pauseDuration * 1000);
        if (abortRef.current) return;

        // Play language 2
        const audio2 = await audio2Promise;
        if (abortRef.current) return;
        setActiveLang(activeLang2);
        currentAudioRef.current = audio2;
        await playAudio(audio2, settings.playbackSpeed);
        if (abortRef.current) return;

        // Pause before next sentence
        setActiveLang(null);
        await wait(settings.pauseDuration * 500);
        if (abortRef.current) return;

        // Pre-fetch next sentence audio
        if (index + 1 < sentences.length) {
          const nextSentence = sentences[index + 1];
          const nextText1 = getSentenceText(nextSentence, lang1);
          getCachedAudio(nextText1, lang1); // fire-and-forget prefetch
        }

        // Move to next sentence
        playSentence(index + 1);
      } catch (err) {
        console.error('Playback error:', err);
        setIsPlaying(false);
        setActiveLang(null);
        setIsLoading(false);
      }
    },
    [sentences, settings, getCachedAudio, wait]
  );

  const play = useCallback(() => {
    abortRef.current = false;
    setIsPlaying(true);
    playSentence(currentIndex);
  }, [currentIndex, playSentence]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    stopCurrent();
    setActiveLang(null);
    setIsLoading(false);
  }, [stopCurrent]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const goToNext = useCallback(() => {
    stopCurrent();
    setActiveLang(null);
    const next = Math.min(currentIndex + 1, sentences.length - 1);
    setCurrentIndex(next);
    if (isPlaying) {
      abortRef.current = false;
      playSentence(next);
    }
  }, [stopCurrent, currentIndex, sentences.length, isPlaying, playSentence]);

  const goToPrev = useCallback(() => {
    stopCurrent();
    setActiveLang(null);
    const prev = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prev);
    if (isPlaying) {
      abortRef.current = false;
      playSentence(prev);
    }
  }, [stopCurrent, currentIndex, isPlaying, playSentence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  const currentSentence = sentences[currentIndex];

  return {
    currentIndex,
    currentSentence,
    isPlaying,
    isLoading,
    activeLang,
    settings,
    setSettings,
    togglePlay,
    goToNext,
    goToPrev,
    text1: currentSentence ? getSentenceText(currentSentence, settings.language1) : '',
    text2: currentSentence ? getSentenceText(currentSentence, settings.language2) : '',
    totalSentences: sentences.length,
  };
}
