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

function getAudioUrl(bookId: string, language: Language, sentenceOrder: number): string {
  const { data } = supabase.storage
    .from('audio')
    .getPublicUrl(`${bookId}/${language}/${String(sentenceOrder).padStart(5, '0')}.mp3`);
  return data.publicUrl;
}

// Prefetch and cache audio elements
const audioCache = new Map<string, HTMLAudioElement>();

function prefetchAudio(bookId: string, language: Language, sentenceOrder: number): HTMLAudioElement {
  const key = `${bookId}/${language}/${sentenceOrder}`;
  if (audioCache.has(key)) return audioCache.get(key)!;

  const url = getAudioUrl(bookId, language, sentenceOrder);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  audioCache.set(key, audio);
  return audio;
}

function playAudioElement(audio: HTMLAudioElement, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.playbackRate = speed;
    audio.currentTime = 0;

    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onError = (e: Event) => {
      cleanup();
      reject(new Error(`Audio playback error: ${(e as ErrorEvent).message || 'unknown'}`));
    };
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.play().catch(reject);
  });
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

  // Prefetch upcoming sentences
  useEffect(() => {
    if (!bookId || sentences.length === 0) return;
    const { language1, language2 } = settings;
    // Prefetch current + next 3 sentences for both languages
    for (let i = currentIndex; i < Math.min(currentIndex + 4, sentences.length); i++) {
      const order = sentences[i].sentenceOrder;
      prefetchAudio(bookId, language1, order);
      prefetchAudio(bookId, language2, order);
    }
  }, [currentIndex, bookId, sentences, settings.language1, settings.language2]);

  const playSentence = useCallback(
    async (index: number) => {
      if (abortRef.current || index >= sentences.length || !bookId) {
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

      try {
        // Play language 1
        setActiveLang(activeLang1);
        setIsLoading(false);
        const audio1 = prefetchAudio(bookId, lang1, sentence.sentenceOrder);
        currentAudioRef.current = audio1;
        await playAudioElement(audio1, settings.playbackSpeed);
        if (abortRef.current) return;

        // Pause between languages
        setActiveLang(null);
        await wait(settings.pauseDuration * 1000);
        if (abortRef.current) return;

        // Play language 2
        setActiveLang(activeLang2);
        const audio2 = prefetchAudio(bookId, lang2, sentence.sentenceOrder);
        currentAudioRef.current = audio2;
        await playAudioElement(audio2, settings.playbackSpeed);
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
    [sentences, settings, wait, bookId]
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
        currentAudioRef.current = null;
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
