import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaybackSettings, Language, Sentence } from '@/types';
import { supabase } from '@/integrations/supabase/client';

function getSentenceText(sentence: Sentence, lang: Language): string {
  const map: Record<Language, string> = {
    en: sentence.enTranslation,
    ru: sentence.ruTranslation,
    sv: sentence.svTranslation,
  };
  const text = map[lang];
  return text || sentence.originalText;
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

// Cache cleared on voice change — URLs are always built fresh with cache buster
export function clearAudioCache() {
  // no-op now; URLs are always generated fresh
}

function buildAudioUrl(bookId: string, language: Language, sentenceOrder: number): string {
  const url = getAudioUrl(bookId, language, sentenceOrder);
  return `${url}?t=${Date.now()}`;
}

// Two reusable audio elements — unlocked once from user gesture on iOS
let unlockedAudioA: HTMLAudioElement | null = null;
let unlockedAudioB: HTMLAudioElement | null = null;

/** Call this synchronously inside a click/tap handler to unlock audio on iOS */
export function unlockAudioForIOS() {
  if (!unlockedAudioA) {
    unlockedAudioA = new Audio();
    unlockedAudioA.preload = 'auto';
  }
  if (!unlockedAudioB) {
    unlockedAudioB = new Audio();
    unlockedAudioB.preload = 'auto';
  }
  // Silent play to unlock — iOS requires this from gesture context
  unlockedAudioA.play().catch(() => {});
  unlockedAudioA.pause();
  unlockedAudioB.play().catch(() => {});
  unlockedAudioB.pause();
}

function getUnlockedAudio(slot: 'A' | 'B'): HTMLAudioElement {
  if (slot === 'A') {
    if (!unlockedAudioA) { unlockedAudioA = new Audio(); unlockedAudioA.preload = 'auto'; }
    return unlockedAudioA;
  }
  if (!unlockedAudioB) { unlockedAudioB = new Audio(); unlockedAudioB.preload = 'auto'; }
  return unlockedAudioB;
}

function playAudioElement(audio: HTMLAudioElement, bookId: string, language: Language, sentenceOrder: number, speed: number, retries = 3): Promise<'played' | 'skipped'> {
  return new Promise((resolve) => {
    let attemptCount = 0;
    let resolved = false;

    const done = (result: 'played' | 'skipped') => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const tryPlay = () => {
      const url = buildAudioUrl(bookId, language, sentenceOrder);
      audio.playbackRate = speed;
      audio.currentTime = 0;
      audio.src = url;
      audio.play().catch(() => {
        // play() rejected — let error event handle retries
        // If error event doesn't fire within 3s, skip
        setTimeout(() => {
          if (!resolved) {
            onError();
          }
        }, 3000);
      });
    };

    const onEnded = () => { done('played'); };
    const onError = () => {
      attemptCount++;
      if (attemptCount < retries) {
        // Retry after delay — audio file may still be generating
        setTimeout(() => {
          if (!resolved) tryPlay();
        }, 2000);
      } else {
        console.warn(`Audio not available after ${retries} retries, skipping sentence ${sentenceOrder}`);
        done('skipped');
      }
    };
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    tryPlay();
  });
}

export function usePlayer(sentences: Sentence[], initialIndex?: number, bookId?: string, originalLanguage?: Language) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const initialAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply initialIndex once (on first load), not on subsequent refetches
    if (initialAppliedRef.current) return;
    if (initialIndex != null && initialIndex > 0 && sentences.length > 0) {
      setCurrentIndex(Math.min(initialIndex, sentences.length - 1));
      initialAppliedRef.current = true;
    } else if (sentences.length > 0) {
      initialAppliedRef.current = true;
    }
  }, [initialIndex, sentences.length]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLang, setActiveLang] = useState<1 | 2 | null>(null);
  const [settings, _setSettings] = useState<PlaybackSettings>(() =>
    getDefaultSettings(originalLanguage || 'en')
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

  const playGenRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopCurrent = useCallback(() => {
    playGenRef.current += 1;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  const wait = useCallback((ms: number, gen: number) => {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      const checkAbort = setInterval(() => {
        if (playGenRef.current !== gen) {
          clearTimeout(timer);
          clearInterval(checkAbort);
          resolve();
        }
      }, 50);
    });
  }, []);

  // Prefetch: no-op now, URLs are built fresh each time
  // (kept as a placeholder to avoid removing the effect structure)

  const playSentence = useCallback(
    async (index: number, gen: number) => {
      if (playGenRef.current !== gen || index >= sentences.length || !bookId) {
        setIsPlaying(false);
        setActiveLang(null);
        setIsLoading(false);
        return;
      }

      const sentence = sentences[index];
      setCurrentIndex(index);

      // Read latest settings from ref so mid-playback changes take effect
      const s = settingsRef.current;
      const lang1 = s.playbackOrder === '1-2' ? s.language1 : s.language2;
      const lang2 = s.playbackOrder === '1-2' ? s.language2 : s.language1;
      const activeLang1: 1 | 2 = s.playbackOrder === '1-2' ? 1 : 2;
      const activeLang2: 1 | 2 = s.playbackOrder === '1-2' ? 2 : 1;

      try {
        setActiveLang(activeLang1);
        setIsLoading(false);
        const audioA = getUnlockedAudio('A');
        currentAudioRef.current = audioA;
        await playAudioElement(audioA, bookId, lang1, sentence.sentenceOrder, settingsRef.current.playbackSpeed);
        if (playGenRef.current !== gen) return;

        setActiveLang(null);
        await wait(settingsRef.current.pauseDuration * 1000, gen);
        if (playGenRef.current !== gen) return;

        setActiveLang(activeLang2);
        const audioB = getUnlockedAudio('B');
        currentAudioRef.current = audioB;
        await playAudioElement(audioB, bookId, lang2, sentence.sentenceOrder, settingsRef.current.playbackSpeed);
        if (playGenRef.current !== gen) return;

        setActiveLang(null);
        await wait(settingsRef.current.pauseDuration * 500, gen);
        if (playGenRef.current !== gen) return;

        playSentence(index + 1, gen);
      } catch (err) {
        console.error('Playback error:', err);
        setIsPlaying(false);
        setActiveLang(null);
        setIsLoading(false);
      }
    },
    [sentences, wait, bookId]
  );

  const play = useCallback(() => {
    unlockAudioForIOS(); // Must be called synchronously in gesture context
    const gen = ++playGenRef.current;
    setIsPlaying(true);
    playSentence(currentIndex, gen);
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
      const gen = playGenRef.current;
      playSentence(next, gen);
    }
  }, [stopCurrent, currentIndex, sentences.length, isPlaying, playSentence]);

  const goToPrev = useCallback(() => {
    stopCurrent();
    setActiveLang(null);
    const prev = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prev);
    if (isPlaying) {
      const gen = playGenRef.current;
      playSentence(prev, gen);
    }
  }, [stopCurrent, currentIndex, isPlaying, playSentence]);

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, sentences.length - 1));
    stopCurrent();
    setActiveLang(null);
    setCurrentIndex(clamped);
    if (isPlaying) {
      const gen = playGenRef.current;
      playSentence(clamped, gen);
    }
  }, [stopCurrent, sentences.length, isPlaying, playSentence]);

  useEffect(() => {
    return () => {
      playGenRef.current += 1;
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
    goTo,
    text1: currentSentence ? getSentenceText(currentSentence, settings.language1) : '',
    text2: currentSentence ? getSentenceText(currentSentence, settings.language2) : '',
    totalSentences: sentences.length,
  };
}
