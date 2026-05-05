"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";

type LocalDataContextValue = {
  programs: ProgramDocument[];
  profile: ProfileDocument | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | undefined>(undefined);

export function LocalDataProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [programs, setPrograms] = useState<ProgramDocument[]>([]);
  const [profile, setProfile] = useState<ProfileDocument | undefined>();
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [storedProfile, storedPrograms] = await Promise.all([profileRepo.get(), programRepo.list()]);
    setProfile(storedProfile);
    setPrograms(storedPrograms);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  return (
    <LocalDataContext.Provider value={{ programs, profile, loading, refresh }}>
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
