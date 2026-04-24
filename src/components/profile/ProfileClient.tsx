"use client";

import { useLocalData } from "@/components/app/LocalDataProvider";
import { defaultProfile } from "@/lib/programs/sample";
import { profileRepo } from "@/lib/storage/profileRepo";

export function ProfileClient() {
  const { profile, loading, refresh } = useLocalData();

  async function saveDefault() {
    await profileRepo.save(defaultProfile);
    await refresh();
  }

  if (loading) return <p className="muted">Loading profile...</p>;

  return (
    <div className="stack">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="panel stack">
        <input className="input" defaultValue={profile?.name} aria-label="Name" />
        <p className="muted">{profile?.goals.join(", ")}</p>
        <p className="muted">{profile?.equipment.join(", ")}</p>
      </div>
      <button className="button" onClick={saveDefault}>
        Save Local Profile
      </button>
    </div>
  );
}
