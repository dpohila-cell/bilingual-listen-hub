import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

      if (!response.ok) {
        const result = await response.json();
        if (response.status === 402) {
          toast.error('AI translation quota exhausted. Please check the configured OpenAI billing or usage limits.');
        } else if (response.status === 429) {
          toast.error('Too many requests. Please wait a moment and try again.');
        } else {
          console.error('Translate error:', result);
        }
        // Allow retry by removing from dedup set
        requestedRangesRef.current.delete(startOrder);
        return false;
      }
      const result = await response.json();
      // Return true only if new translations were actually created
      return result.translated > 0;
    } catch (err) {
      console.error('Translate batch error:', err);
      requestedRangesRef.current.delete(startOrder);
      return false;
    }
  }, [bookId]);

  const resetRanges = useCallback(() => {
    requestedRangesRef.current.clear();
  }, []);

  return { translateRange, resetRanges, TRANSLATE_BATCH_SIZE };
}
