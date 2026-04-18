import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Language, VOICE_OPTIONS } from '@/types';

export interface VoiceSettings {
  voices: Record<Language, string>;
  version: number; // incremented on change to trigger regeneration
}

const STORAGE_KEY = 'global-voice-settings';

function getDefaults(): VoiceSettings {
  return {
    voices: {
      en: VOICE_OPTIONS.en[0].id,
      ru: VOICE_OPTIONS.ru[0].id,
      sv: VOICE_OPTIONS.sv[0].id,
    },
    version: 0,
  };
}

function load(): VoiceSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.voices) return { ...getDefaults(), ...parsed };
    }
  } catch {}
  return getDefaults();
}

function save(settings: VoiceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(load);

  const setVoice = useCallback((lang: Language, voiceId: string) => {
    setSettings((prev) => {
      const next: VoiceSettings = {
        voices: { ...prev.voices, [lang]: voiceId },
        version: prev.version + 1,
      };
      save(next);
      return next;
    });
  }, []);

  const getVoice = useCallback((lang: Language) => {
    return settings.voices[lang] || VOICE_OPTIONS[lang][0].id;
  }, [settings]);

  return { voiceSettings: settings, setVoice, getVoice };
}

// Preview a voice with Google TTS via edge function
export function useVoicePreview() {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewingVoice(null);
  }, []);

  const previewVoice = useCallback(async (voiceId: string, language: Language) => {
    stopPreview();
    setPreviewingVoice(voiceId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const sampleTexts: Record<Language, string> = {
        en: 'Hello! This is how I sound when reading your book.',
        ru: 'Привет! Вот так я звучу, когда читаю вашу книгу.',
        sv: 'Hej! Så här låter jag när jag läser din bok.',
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ text: sampleTexts[language], voice: voiceId, language }),
        }
      );

      if (!response.ok) throw new Error('Preview failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewingVoice(null);
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch (err) {
      console.error('Voice preview error:', err);
      setPreviewingVoice(null);
    }
  }, [stopPreview]);

  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  return { previewVoice, previewingVoice, stopPreview };
}
