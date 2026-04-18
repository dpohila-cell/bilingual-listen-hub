import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { SentenceDisplay } from '@/components/SentenceDisplay';
import { PlayerControls } from '@/components/PlayerControls';
import { PlaybackSettingsPanel } from '@/components/PlaybackSettings';
import { usePlayer } from '@/hooks/usePlayer';
import { useGenerateAudio } from '@/hooks/useGenerateAudio';
import { useBackgroundTranslation } from '@/hooks/useBackgroundTranslation';
import { useTranslateBatch } from '@/hooks/useTranslateBatch';
import { useVoiceSettings } from '@/hooks/useVoiceSettings';
import { Settings2, ChevronDown, BookOpen, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import type { Sentence, Language } from '@/types';

// Fetch all sentences with pagination to overcome the 1000-row limit
async function fetchAllSentences(bookId: string) {
  const allData: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('sentences')
      .select('*')
      .eq('book_id', bookId)
      .order('sentence_order', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData.push(...data);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getAudioPublicUrl(bookId: string, language: Language, voice: string, sentenceOrder: number): string {
  const { data } = supabase.storage
    .from('audio')
    .getPublicUrl(`${bookId}/${language}/${sanitizeStorageSegment(voice)}/${String(sentenceOrder).padStart(5, '0')}.mp3`);
  return data.publicUrl;
}

async function waitForAudioReady(bookId: string, language: Language, voice: string, sentenceOrder: number, maxWaitMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const response = await fetch(getAudioPublicUrl(bookId, language, voice, sentenceOrder), { method: 'HEAD' });
      if (response.ok) return true;
    } catch {
      // Continue polling briefly while storage metadata propagates.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function preloadAudio(url: string, cache?: Map<string, HTMLAudioElement>, maxWaitMs = 5000) {
  return new Promise<boolean>((resolve) => {
    const existing = cache?.get(url);
    if (existing && existing.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve(true);
      return;
    }

    const audio = existing || new Audio();
    if (!existing) cache?.set(url, audio);
    let resolved = false;
    const done = (ready: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(ready);
    };
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
    };
    const onReady = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA), maxWaitMs);

    audio.preload = 'auto';
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('canplaythrough', onReady);
    audio.addEventListener('loadeddata', onReady);
    audio.addEventListener('error', onError);
    audio.src = url;
    audio.load();
  });
}

const PREPARE_BATCH_SIZE = 10;
const PREPARE_NEXT_WHEN_REMAINING = 5;

