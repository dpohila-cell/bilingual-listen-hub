import { useState, useEffect } from 'react';
import { User, Globe, Bell, HelpCircle, LogOut, ChevronLeft, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

type SettingsView = 'menu' | 'account';

export default function SettingsPage() {
  const [view, setView] = useState<SettingsView>('menu');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-12">
      <AnimatePresence mode="wait">
        {view === 'menu' ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-6"
          >
            <h1 className="font-serif text-2xl">Settings</h1>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => setView('account')}
                className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-muted"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Account</p>
                  <p className="text-xs text-muted-foreground">Manage your profile</p>
                </div>
              </button>

              {[
                { icon: Globe, label: 'Default Languages', description: 'Set preferred languages' },
                { icon: Bell, label: 'Notifications', description: 'Manage alerts' },
                { icon: HelpCircle, label: 'Help & Support', description: 'Get assistance' },
              ].map(({ icon: Icon, label, description }) => (
                <button
                  key={label}
                  className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-muted opacity-50 cursor-not-allowed"
                  disabled
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-4 rounded-xl bg-card border border-destructive/20 p-4 text-left text-destructive transition-colors hover:bg-destructive/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <LogOut className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Sign Out</p>
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Bilingual Sentence Audiobook Player v1.0
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="account"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-6"
          >
            <AccountSection onBack={() => setView('menu')} user={user} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountSection({ onBack, user }: { onBack: () => void; user: ReturnType<typeof useAuth>['user'] }) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to save profile');
    } else {
      toast.success('Profile updated');
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-serif text-2xl">Account</h1>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-card border border-border p-6">
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <p className="text-sm font-medium mt-1">{user?.email ?? '—'}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            disabled={loading}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="rounded-2xl bg-card border border-border p-6">
        <p className="text-xs text-muted-foreground">Member since</p>
        <p className="text-sm font-medium mt-1">
          {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
        </p>
      </div>
    </>
  );
}
