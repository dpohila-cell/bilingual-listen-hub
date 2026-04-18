import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that starts server-side background translation for the entire book.
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
      if (!session || abortRef.current) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ bookId, chain: true }),
        }
      );

      if (!response.ok) {
        let message = `Background translation error: ${response.status}`;
        try {
          const result = await response.json();
          message = result.details || result.error || message;
        } catch {
          // Keep the status-only message if the function returned non-JSON.
        }
        console.error('Background translation error:', response.status, message);
        return;
      }

      const result = await response.json();
      console.log(`Background translation started: ${result.translated} done, hasMore: ${result.hasMore}`);
    } catch (fetchErr) {
      if (!abortRef.current) {
        console.warn('Background translation start failed:', fetchErr);
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
