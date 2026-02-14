import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaybackSettings, Language, Sentence } from '@/types';
import { supabase } from '@/integrations/supabase/client';

function getSentenceText(sentence: Sentence, lang: Language): string {
  const map: Record<Language, string> = {
    en: sentence.enTranslation,
    ru: sentence.ruTranslation,
    sv: sentence.svTranslation,
  };
  return map[lang] || sentence.originalText;
}

async function fetchTTSAudio(text: string, language: Language): Promise<HTMLAudioElement> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ text, language }),
  });

  if (!response.ok) {
    throw new Error(`TTS request failed: ${response.status}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  return audio;
}

function playAudioElement(audio: HTMLAudioElement, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.playbackRate = speed;
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(audio.src);
      reject(e);
    };
    audio.play().catch(reject);
  });
}

function getDefaultSettings(originalLanguage: Language): PlaybackSettings {
  const lang1 = originalLanguage;
  const lang2: Language = originalLanguage === 'en' ? 'ru' : 'en';
  return {
    language1: lang1,
    language2: lang2,
    playbackOrder: '1-2',
    playbackSpeed: 1,
    pauseDuration: 2,
  };
}

function loadBookSettings(bookId: string, originalLanguage: Language): PlaybackSettings {
  try {
    const stored = localStorage.getItem(`player-settings-${bookId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.language1 && parsed.language2 && parsed.language1 !== parsed.language2) {
        return { ...getDefaultSettings(originalLanguage), ...parsed };
      }
    }
  } catch {}
  return getDefaultSettings(originalLanguage);
}

function saveBookSettings(bookId: string, settings: PlaybackSettings) {
  try {
    localStorage.setItem(`player-settings-${bookId}`, JSON.stringify(settings));
  } catch {}
}

export function usePlayer(sentences: Sentence[], initialIndex?: number, bookId?: string, originalLanguage?: Language) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);

  useEffect(() => {
    if (initialIndex != null && initialIndex > 0 && sentences.length > 0) {
      setCurrentIndex(Math.min(initialIndex, sentences.length - 1));
    }
  }, [initialIndex, sentences.length]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLang, setActiveLang] = useState<1 | 2 | null>(null);
  const [settings, _setSettings] = useState<PlaybackSettings>(() =>
    getDefaultSettings(originalLanguage || 'en')
  );

  useEffect(() => {
    if (bookId && originalLanguage) {
      _setSettings(loadBookSettings(bookId, originalLanguage));
    }
  }, [bookId, originalLanguage]);

  const setSettings = useCallback((newSettings: PlaybackSettings) => {
    _setSettings(newSettings);
    if (bookId) {
      saveBookSettings(bookId, newSettings);
    }
  }, [bookId]);

  const abortRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopCurrent = useCallback(() => {
    abortRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      URL.revokeObjectURL(currentAudioRef.current.src);
      currentAudioRef.current = null;
    }
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
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
        // Fetch and play language 1
        setIsLoading(true);
        setActiveLang(activeLang1);
        const audio1 = await fetchTTSAudio(text1, lang1);
        if (abortRef.current) return;
        setIsLoading(false);
        currentAudioRef.current = audio1;
        await playAudioElement(audio1, settings.playbackSpeed);
        currentAudioRef.current = null;
        if (abortRef.current) return;

        // Pause between languages
        setActiveLang(null);
        await wait(settings.pauseDuration * 1000);
        if (abortRef.current) return;

        // Fetch and play language 2
        setIsLoading(true);
        setActiveLang(activeLang2);
        const audio2 = await fetchTTSAudio(text2, lang2);
        if (abortRef.current) return;
        setIsLoading(false);
        currentAudioRef.current = audio2;
        await playAudioElement(audio2, settings.playbackSpeed);
        currentAudioRef.current = null;
        if (abortRef.current) return;

        // Pause before next sentence
        setActiveLang(null);
        await wait(settings.pauseDuration * 500);
        if (abortRef.current) return;

        // Move to next sentence
        playSentence(index + 1);
      } catch (err) {
        console.error('Playback error:', err);
        setIsPlaying(false);
        setActiveLang(null);
        setIsLoading(false);
      }
    },
    [sentences, settings, wait]
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

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        URL.revokeObjectURL(currentAudioRef.current.src);
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
