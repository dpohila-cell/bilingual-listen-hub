import { useState, useMemo, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { SentenceDisplay } from '@/components/SentenceDisplay';
import { PlayerControls } from '@/components/PlayerControls';
import { PlaybackSettingsPanel } from '@/components/PlaybackSettings';
import { usePlayer } from '@/hooks/usePlayer';
import { useGenerateAudio } from '@/hooks/useGenerateAudio';
import { Settings2, ChevronDown, BookOpen, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Sentence, Language } from '@/types';

export default function Player() {
  const { bookId } = useParams<{ bookId: string }>();
  const [showSettings, setShowSettings] = useState(false);
  const { user } = useAuth();
  const { isGenerating, progress: genProgress, error: genError, generateBoth } = useGenerateAudio(bookId);

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
    text1,
    text2,
    totalSentences,
  } = usePlayer(sentences, savedProgress, bookId, (book?.original_language || 'en') as Language);

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

      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.3 }}
        />
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

        {/* Generate Audio Button */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={() => generateBoth(settings.language1, settings.language2)}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {isGenerating ? genProgress : 'Сгенерировать аудио'}
          </button>
          {genError && <p className="text-xs text-destructive">{genError}</p>}
          {genProgress && !isGenerating && !genError && (
            <p className="text-xs text-muted-foreground">{genProgress}</p>
          )}
        </div>
      </div>

      {playerLoading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Generating audio…</span>
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
