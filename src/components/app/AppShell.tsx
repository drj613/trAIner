"use client";

import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { CalendarDays, Dumbbell, FileInput, History, Library, Menu, Settings, UserRound, Wand2, X } from "lucide-react";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";

const navItems = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/programs", label: "Routines", icon: Dumbbell },
  { href: "/history", label: "History", icon: History },
  { href: "/library", label: "Library", icon: Library },
  { href: "/import", label: "Import", icon: FileInput },
  { href: "/prompts", label: "Prompts", icon: Wand2 },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Workspace", icon: Settings },
];

function Brand() {
  return <span className="app-brand">tr<span>AI</span>ner</span>;
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <>
    {navItems.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        to={href}
        onClick={onNavigate}
        className="app-nav-link"
        aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
      >
        <Icon size={18} strokeWidth={1.6} aria-hidden />
        <span>{label}</span>
      </Link>
    ))}
  </>;
}

function NavDrawer({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const focusRef = useFocusTrap(open);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", dismiss);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="app-drawer-overlay">
      <div className="app-drawer-backdrop" onClick={onClose} aria-hidden />
      <section ref={focusRef} className="app-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu" id="navigation-menu">
        <div className="app-drawer-heading">
          <Brand />
          <button type="button" className="btn ghost app-icon-button" onClick={onClose} aria-label="Close menu"><X size={20} aria-hidden /></button>
        </div>
        <p className="app-nav-scope">Your training, on this device</p>
        <nav aria-label="Main navigation"><NavLinks pathname={pathname} onNavigate={onClose} /></nav>
      </section>
    </div>
  );
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-toolbar">
        <button type="button" className="btn ghost app-icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="navigation-menu"><Menu size={21} aria-hidden /></button>
        <Brand />
      </header>
      <div className="app-frame">
        <aside className="app-sidebar" aria-hidden={drawerOpen || undefined}>
          <div className="app-sidebar-brand"><Brand /><button type="button" className="btn ghost app-icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="navigation-menu"><Menu size={19} aria-hidden /></button></div>
          <p className="app-nav-scope">Your training</p>
          <nav aria-label="Main navigation"><NavLinks pathname={pathname} /></nav>
          <p className="app-sidebar-note">Stored on this device.<br />Back up from Workspace.</p>
        </aside>
        <main className="app-main" id="main-content" tabIndex={-1}>{children}</main>
      </div>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} pathname={pathname} />
    </div>
  );
}
