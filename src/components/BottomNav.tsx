import { BookOpen, Upload, Headphones, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { icon: BookOpen, label: 'Library', path: '/' },
  { icon: Upload, label: 'Upload', path: '/upload' },
  { icon: Headphones, label: 'Player', path: '/player' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
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
