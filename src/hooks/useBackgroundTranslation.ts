import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that runs background translation for the entire book.
 * Calls translate-all repeatedly until all sentences are translated.
 */
export function useBackgroundTranslation(bookId: string | undefined, bookReady: boolean) {
  const runningRef = useRef(false);
  const abortRef = useRef(false);

  const runTranslation = useCallback(async () => {
    if (!bookId || runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let hasMore = true;
      while (hasMore && !abortRef.current) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-all`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ bookId }),
          }
        );

        if (!response.ok) {
          console.error('Background translation error:', response.status);
          break;
        }

        const result = await response.json();
        console.log(`Background translation: ${result.translated} done, hasMore: ${result.hasMore}`);
        hasMore = result.hasMore ?? false;

        if (result.retryAfter) {
          await new Promise((r) => setTimeout(r, result.retryAfter * 1000));
        }
      }
    } catch (err) {
      console.error('Background translation error:', err);
    } finally {
      runningRef.current = false;
    }
  }, [bookId]);

  useEffect(() => {
    if (bookReady && bookId) {
      runTranslation();
    }
    return () => {
      abortRef.current = true;
    };
  }, [bookReady, bookId, runTranslation]);
}
