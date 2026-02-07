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

export function usePlayer(sentences: Sentence[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLang, setActiveLang] = useState<1 | 2 | null>(null);
  const [settings, setSettings] = useState<PlaybackSettings>({
    language1: 'en',
    language2: 'ru',
    playbackOrder: '1-2',
    playbackSpeed: 1,
    pauseDuration: 2,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const simulatePlayback = useCallback(
    (index: number) => {
      if (!isPlayingRef.current || index >= sentences.length) {
        setIsPlaying(false);
        setActiveLang(null);
        return;
      }

      const first = settings.playbackOrder === '1-2' ? 1 : 2;
      const second = first === 1 ? 2 : 1;

      // Play first language
      setActiveLang(first as 1 | 2);
      setCurrentIndex(index);

      const lang1Duration = 2000 / settings.playbackSpeed;
      timerRef.current = setTimeout(() => {
        if (!isPlayingRef.current) return;
        setActiveLang(null);

        // Pause between languages
        timerRef.current = setTimeout(() => {
          if (!isPlayingRef.current) return;
          // Play second language
          setActiveLang(second as 1 | 2);

          const lang2Duration = 2000 / settings.playbackSpeed;
          timerRef.current = setTimeout(() => {
            if (!isPlayingRef.current) return;
            setActiveLang(null);

            // Pause before next sentence
            timerRef.current = setTimeout(() => {
              simulatePlayback(index + 1);
            }, settings.pauseDuration * 500);
          }, lang2Duration);
        }, settings.pauseDuration * 1000);
      }, lang1Duration);
    },
    [sentences.length, settings]
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    isPlayingRef.current = true;
    simulatePlayback(currentIndex);
  }, [currentIndex, simulatePlayback]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    clearTimer();
    setActiveLang(null);
  }, [clearTimer]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const goToNext = useCallback(() => {
    clearTimer();
    setActiveLang(null);
    const next = Math.min(currentIndex + 1, sentences.length - 1);
    setCurrentIndex(next);
    if (isPlaying) {
      simulatePlayback(next);
    }
  }, [clearTimer, currentIndex, sentences.length, isPlaying, simulatePlayback]);

  const goToPrev = useCallback(() => {
    clearTimer();
    setActiveLang(null);
    const prev = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prev);
    if (isPlaying) {
      simulatePlayback(prev);
    }
  }, [clearTimer, currentIndex, isPlaying, simulatePlayback]);

  const currentSentence = sentences[currentIndex];

  return {
    currentIndex,
    currentSentence,
    isPlaying,
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
