import { BookOpen, Upload, Headphones, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Get last-read book for player nav
  const { data: lastProgress } = useQuery({
    queryKey: ['last-progress', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_progress')
        .select('book_id')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.book_id || null;
    },
    enabled: !!user,
  });

  const navItems = [
    { icon: BookOpen, label: 'Library', path: '/' },
    { icon: Upload, label: 'Upload', path: '/upload' },
    { icon: Headphones, label: 'Player', path: lastProgress ? `/player/${lastProgress}` : '/' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = label === 'Player'
            ? location.pathname.startsWith('/player/')
            : location.pathname === path;
          return (
            <button
              key={label}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
