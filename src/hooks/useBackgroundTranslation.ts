import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
      let hasMore = true;
      while (hasMore && !abortRef.current) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) break;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

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
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);

          if (!response.ok) {
            let message = `Background translation error: ${response.status}`;
            try {
              const result = await response.json();
              message = result.details || result.error || message;
            } catch {
              // Keep the status-only message if the function returned non-JSON.
            }
            console.error('Background translation error:', response.status, message);
            if (response.status === 402) {
              toast.error('OpenAI quota exhausted. Check API billing, credits, and project limits.');
            } else {
              toast.error('Translation failed. Check OpenAI billing/model access or Supabase function logs.');
            }
            break;
          }

          const result = await response.json();
          console.log(`Background translation: ${result.translated} done, hasMore: ${result.hasMore}`);
          hasMore = result.hasMore ?? false;

          if (result.retryAfter) {
            await new Promise((r) => setTimeout(r, result.retryAfter * 1000));
          }
        } catch (fetchErr) {
          if (abortRef.current) break;
          console.warn('Background translation fetch error, retrying in 5s...', fetchErr);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
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
