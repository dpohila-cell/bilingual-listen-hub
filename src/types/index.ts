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

// Google Chirp3-HD voices — newest, most natural generation (replaces legacy WaveNet).
export const VOICE_OPTIONS: Record<Language, VoiceOption[]> = {
  en: [
    { id: 'en-US-Chirp3-HD-Charon', name: 'James', gender: 'Male' },
    { id: 'en-US-Chirp3-HD-Aoede', name: 'Sarah', gender: 'Female' },
    { id: 'en-US-Chirp3-HD-Fenrir', name: 'Michael', gender: 'Male' },
    { id: 'en-US-Chirp3-HD-Kore', name: 'Emily', gender: 'Female' },
  ],
  ru: [
    { id: 'ru-RU-Chirp3-HD-Charon', name: 'Dmitry', gender: 'Male' },
    { id: 'ru-RU-Chirp3-HD-Aoede', name: 'Anna', gender: 'Female' },
    { id: 'ru-RU-Chirp3-HD-Fenrir', name: 'Alexei', gender: 'Male' },
    { id: 'ru-RU-Chirp3-HD-Kore', name: 'Elena', gender: 'Female' },
  ],
  sv: [
    { id: 'sv-SE-Chirp3-HD-Aoede', name: 'Astrid', gender: 'Female' },
    { id: 'sv-SE-Chirp3-HD-Charon', name: 'Erik', gender: 'Male' },
    { id: 'sv-SE-Chirp3-HD-Kore', name: 'Linnea', gender: 'Female' },
    { id: 'sv-SE-Chirp3-HD-Fenrir', name: 'Lars', gender: 'Male' },
  ],
};

export interface Book {
  id: string;
  title: string;
  author: string;
  originalLanguage: Language;
  fileFormat: string;
  filePath?: string | null;
  status?: string;
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
