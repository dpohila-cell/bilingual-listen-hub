import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { signIn, signUp, resetPassword, updatePassword, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('mode') === 'reset' && session) {
      setMode('reset');
    }
  }, [searchParams, session]);

  useEffect(() => {
    if (session && mode !== 'reset') {
      navigate('/');
    }
  }, [session, mode, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'signup') {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else setConfirmationSent(true);
    } else if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else navigate('/');
    } else if (mode === 'forgot') {
      const { error } = await resetPassword(email);
      if (error) setError(error.message);
      else {
        toast.success('Reset link sent to ' + email);
        setMode('login');
      }
    } else if (mode === 'reset') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      const { error } = await updatePassword(password);
      if (error) setError(error.message);
      else {
        toast.success('Password updated successfully');
        navigate('/');
      }
    }
    setLoading(false);
  };

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-serif text-xl">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>
          </p>
          <Button variant="outline" className="mt-6" onClick={() => { setConfirmationSent(false); setMode('login'); }}>
            Back to sign in
          </Button>
        </motion.div>
      </div>
    );
  }

  const titles: Record<AuthMode, string> = {
    login: 'Sign in to your library',
    signup: 'Create an account',
    forgot: 'Reset password',
    reset: 'New password',
  };

  const buttonLabels: Record<AuthMode, string> = {
    login: 'Sign In',
    signup: 'Sign Up',
    forgot: 'Send reset link',
    reset: 'Save password',
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl">Bilingual Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">{titles[mode]}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode !== 'reset' && (
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
          {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
            <Input
              type="password"
              placeholder={mode === 'reset' ? 'New password' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonLabels[mode]}
          </Button>
        </form>

        {mode === 'login' && (
          <button
            onClick={() => { setMode('forgot'); setError(''); }}
            className="mt-3 block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Forgot password?
          </button>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === 'login' && (
            <>Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} className="font-medium text-primary hover:underline">
                Sign Up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="font-medium text-primary hover:underline">
                Sign In
              </button>
            </>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button onClick={() => { setMode('login'); setError(''); }} className="font-medium text-primary hover:underline">
              Back to sign in
            </button>
          )}
        </p>
      </motion.div>
    </div>
  );
}
