import { User, Globe, Bell, HelpCircle, LogOut } from 'lucide-react';

const MENU_ITEMS = [
  { icon: User, label: 'Account', description: 'Manage your profile' },
  { icon: Globe, label: 'Default Languages', description: 'Set preferred languages' },
  { icon: Bell, label: 'Notifications', description: 'Manage alerts' },
  { icon: HelpCircle, label: 'Help & Support', description: 'Get assistance' },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-5 pt-12">
      <h1 className="font-serif text-2xl">Settings</h1>

      <div className="flex flex-col gap-2">
        {MENU_ITEMS.map(({ icon: Icon, label, description }) => (
          <button
            key={label}
            className="flex items-center gap-4 rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-muted"
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

      <button className="flex items-center gap-4 rounded-xl bg-card border border-destructive/20 p-4 text-left text-destructive transition-colors hover:bg-destructive/5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
          <LogOut className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Sign Out</p>
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Bilingual Sentence Audiobook Player v1.0
      </p>
    </div>
  );
}
