import { BookCard } from '@/components/BookCard';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Book, UserProgress } from '@/types';

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: books = [], isLoading: booksLoading } = useQuery({
    queryKey: ['books', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .in('status', ['ready', 'processing'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((b): Book => ({
        id: b.id,
        title: b.title,
        author: b.author || '',
        originalLanguage: (b.original_language as Book['originalLanguage']) || 'en',
        fileFormat: 'txt',
        chapterCount: 1,
        sentenceCount: b.sentence_count,
        createdAt: b.created_at,
      }));
    },
    enabled: !!user,
  });

  const { data: progress } = useQuery({
    queryKey: ['progress', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const readyBooks = books.filter((b) => {
    // Also include books from query that have status ready
    return true; // RLS ensures only user's books; filter by status in query if needed
  });

  const getProgress = (bookId: string): UserProgress | undefined => {
    const p = progress?.find((pr) => pr.book_id === bookId);
    if (!p) return undefined;
    const book = books.find((b) => b.id === bookId);
    return {
      bookId: p.book_id,
      lastSentencePosition: p.last_sentence_position,
      completedSentences: p.last_sentence_position,
      totalSentences: book?.sentenceCount || 0,
    };
  };

  // Find last read book
  const lastRead = progress?.sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )?.[0];
  const continueBook = lastRead ? readyBooks.find((b) => b.id === lastRead.book_id) : undefined;

  if (booksLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 pt-12">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
          <h1 className="font-serif text-2xl">Your Library</h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/upload')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20"
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </div>

      {/* Continue Listening */}
      {continueBook && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Continue Listening
          </h2>
          <BookCard
            book={continueBook}
            progress={getProgress(continueBook.id)}
            onClick={() => navigate(`/player/${continueBook.id}`)}
          />
        </section>
      )}

      {/* All Books */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          All Books
        </h2>
        {readyBooks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No books yet. Upload your first eBook!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {readyBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={getProgress(book.id)}
                onClick={() => navigate(`/player/${book.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
