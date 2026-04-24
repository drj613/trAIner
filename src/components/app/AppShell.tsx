import Link from "next/link";
import { CalendarDays, Dumbbell, FileInput, Settings, UserRound, Wand2 } from "lucide-react";

const navItems = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/programs", label: "Programs", icon: Dumbbell },
  { href: "/import", label: "Import", icon: FileInput },
  { href: "/prompts", label: "Prompts", icon: Wand2 },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/today" className="text-lg font-bold">
            trAIner
          </Link>
          <span className="text-sm muted">Local</span>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="sticky bottom-0 border-t border-[var(--line)] bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs">
                <Icon aria-hidden size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
