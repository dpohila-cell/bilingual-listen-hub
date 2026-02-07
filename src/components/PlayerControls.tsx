import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRewind: () => void;
  onForward: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export function PlayerControls({
  isPlaying,
  onPlayPause,
  onPrev,
  onNext,
  onRewind,
  onForward,
  canPrev,
  canNext,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        onClick={onRewind}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <Rewind className="h-5 w-5" />
      </button>
      <button
        onClick={onPrev}
        disabled={!canPrev}
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground disabled:text-muted-foreground/40 transition-colors"
      >
        <SkipBack className="h-5 w-5" />
      </button>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onPlayPause}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25"
      >
        {isPlaying ? (
          <Pause className="h-7 w-7" />
        ) : (
          <Play className="ml-1 h-7 w-7" />
        )}
      </motion.button>
      <button
        onClick={onNext}
        disabled={!canNext}
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground disabled:text-muted-foreground/40 transition-colors"
      >
        <SkipForward className="h-5 w-5" />
      </button>
      <button
        onClick={onForward}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
      >
        <FastForward className="h-5 w-5" />
      </button>
    </div>
  );
}
