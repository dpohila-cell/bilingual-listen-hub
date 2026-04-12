import { Book, LANGUAGE_LABELS, UserProgress } from '@/types';
import { BookOpen, Headphones, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface BookCardProps {
  book: Book;
  progress?: UserProgress;
  onClick: (bookId: string) => void;
  onDelete?: (bookId: string) => void;
}

const COVER_COLORS = [
  'from-primary/80 to-primary',
  'from-accent/80 to-accent',
  'from-success/80 to-success',
];

export function BookCard({ book, progress, onClick, onDelete }: BookCardProps) {
  const progressPercent = progress
    ? Math.round((progress.completedSentences / progress.totalSentences) * 100)
    : 0;
  const colorClass = COVER_COLORS[parseInt(book.id) % COVER_COLORS.length];

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onClick(book.id)}
      className="flex gap-4 rounded-xl bg-card p-4 text-left shadow-sm border border-border transition-shadow hover:shadow-md w-full"
    >
      <div
        className={`flex h-24 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colorClass}`}
      >
        <BookOpen className="h-6 w-6 text-primary-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="font-serif text-base font-medium leading-tight truncate">
            {book.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{book.author}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{LANGUAGE_LABELS[book.originalLanguage]}</span>
          <span>·</span>
          <span>{book.chapterCount} chapters</span>
        </div>
        {progress && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{progressPercent}%</span>
          </div>
        )}
      </div>
      <div className="flex flex-shrink-0 flex-col items-center gap-2">
        <Headphones className="h-4 w-4 text-muted-foreground" />
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(book.id);
            }}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete book"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.button>
  );
}
