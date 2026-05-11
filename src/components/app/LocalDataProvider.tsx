"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";

type LocalDataContextValue = {
  programs: ProgramDocument[];
  profile: ProfileDocument | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  saveProgram: (program: ProgramDocument) => Promise<void>;
  removeProgram: (id: string) => Promise<void>;
  activateProgram: (id: string) => Promise<void>;
  duplicateProgram: (id: string) => Promise<ProgramDocument>;
  saveProfile: (profile: ProfileDocument) => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | undefined>(undefined);

export function LocalDataProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [programs, setPrograms] = useState<ProgramDocument[]>([]);
  const [profile, setProfile] = useState<ProfileDocument | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [storedProfile, storedPrograms] = await Promise.all([profileRepo.get(), programRepo.list()]);
      setProfile(storedProfile);
      setPrograms(storedPrograms);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function saveProgram(program: ProgramDocument) {
    const now = new Date().toISOString();
    const stamped: ProgramDocument = { ...program, updatedAt: now, createdAt: program.createdAt || now };
    await programRepo.save(stamped);
    setPrograms((prev) => {
      const idx = prev.findIndex((p) => p.id === stamped.id);
      return idx >= 0 ? prev.map((p, i) => (i === idx ? stamped : p)) : [...prev, stamped];
    });
  }

  async function removeProgram(id: string) {
    await programRepo.remove(id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }

  async function activateProgram(id: string) {
    await programRepo.activate(id);
    const now = new Date().toISOString();
    setPrograms((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, active: true, status: "active" as const, updatedAt: now }
          : { ...p, active: false, status: (p.status === "archived" ? "archived" : "draft") as "archived" | "draft", updatedAt: now }
      )
    );
  }

  async function duplicateProgram(id: string): Promise<ProgramDocument> {
    const copy = await programRepo.duplicate(id);
    setPrograms((prev) => [...prev, copy]);
    return copy;
  }

  async function saveProfile(profile: ProfileDocument) {
    const now = new Date().toISOString();
    const stamped: ProfileDocument = { ...profile, updatedAt: now };
    await profileRepo.save(stamped);
    setProfile(stamped);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (error) return (
    <div style={{ padding: "2rem", color: "red" }}>
      Failed to load app data: {error.message}
    </div>
  );

  return (
    <LocalDataContext.Provider value={{ programs, profile, loading, error, refresh, saveProgram, removeProgram, activateProgram, duplicateProgram, saveProfile }}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData() {
  const value = useContext(LocalDataContext);

  if (!value) {
    throw new Error("useLocalData must be used within LocalDataProvider.");
  }

  return value;
}
