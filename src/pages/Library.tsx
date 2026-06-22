import { useState } from 'react';
import { BookCard } from '@/components/BookCard';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Book, UserProgress } from '@/types';

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: books = [], isLoading: booksLoading } = useQuery({
    queryKey: ['books', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .in('status', ['ready', 'processing', 'error'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((b): Book => ({
        id: b.id,
        title: b.title,
        author: b.author || '',
        originalLanguage: (b.original_language as Book['originalLanguage']) || 'en',
        fileFormat: 'txt',
        filePath: b.file_path,
        status: b.status,
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

  const readyBooks = books.filter((b) => b.status === 'ready');

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

  const deleteBookName = books.find((b) => b.id === deleteBookId)?.title || '';

  const handleBookClick = (bookId: string) => {
    const book = books.find((b) => b.id === bookId);
    if (book?.status === 'ready') {
      navigate(`/player/${bookId}`);
    } else if (book?.status === 'processing') {
      toast('Still processing…');
    } else if (book?.status === 'error') {
      toast('Processing failed — delete it and re-upload.');
    }
  };

  const handleDelete = async () => {
    if (!deleteBookId) return;
    setIsDeleting(true);
    try {
      const book = books.find((b) => b.id === deleteBookId);

      // Delete audio files from storage
      const { data: audioFiles } = await supabase.storage.from('audio').list(deleteBookId);
      if (audioFiles && audioFiles.length > 0) {
        const paths: string[] = [];
        for (const lang of audioFiles) {
          const { data: voiceFolders } = await supabase.storage.from('audio').list(`${deleteBookId}/${lang.name}`);
          if (voiceFolders && voiceFolders.length > 0) {
            for (const voice of voiceFolders) {
              const { data: files } = await supabase.storage.from('audio').list(`${deleteBookId}/${lang.name}/${voice.name}`);
              if (files && files.length > 0) {
                paths.push(...files.map((file) => `${deleteBookId}/${lang.name}/${voice.name}/${file.name}`));
              }
            }
          }
        }
        if (paths.length > 0) {
          await supabase.storage.from('audio').remove(paths);
        }
      }

      // Delete ebook file from storage
      if (book?.filePath) {
        await supabase.storage.from('ebooks').remove([book.filePath]);
      }

      // Delete progress, sentences, then book (order matters for FK)
      await supabase.from('user_progress').delete().eq('book_id', deleteBookId);
      await supabase.from('sentences').delete().eq('book_id', deleteBookId);
      await supabase.from('books').delete().eq('id', deleteBookId);

      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      toast.success('Book deleted');
    } catch (err: any) {
      toast.error('Failed to delete book: ' + err.message);
    } finally {
      setIsDeleting(false);
      setDeleteBookId(null);
    }
  };

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
            onClick={handleBookClick}
            onDelete={setDeleteBookId}
          />
        </section>
      )}

      {/* All Books */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          All Books
        </h2>
        {books.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No books yet. Upload your first eBook!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={getProgress(book.id)}
                onClick={handleBookClick}
                onDelete={setDeleteBookId}
              />
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={!!deleteBookId} onOpenChange={(open) => !open && setDeleteBookId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete book?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteBookName}" will be permanently deleted along with all its audio. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
