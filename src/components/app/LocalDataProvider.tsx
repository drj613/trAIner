"use client";

import { useEffect, useState } from "react";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";

export function useLocalData() {
  const [programs, setPrograms] = useState<ProgramDocument[]>([]);
  const [profile, setProfile] = useState<ProfileDocument | undefined>();
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [storedProfile, storedPrograms] = await Promise.all([profileRepo.get(), programRepo.list()]);
    if (!storedProfile) {
      await profileRepo.save(defaultProfile);
    }
    if (storedPrograms.length === 0) {
      await programRepo.save(demoProgram);
    }
    setProfile(storedProfile ?? defaultProfile);
    setPrograms(storedPrograms.length > 0 ? storedPrograms : [demoProgram]);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function seedDemo() {
    await profileRepo.save(defaultProfile);
    await programRepo.save(demoProgram);
    await refresh();
  }

  return { programs, profile, loading, refresh, seedDemo };
}
