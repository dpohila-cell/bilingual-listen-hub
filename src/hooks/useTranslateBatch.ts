import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const TRANSLATE_BATCH_SIZE = 25;

export function useTranslateBatch(bookId: string | undefined) {
  // Track which ranges have been requested to avoid duplicate calls
  const requestedRangesRef = useRef<Set<number>>(new Set());

  const translateRange = useCallback(async (startOrder: number): Promise<boolean> => {
    if (!bookId) return false;

    // Deduplicate
    if (requestedRangesRef.current.has(startOrder)) return true;
    requestedRangesRef.current.add(startOrder);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            bookId,
            startOrder,
            count: TRANSLATE_BATCH_SIZE,
          }),
        }
      );

      const result = await response.json();
      return response.ok && (result.translated > 0 || result.message === 'Already translated');
    } catch (err) {
      console.error('Translate batch error:', err);
      return false;
    }
  }, [bookId]);

  const resetRanges = useCallback(() => {
    requestedRangesRef.current.clear();
  }, []);

  return { translateRange, resetRanges, TRANSLATE_BATCH_SIZE };
}
