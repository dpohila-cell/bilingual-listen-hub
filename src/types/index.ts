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

// Google TTS voices: en/sv use Chirp3-HD; ru uses Wavenet for SSML-capable Russian prosody.
export const VOICE_OPTIONS: Record<Language, VoiceOption[]> = {
  en: [
    { id: 'en-US-Chirp3-HD-Charon', name: 'James', gender: 'Male' },
    { id: 'en-US-Chirp3-HD-Aoede', name: 'Sarah', gender: 'Female' },
    { id: 'en-US-Chirp3-HD-Fenrir', name: 'Michael', gender: 'Male' },
    { id: 'en-US-Chirp3-HD-Kore', name: 'Emily', gender: 'Female' },
  ],
  ru: [
    { id: 'ru-RU-Wavenet-D', name: 'Dmitry', gender: 'Male' },
    { id: 'ru-RU-Wavenet-A', name: 'Anna', gender: 'Female' },
    { id: 'ru-RU-Wavenet-B', name: 'Alexei', gender: 'Male' },
    { id: 'ru-RU-Wavenet-C', name: 'Elena', gender: 'Female' },
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
  coverPath?: string | null;
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
