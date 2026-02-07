import { UploadZone } from '@/components/UploadZone';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

type UploadStep = 'select' | 'processing' | 'done';

const PROCESSING_STEPS = [
  'Extracting text from file…',
  'Detecting chapters…',
  'Splitting into sentences…',
  'Generating translations…',
  'Creating audio files…',
];

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('select');
  const [currentProcess, setCurrentProcess] = useState(0);
  const navigate = useNavigate();

  const handleFileSelect = (_file: File) => {
    setStep('processing');
    setCurrentProcess(0);

    // Simulate processing steps
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= PROCESSING_STEPS.length) {
        clearInterval(interval);
        setStep('done');
      } else {
        setCurrentProcess(i);
      }
    }, 1200);
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-12">
      <div>
        <h1 className="font-serif text-2xl">Upload eBook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new book to your bilingual library
        </p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <UploadZone onFileSelect={handleFileSelect} />
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 rounded-2xl bg-card border border-border p-8"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="flex flex-col gap-3 w-full">
              {PROCESSING_STEPS.map((label, idx) => (
                <div
                  key={label}
                  className={`flex items-center gap-3 text-sm transition-all ${
                    idx < currentProcess
                      ? 'text-success'
                      : idx === currentProcess
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {idx < currentProcess ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  ) : idx === currentProcess ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                  ) : (
                    <div className="h-4 w-4 flex-shrink-0 rounded-full border border-current" />
                  )}
                  {label}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 rounded-2xl bg-card border border-border p-8"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div className="text-center">
              <h2 className="font-serif text-xl">Book Processed!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your book is ready for bilingual listening
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep('select');
                }}
              >
                Upload Another
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate('/player')}
              >
                Start Listening
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
