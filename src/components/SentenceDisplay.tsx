import { Language, LANGUAGE_LABELS } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface SentenceDisplayProps {
  text1: string;
  text2: string;
  lang1: Language;
  lang2: Language;
  activeLang: 1 | 2 | null;
  sentenceNumber: number;
  totalSentences: number;
  isTranslating?: boolean;
}

export function SentenceDisplay({
  text1,
  text2,
  lang1,
  lang2,
  activeLang,
  sentenceNumber,
  totalSentences,
  isTranslating,
}: SentenceDisplayProps) {
  return (
    <div className="flex flex-col gap-6 px-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Sentence {sentenceNumber}</span>
        <span>{sentenceNumber} / {totalSentences}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${sentenceNumber}-1`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`rounded-xl p-5 transition-all ${
            activeLang === 1
              ? 'bg-primary/10 border-2 border-primary/30'
              : 'bg-card border border-border'
          }`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {LANGUAGE_LABELS[lang1]}
            </span>
            {activeLang === 1 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto flex h-2 w-2 rounded-full bg-primary"
              >
                <span className="animate-ping h-full w-full rounded-full bg-primary/60" />
              </motion.span>
            )}
          </div>
          <p className="font-sans text-lg font-normal leading-relaxed [font-weight:400]">
            {text1 || <span className="text-muted-foreground italic">Translating…</span>}
          </p>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${sentenceNumber}-2`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className={`rounded-xl p-5 transition-all ${
            activeLang === 2
              ? 'bg-accent/10 border-2 border-accent/30'
              : 'bg-card border border-border'
          }`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {LANGUAGE_LABELS[lang2]}
            </span>
            {activeLang === 2 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto flex h-2 w-2 rounded-full bg-accent"
              >
                <span className="animate-ping h-full w-full rounded-full bg-accent/60" />
              </motion.span>
            )}
          </div>
          <p className="font-sans text-lg font-normal leading-relaxed [font-weight:400]">
            {isTranslating
              ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></span>
              : text2 || <span className="text-muted-foreground italic">Translating…</span>}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
