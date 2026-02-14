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

// Split long text into chunks to avoid browser speechSynthesis length limits
function splitTextIntoChunks(text: string, maxLength = 150): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // Try to split at sentence-ending punctuation
    let splitIndex = -1;
    for (let i = maxLength; i >= maxLength / 2; i--) {
      if (/[.!?;,:]/.test(remaining[i])) {
        splitIndex = i + 1;
        break;
      }
    }
    // Fallback: split at last space
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex <= 0) {
      splitIndex = maxLength;
    }
    
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }
  
  return chunks;
}

function speakChunk(text: string, language: Language, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_TO_BCP47[language] || 'en-US';
    utterance.rate = speed;

    const voices = speechSynthesis.getVoices();
    const langPrefix = language;
    const match = voices.find(v => v.lang.startsWith(langPrefix)) ||
                  voices.find(v => v.lang.startsWith(LANG_TO_BCP47[language]));
    if (match) utterance.voice = match;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    speechSynthesis.speak(utterance);
  });
}

async function speakText(text: string, language: Language, speed: number): Promise<void> {
  const chunks = splitTextIntoChunks(text);
  for (const chunk of chunks) {
    await speakChunk(chunk, language, speed);
  }
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
        setActiveLang(activeLang1);
        setIsLoading(false);
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
