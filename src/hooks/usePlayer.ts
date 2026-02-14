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

const LANG_TO_BCP47: Record<Language, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  sv: 'sv-SE',
};

function speakText(text: string, language: Language, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_TO_BCP47[language] || 'en-US';
    utterance.rate = speed;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') {
        resolve();
      } else {
        reject(e);
      }
    };
    speechSynthesis.speak(utterance);
  });
}

export function usePlayer(sentences: Sentence[], initialIndex?: number) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);

  // Update index when initialIndex loads
  useEffect(() => {
    if (initialIndex != null && initialIndex > 0 && sentences.length > 0) {
      setCurrentIndex(Math.min(initialIndex, sentences.length - 1));
    }
  }, [initialIndex, sentences.length]);
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

  const stopCurrent = useCallback(() => {
    abortRef.current = true;
    speechSynthesis.cancel();
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
        // Play language 1
        setIsLoading(false);
        setActiveLang(activeLang1);
        await speakText(text1, lang1, settings.playbackSpeed);
        if (abortRef.current) return;

        // Pause between languages
        setActiveLang(null);
        await wait(settings.pauseDuration * 1000);
        if (abortRef.current) return;

        // Play language 2
        setActiveLang(activeLang2);
        await speakText(text2, lang2, settings.playbackSpeed);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      speechSynthesis.cancel();
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
