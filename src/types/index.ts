export type Language = 'ru' | 'en' | 'sv';

export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  sv: 'Svenska',
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  sv: '🇸🇪',
};

export interface Book {
  id: string;
  title: string;
  author: string;
  originalLanguage: Language;
  fileFormat: string;
  coverUrl?: string;
  chapterCount: number;
  sentenceCount: number;
  createdAt: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  chapterNumber: number;
  chapterTitle: string;
}

export interface Sentence {
  id: string;
  chapterId: string;
  sentenceOrder: number;
  originalText: string;
  ruTranslation: string;
  enTranslation: string;
  svTranslation: string;
  originalAudioUrl?: string;
  ruAudioUrl?: string;
  enAudioUrl?: string;
  svAudioUrl?: string;
}

export interface UserProgress {
  bookId: string;
  lastSentencePosition: number;
  completedSentences: number;
  totalSentences: number;
}

export interface PlaybackSettings {
  language1: Language;
  language2: Language;
  playbackOrder: '1-2' | '2-1';
  playbackSpeed: number;
  pauseDuration: number;
}
