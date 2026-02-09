import { demoBooks, demoProgress } from '@/data/demo';
import { BookCard } from '@/components/BookCard';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Library() {
  const navigate = useNavigate();

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
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Continue Listening
        </h2>
        <BookCard
          book={demoBooks[0]}
          progress={demoProgress}
          onClick={() => navigate(`/player/${demoBooks[0].id}`)}
        />
      </section>

      {/* All Books */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          All Books
        </h2>
        <div className="flex flex-col gap-3">
          {demoBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onClick={() => navigate(`/player/${book.id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
