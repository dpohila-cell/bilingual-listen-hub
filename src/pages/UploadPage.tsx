import { UploadZone } from '@/components/UploadZone';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type UploadStep = 'select' | 'details' | 'processing' | 'done';

const PROCESSING_STEPS = [
  'Uploading file…',
  'Extracting text & detecting language…',
  'Generating translations…',
  'Saving sentences…',
];

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('select');
  const [currentProcess, setCurrentProcess] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [newBookId, setNewBookId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setTitle(file.name.replace(/\.[^/.]+$/, ''));
    setStep('details');
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    setStep('processing');
    setCurrentProcess(0);

    try {
      // 1. Upload file to storage as binary (preserve encoding)
      // Sanitize filename: replace non-ASCII and special chars with underscores
      const safeFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${Date.now()}-${safeFileName}`;
      const fileBuffer = await selectedFile.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('ebooks')
        .upload(filePath, fileBuffer, {
          contentType: 'application/octet-stream',
        });
      if (uploadError) throw uploadError;

      setCurrentProcess(1);

      // 2. Create book record
      const { data: book, error: bookError } = await supabase
        .from('books')
        .insert({
          user_id: user.id,
          title: title || 'Untitled',
          author: author || '',
          file_path: filePath,
          original_language: 'en', // will be auto-detected by edge function
          status: 'processing',
        })
        .select('id')
        .single();
      if (bookError || !book) throw bookError;

      setNewBookId(book.id);
      setCurrentProcess(2);

      // 3. Call process-book edge function (may timeout for large books, but batches are saved incrementally)
      const { data: { session } } = await supabase.auth.getSession();
      try {
        const response = await supabase.functions.invoke('process-book', {
          body: { bookId: book.id, filePath },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        if (response.error) {
          console.warn('Edge function returned error, checking if partial progress was saved...');
        }
      } catch (fnErr) {
        console.warn('Edge function call failed (possibly timeout), checking book status...', fnErr);
      }

      // Check if book was processed (fully or partially)
      const { data: updatedBook } = await supabase
        .from('books')
        .select('status, sentence_count')
        .eq('id', book.id)
        .maybeSingle();

      if (updatedBook && updatedBook.sentence_count > 0) {
        // If still processing but has sentences, mark as ready
        if (updatedBook.status === 'processing') {
          await supabase.from('books').update({ status: 'ready' }).eq('id', book.id);
        }
        setCurrentProcess(3);
        setTimeout(() => setStep('done'), 600);
      } else {
        toast.error('Failed to process book. Please try again.');
        setStep('select');
      }
    } catch (err: unknown) {
      console.error('Upload error:', err);
      toast.error('Failed to process book. Please try again.');
      setStep('select');
    }
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
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UploadZone onFileSelect={handleFileSelect} />
          </motion.div>
        )}

        {step === 'details' && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4 rounded-2xl bg-card border border-border p-6"
          >
            <h2 className="font-serif text-lg">Book Details</h2>
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="Author (optional)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              File: {selectedFile?.name} ({((selectedFile?.size || 0) / 1024 / 1024).toFixed(1)} MB)
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setStep('select'); setSelectedFile(null); }}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleUpload}>
                Start Processing
              </Button>
            </div>
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
                onClick={() => { setStep('select'); setSelectedFile(null); }}
              >
                Upload Another
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate(newBookId ? `/player/${newBookId}` : '/')}
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
