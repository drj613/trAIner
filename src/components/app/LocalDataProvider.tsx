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

  useEffect(() => {
    refresh();
  }, []);

  if (error) return (
    <div style={{ padding: "2rem", color: "red" }}>
      Failed to load app data: {error.message}
    </div>
  );

  return (
    <LocalDataContext.Provider value={{ programs, profile, loading, error, refresh }}>
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