export default function Player() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isGenerating, progress: genProgress, error: genError, generateBothBatch, resetRanges } = useGenerateAudio(bookId);
  const { voiceSettings, getVoice } = useVoiceSettings();
  const { translateRange, TRANSLATE_BATCH_SIZE } = useTranslateBatch(bookId);
  const audioTriggeredRef = useRef<string | null>(null);
  const lastPrefetchTriggerRef = useRef<number>(-1);
  const translateAndRefetchRef = useRef<number>(0);
  const autoplayStartedRef = useRef(false);
  const playbackGateRef = useRef<((index: number) => Promise<boolean>) | null>(null);
  const preparedSentencesRef = useRef<Set<string>>(new Set());
  const preparingBatchesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const preloadedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);

  const runPlaybackGate = useCallback((index: number) => {
    return playbackGateRef.current ? playbackGateRef.current(index) : Promise.resolve(true);
  }, []);


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

  // Run background translation for the entire book
  useBackgroundTranslation(bookId, book?.status === 'ready');

  const { data: dbSentences = [], isLoading: sentencesLoading } = useQuery({
    queryKey: ['sentences', bookId],
    queryFn: () => fetchAllSentences(bookId!),
    enabled: !!bookId && book?.status === 'ready',
    // Refetch periodically to pick up background translations
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const { data: savedProgress, isFetched: progressFetched } = useQuery({
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
      dbSentences.map((s: any) => ({
        id: s.id,
        chapterId: '',
        sentenceOrder: s.sentence_order,
        originalText: s.original_text,
        enTranslation: s.en_translation || '',
        ruTranslation: s.ru_translation || '',
        svTranslation: s.sv_translation || '',
      })),
    [dbSentences]
  );
  const originalLanguage = (book?.original_language || 'en') as Language;

  const hasTextForLanguage = useCallback((sentence: Sentence, language: Language) => {
    const translationMap: Record<Language, string> = {
      en: sentence.enTranslation,
      ru: sentence.ruTranslation,
      sv: sentence.svTranslation,
    };
    return Boolean(translationMap[language] || (language === originalLanguage && sentence.originalText));
  }, [originalLanguage]);

  // On-demand translation: when seeking to untranslated area, translate and refetch
  const ensureTranslated = useCallback(async (sentenceOrder: number) => {
    if (!bookId || sentences.length === 0) return;
    // Find the sentence at this order
    const idx = sentences.findIndex(s => s.sentenceOrder >= sentenceOrder);
    if (idx === -1) return;
    const s = sentences[idx];
    // Check if translation is missing
    if (s.enTranslation && s.ruTranslation && s.svTranslation) return;
    
    setIsTranslating(true);
    const gen = ++translateAndRefetchRef.current;
    try {
      // Translate the batch starting at this order
      const batchStart = Math.floor((sentenceOrder - 1) / TRANSLATE_BATCH_SIZE) * TRANSLATE_BATCH_SIZE + 1;
      await translateRange(batchStart);
      // Force refetch and wait for it to complete so UI updates immediately
      if (translateAndRefetchRef.current === gen) {
        await queryClient.refetchQueries({ queryKey: ['sentences', bookId] });
      }
    } finally {
      if (translateAndRefetchRef.current === gen) {
        setIsTranslating(false);
      }
    }
  }, [bookId, sentences, translateRange, TRANSLATE_BATCH_SIZE, queryClient]);

  const {
    currentIndex,
    isPlaying,
    isLoading: playerLoading,
    activeLang,
    settings,
    setSettings,
    play,
    pause,
    goToNext,
    goToPrev,
    goTo,
    text1,
    text2,
    totalSentences,
  } = usePlayer(sentences, savedProgress, bookId, originalLanguage, getVoice, runPlaybackGate);

  const getSentenceOrder = useCallback((index: number) => {
    if (sentences.length === 0) return 1;
    const clamped = Math.max(0, Math.min(index, sentences.length - 1));
    return sentences[clamped].sentenceOrder;
  }, [sentences]);

  const getPreparationKey = useCallback((sentenceOrder: number) => {
    if (!bookId) return '';
    const v1 = getVoice(settings.language1);
    const v2 = getVoice(settings.language2);
    return `${bookId}:${settings.language1}:${v1}:${settings.language2}:${v2}:${sentenceOrder}`;
  }, [bookId, getVoice, settings.language1, settings.language2]);

  const isSentencePrepared = useCallback((index: number) => {
    if (sentences.length === 0) return false;
    return preparedSentencesRef.current.has(getPreparationKey(getSentenceOrder(index)));
  }, [getPreparationKey, getSentenceOrder, sentences.length]);

  const prepareBatchForIndex = useCallback(async (index: number, silent = true) => {
    if (!bookId || book?.status !== 'ready' || sentences.length === 0) return false;

    const batchStartIndex = Math.floor(Math.max(0, index) / PREPARE_BATCH_SIZE) * PREPARE_BATCH_SIZE;
    const batchSentences = sentences.slice(batchStartIndex, batchStartIndex + PREPARE_BATCH_SIZE);
    if (batchSentences.length === 0) return false;

    const v1 = getVoice(settings.language1);
    const v2 = getVoice(settings.language2);
    const batchStartOrder = batchSentences[0].sentenceOrder;
    const batchKey = `${bookId}:${settings.language1}:${v1}:${settings.language2}:${v2}:${batchStartOrder}`;

    const allPrepared = batchSentences.every((sentence) =>
      preparedSentencesRef.current.has(getPreparationKey(sentence.sentenceOrder))
    );
    if (allPrepared) return true;

    const existing = preparingBatchesRef.current.get(batchKey);
    if (existing) return existing;

    const task = (async () => {
      if (!silent) setIsPreparingPlayback(true);
      try {
        await ensureTranslated(batchStartOrder);
        let generated = await generateBothBatch(
          settings.language1,
          settings.language2,
          batchStartOrder,
          v1,
          v2,
          false,
          silent,
        );

        if (!generated) {
          await queryClient.refetchQueries({ queryKey: ['sentences', bookId] });
          await ensureTranslated(batchStartOrder);
          generated = await generateBothBatch(
            settings.language1,
            settings.language2,
            batchStartOrder,
            v1,
            v2,
            false,
            silent,
          );
        }

        if (!generated) return false;

        const readiness = await Promise.all(batchSentences.map(async (sentence) => {
          const urls = [
            getAudioPublicUrl(bookId, settings.language1, v1, sentence.sentenceOrder),
            getAudioPublicUrl(bookId, settings.language2, v2, sentence.sentenceOrder),
          ];
          const [audio1Ready, audio2Ready] = await Promise.all([
            waitForAudioReady(bookId, settings.language1, v1, sentence.sentenceOrder),
            waitForAudioReady(bookId, settings.language2, v2, sentence.sentenceOrder),
          ]);
          if (!audio1Ready || !audio2Ready) return false;

          const [audio1Preloaded, audio2Preloaded] = await Promise.all([
            preloadAudio(urls[0], preloadedAudioRef.current),
            preloadAudio(urls[1], preloadedAudioRef.current),
          ]);
          if (audio1Preloaded && audio2Preloaded) {
            preparedSentencesRef.current.add(getPreparationKey(sentence.sentenceOrder));
            return true;
          }
          return false;
        }));

        await queryClient.refetchQueries({ queryKey: ['sentences', bookId] });
        await new Promise((resolve) => setTimeout(resolve, 0));

        return readiness.every(Boolean);
      } finally {
        if (!silent) setIsPreparingPlayback(false);
        preparingBatchesRef.current.delete(batchKey);
      }
    })();

    preparingBatchesRef.current.set(batchKey, task);
    return task;
  }, [
    bookId,
    book?.status,
    sentences,
    getVoice,
    settings.language1,
    settings.language2,
    getPreparationKey,
    ensureTranslated,
    generateBothBatch,
    queryClient,
  ]);

  const ensureSentenceReady = useCallback(async (index: number, silent = false) => {
    if (isSentencePrepared(index)) return true;
    await prepareBatchForIndex(index, silent);
    return isSentencePrepared(index);
  }, [isSentencePrepared, prepareBatchForIndex]);

  useEffect(() => {
    playbackGateRef.current = (index: number) => ensureSentenceReady(index, false);
  }, [ensureSentenceReady]);

  useEffect(() => {
    if (searchParams.get('autoplay') !== '1') return;
    if (autoplayStartedRef.current) return;
    if (!bookId || book?.status !== 'ready' || sentences.length === 0 || isGenerating) return;

    autoplayStartedRef.current = true;
    play();
    setSearchParams({}, { replace: true });
  }, [searchParams, bookId, book?.status, sentences.length, isGenerating, play, setSearchParams]);

  // Auto-generate audio when player opens or voice/language changes
  useEffect(() => {
    if (!bookId || !book || book.status !== 'ready' || isGenerating || sentences.length === 0) return;
    if (!progressFetched) return;

    const lang1 = settings.language1;
    const lang2 = settings.language2;
    const v1 = getVoice(lang1);
    const v2 = getVoice(lang2);
    const voiceKey = `${bookId}-${lang1}-${lang2}-${v1}-${v2}`;
    if (audioTriggeredRef.current !== voiceKey) {
      audioTriggeredRef.current = voiceKey;
      lastPrefetchTriggerRef.current = -1;
      preparedSentencesRef.current.clear();
      preparingBatchesRef.current.clear();
      preloadedAudioRef.current.clear();
      resetRanges();
    }

    void prepareBatchForIndex(currentIndex, false);
  }, [bookId, book?.status, settings.language1, settings.language2, voiceSettings.version, getVoice, resetRanges, sentences.length, currentIndex, prepareBatchForIndex, isGenerating, progressFetched]);

  // Keep the current 10-sentence batch prepared, then prepare the next batch when 5 prepared sentences remain.
  useEffect(() => {
    if (!bookId || !book || book.status !== 'ready' || sentences.length === 0) return;

    void prepareBatchForIndex(currentIndex, true);

    const batchStartIndex = Math.floor(currentIndex / PREPARE_BATCH_SIZE) * PREPARE_BATCH_SIZE;
    const batchEndIndex = Math.min(batchStartIndex + PREPARE_BATCH_SIZE - 1, sentences.length - 1);
    const remainingPrepared = batchEndIndex - currentIndex;
    const nextBatchStartIndex = batchEndIndex + 1;
    if (
      remainingPrepared <= PREPARE_NEXT_WHEN_REMAINING &&
      nextBatchStartIndex < sentences.length &&
      nextBatchStartIndex !== lastPrefetchTriggerRef.current
    ) {
      lastPrefetchTriggerRef.current = nextBatchStartIndex;
      void prepareBatchForIndex(nextBatchStartIndex, true);
    }
  }, [currentIndex, bookId, book?.status, sentences.length, prepareBatchForIndex]);

  // Save progress
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

  // Check if current sentence has actual translation for language2
  const currentSentenceMissingTranslation = (() => {
    if (!sentences[currentIndex]) return false;
    const sentence = sentences[currentIndex];
    return !hasTextForLanguage(sentence, settings.language1) || !hasTextForLanguage(sentence, settings.language2);
  })();

  const handleSeek = (newIndex: number) => {
    const targetSentence = sentences[newIndex];
    const needsTranslation = targetSentence
      ? !hasTextForLanguage(targetSentence, settings.language1) || !hasTextForLanguage(targetSentence, settings.language2)
      : false;
    const shouldResume = isPlaying || needsTranslation;

    if (isPlaying) pause();

    if (bookId && book?.status === 'ready') {
      if (isSentencePrepared(newIndex)) {
        goTo(newIndex);
        if (shouldResume) play();
        return;
      }

      void (async () => {
        const ready = await ensureSentenceReady(newIndex, false);
        if (!ready) return;
        goTo(newIndex);
        if (shouldResume) play();
      })();
      return;
    }

    goTo(newIndex);
  };

  const handlePlayPause = () => {
    if (isPlaying) pause();
    else play();
  };

  return (
    <div className="flex flex-col gap-4 p-5 pt-10 pb-28">
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
        <div className="py-3 -my-3 touch-none">
          <input
            type="range"
            min={0}
            max={Math.max(totalSentences - 1, 0)}
            value={currentIndex}
            onChange={(e) => {
              const newIndex = Number(e.target.value);
              handleSeek(newIndex);
            }}
            className="w-full h-2 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-10
              [&::-webkit-slider-thumb]:rounded-[4px] [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:shadow-primary/30
              [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:rounded-[4px]
              [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md
              [&::-moz-range-thumb]:shadow-primary/30"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
            }}
          />
        </div>
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
          isTranslating={isTranslating || currentSentenceMissingTranslation}
        />

        {isTranslating && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Translating sentences…</span>
          </div>
        )}
        {(isPreparingPlayback || isGenerating) && !isTranslating && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{isPreparingPlayback ? 'Preparing current sentence...' : genProgress || 'Preparing audio…'}</span>
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

      <div className="fixed bottom-[57px] left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border py-3">
        <div className="mx-auto max-w-lg">
        <PlayerControls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onPrev={goToPrev}
          onNext={goToNext}
          onRewind={goToPrev}
          onForward={goToNext}
          canPrev={currentIndex > 0}
          canNext={currentIndex < totalSentences - 1}
        />
        </div>
      </div>
    </div>
  );
}
