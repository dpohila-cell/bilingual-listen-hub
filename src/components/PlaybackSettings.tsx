import { PlaybackSettings as PlaybackSettingsType, Language, VOICE_OPTIONS } from '@/types';
import { LanguagePicker } from './LanguagePicker';
import { Timer, Gauge } from 'lucide-react';

interface PlaybackSettingsProps {
  settings: PlaybackSettingsType;
  onUpdate: (settings: PlaybackSettingsType) => void;
}

export function PlaybackSettingsPanel({ settings, onUpdate }: PlaybackSettingsProps) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-card border border-border p-5">
      <h3 className="font-serif text-lg font-medium">Playback Settings</h3>

      <LanguagePicker
        label="Language 1"
        value={settings.language1}
        onChange={(lang: Language) =>
          onUpdate({
            ...settings,
            language1: lang,
            language2: settings.language2 === lang ? settings.language1 : settings.language2,
          })
        }
      />

      <LanguagePicker
        label="Language 2"
        value={settings.language2}
        onChange={(lang: Language) =>
          onUpdate({
            ...settings,
            language2: lang,
            language1: settings.language1 === lang ? settings.language2 : settings.language1,
          })
        }
        exclude={settings.language1}
      />


      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Timer className="h-3.5 w-3.5" />
          Pause Duration: {settings.pauseDuration}s
        </span>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={settings.pauseDuration}
          onChange={(e) =>
            onUpdate({ ...settings, pauseDuration: parseFloat(e.target.value) })
          }
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0.5s</span>
          <span>5s</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Gauge className="h-3.5 w-3.5" />
          Speed: {settings.playbackSpeed}x
        </span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.25"
          value={settings.playbackSpeed}
          onChange={(e) =>
            onUpdate({ ...settings, playbackSpeed: parseFloat(e.target.value) })
          }
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0.5x</span>
          <span>2x</span>
        </div>
      </div>
    </div>
  );
}
