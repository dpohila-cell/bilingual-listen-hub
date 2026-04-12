import { Language, LANGUAGE_LABELS } from '@/types';

interface LanguagePickerProps {
  value: Language;
  onChange: (lang: Language) => void;
  label: string;
  exclude?: Language;
}

const ALL_LANGUAGES: Language[] = ['en', 'ru', 'sv'];

export function LanguagePicker({ value, onChange, label, exclude }: LanguagePickerProps) {
  const languages = ALL_LANGUAGES.filter((l) => l !== exclude);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-2">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => onChange(lang)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              value === lang
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-foreground border border-border hover:bg-muted'
            }`}
          >
            <span>{LANGUAGE_LABELS[lang]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
