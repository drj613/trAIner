import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app/AppShell";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "trAIner",
  description: "Local-first workout PWA for importing, editing, and logging structured training."
};

export const viewport: Viewport = {
  themeColor: "#1f7a6d",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LocalDataProvider>
          <AppShell>{children}</AppShell>
        </LocalDataProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
