"use client";

import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  CalendarDays,
  Dumbbell,
  FileInput,
  History,
  Library,
  Menu,
  Settings,
  UserRound,
  Wand2,
  X,
} from "lucide-react";

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

function NavDrawer({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60 }}
      aria-modal
      role="dialog"
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
        }}
      />
      {/* drawer */}
      <nav
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 256,
          background: "var(--bg-1)",
          borderRight: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
          animation: "slideright .16s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
              <span style={{ color: "var(--accent)" }}>tr</span>AI
              <span style={{ color: "var(--accent)" }}>ner</span>
            </div>
          </div>
          <button
            className="btn ghost"
            onClick={onClose}
            style={{ padding: "4px 6px" }}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* nav items */}
        <div style={{ flex: 1, overflow: "auto", padding: 6 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: "var(--r)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--fg)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  marginBottom: 2,
                  transition: "background .1s",
                }}
              >
                <Icon size={15} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

      </nav>
    </div>
  );
}

function Toolbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        background: "var(--bg-1)",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <button
        className="btn ghost"
        onClick={onOpenNav}
        style={{ padding: "4px 6px" }}
        aria-label="Open menu"
      >
        <Menu size={16} aria-hidden />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "var(--accent)" }}>tr</span>AI
          <span style={{ color: "var(--accent)" }}>ner</span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <Toolbar onOpenNav={() => setDrawerOpen(true)} />
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
      />
      <main
        style={{
          flex: 1,
          width: "min(100%, 960px)",
          margin: "0 auto",
          padding: "16px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
