import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { SentenceDisplay } from '@/components/SentenceDisplay';
import { PlayerControls } from '@/components/PlayerControls';
import { PlaybackSettingsPanel } from '@/components/PlaybackSettings';
import { usePlayer } from '@/hooks/usePlayer';
import { useGenerateAudio } from '@/hooks/useGenerateAudio';
import { useVoiceSettings } from '@/hooks/useVoiceSettings';
import { Settings2, ChevronDown, BookOpen, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Sentence, Language } from '@/types';

export default function Player() {
  const { bookId } = useParams<{ bookId: string }>();
  const [showSettings, setShowSettings] = useState(false);
  const { user } = useAuth();
  const { isGenerating, progress: genProgress, error: genError, generateBothBatch, resetRanges } = useGenerateAudio(bookId);
  const { voiceSettings, getVoice } = useVoiceSettings();
  const audioTriggeredRef = useRef<string | null>(null);
  const lastPrefetchTriggerRef = useRef<number>(-1);

  const { data: book, isLoading: bookLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
  });

  const { data: dbSentences = [], isLoading: sentencesLoading } = useQuery({
    queryKey: ['sentences', bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentences')
        .select('*')
        .eq('book_id', bookId!)
        .order('sentence_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!bookId && book?.status === 'ready',
  });

  const { data: savedProgress } = useQuery({
    queryKey: ['progress', bookId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_progress')
        .select('last_sentence_position')
        .eq('book_id', bookId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      return data?.last_sentence_position || 0;
    },
    enabled: !!bookId && !!user,
  });

  const sentences: Sentence[] = useMemo(
    () =>
      dbSentences.map((s) => ({
        id: s.id,
        chapterId: '',
        sentenceOrder: s.sentence_order,
        originalText: s.original_text,
        enTranslation: s.en_translation || s.original_text,
        ruTranslation: s.ru_translation || s.original_text,
        svTranslation: s.sv_translation || s.original_text,
      })),
    [dbSentences]
  );

  const {
    currentIndex,
    isPlaying,
    isLoading: playerLoading,
    activeLang,
    settings,
    setSettings,
    togglePlay,
    goToNext,
    goToPrev,
    goTo,
    text1,
    text2,
    totalSentences,
  } = usePlayer(sentences, savedProgress, bookId, (book?.original_language || 'en') as Language);

  // Helper: get the sentence_order (1-based) for a given 0-based index
  const getSentenceOrder = (index: number) => {
    if (sentences.length === 0) return 1;
    const clamped = Math.max(0, Math.min(index, sentences.length - 1));
    return sentences[clamped].sentenceOrder;
  };

  // Auto-generate first batch when player opens or voice/language changes
  useEffect(() => {
    if (!bookId || !book || book.status !== 'ready' || isGenerating || sentences.length === 0) return;

    const lang1 = settings.language1;
    const lang2 = settings.language2;
    const v1 = getVoice(lang1);
    const v2 = getVoice(lang2);
    const voiceKey = `${bookId}-${lang1}-${lang2}-${v1}-${v2}`;
    if (audioTriggeredRef.current === voiceKey) return;

    const isVoiceChange = audioTriggeredRef.current !== null;
    audioTriggeredRef.current = voiceKey;
    lastPrefetchTriggerRef.current = -1;
    resetRanges();
    generateBothBatch(lang1, lang2, getSentenceOrder(currentIndex), v1, v2, isVoiceChange);
  }, [bookId, book?.status, settings.language1, settings.language2, voiceSettings.version, generateBothBatch, getVoice, resetRanges, sentences]);

  // Auto-generate next batch every 5 sentences
  useEffect(() => {
    if (!bookId || !book || book.status !== 'ready' || sentences.length === 0) return;

    const triggerPoint = Math.floor(currentIndex / 5) * 5;
    if (triggerPoint <= lastPrefetchTriggerRef.current) return;
    if (lastPrefetchTriggerRef.current === -1 && triggerPoint === 0) {
      lastPrefetchTriggerRef.current = 0;
      return;
    }

    lastPrefetchTriggerRef.current = triggerPoint;
    const nextBatchStart = getSentenceOrder(Math.min(triggerPoint + 5, sentences.length - 1));
    const v1 = getVoice(settings.language1);
    const v2 = getVoice(settings.language2);
    generateBothBatch(settings.language1, settings.language2, nextBatchStart, v1, v2, false, true);
  }, [currentIndex, bookId, book?.status, settings.language1, settings.language2, generateBothBatch, getVoice, sentences]);

  // Save progress on index change
  useEffect(() => {
    if (!bookId || !user || sentences.length === 0) return;
    const timeout = setTimeout(async () => {
      await supabase.from('user_progress').upsert(
        {
          user_id: user.id,
          book_id: bookId,
          last_sentence_position: currentIndex,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,book_id' }
      );
    }, 1000);
    return () => clearTimeout(timeout);
  }, [currentIndex, bookId, user, sentences.length]);

  if (bookLoading || sentencesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) return <Navigate to="/" replace />;

  const progressPercent = totalSentences > 0 ? ((currentIndex + 1) / totalSentences) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 p-5 pt-10">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary">
          <BookOpen className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-lg leading-tight truncate">{book.title}</h1>
          <p className="text-xs text-muted-foreground">{book.author}</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            showSettings ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={Math.max(totalSentences - 1, 0)}
          value={currentIndex}
          onChange={(e) => {
            const newIndex = Number(e.target.value);
            goTo(newIndex);
            // Trigger audio generation for the area around the seek position
            if (bookId && book?.status === 'ready') {
              const v1 = getVoice(settings.language1);
              const v2 = getVoice(settings.language2);
              generateBothBatch(settings.language1, settings.language2, getSentenceOrder(newIndex), v1, v2, false, true);
            }
          }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-primary
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{currentIndex + 1}</span>
          <span>{totalSentences}</span>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <PlaybackSettingsPanel settings={settings} onUpdate={setSettings} />
            <button
              onClick={() => setShowSettings(false)}
              className="mx-auto mt-2 flex items-center gap-1 text-xs text-muted-foreground"
            >
              <ChevronDown className="h-3 w-3" />
              Hide settings
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 py-4">
        <SentenceDisplay
          text1={text1}
          text2={text2}
          lang1={settings.language1}
          lang2={settings.language2}
          activeLang={activeLang}
          sentenceNumber={currentIndex + 1}
          totalSentences={totalSentences}
        />

        {/* Audio generation status indicator */}
        {isGenerating && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{genProgress || 'Preparing audio…'}</span>
          </div>
        )}
        {genError && <p className="mt-2 text-center text-xs text-destructive">{genError}</p>}
      </div>

      {playerLoading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading audio…</span>
        </div>
      )}

      <div className="pb-4">
        <PlayerControls
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onPrev={goToPrev}
          onNext={goToNext}
          onRewind={goToPrev}
          onForward={goToNext}
          canPrev={currentIndex > 0}
          canNext={currentIndex < totalSentences - 1}
        />
      </div>
    </div>
  );
}
