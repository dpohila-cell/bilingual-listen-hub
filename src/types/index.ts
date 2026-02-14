export type Language = 'ru' | 'en' | 'sv';

export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Russian',
  en: 'English',
  sv: 'Swedish',
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  sv: '🇸🇪',
};

// Google Cloud TTS voice options per language
export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
}

export const VOICE_OPTIONS: Record<Language, VoiceOption[]> = {
  en: [
    { id: 'en-US-Wavenet-D', name: 'James', gender: 'Male' },
    { id: 'en-US-Wavenet-C', name: 'Sarah', gender: 'Female' },
    { id: 'en-US-Wavenet-B', name: 'Michael', gender: 'Male' },
    { id: 'en-US-Wavenet-F', name: 'Emily', gender: 'Female' },
  ],
  ru: [
    { id: 'ru-RU-Wavenet-B', name: 'Dmitry', gender: 'Male' },
    { id: 'ru-RU-Wavenet-A', name: 'Anna', gender: 'Female' },
    { id: 'ru-RU-Wavenet-D', name: 'Alexei', gender: 'Male' },
    { id: 'ru-RU-Wavenet-C', name: 'Elena', gender: 'Female' },
  ],
  sv: [
    { id: 'sv-SE-Wavenet-A', name: 'Astrid', gender: 'Female' },
    { id: 'sv-SE-Wavenet-B', name: 'Erik', gender: 'Male' },
  ],
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
  voice1?: string;
  voice2?: string;
}
