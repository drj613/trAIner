import { getDb } from "./appDb";
import type { PromptPresetDocument } from "@/lib/programs/types";

export const promptPresetRepo = {
  async list(): Promise<PromptPresetDocument[]> {
    return (await getDb()).getAll("promptPresets");
  },

  async save(preset: PromptPresetDocument): Promise<void> {
    const now = new Date().toISOString();
    await (await getDb()).put("promptPresets", {
      ...preset,
      updatedAt: now,
      createdAt: preset.createdAt || now,
    });
  },

  async remove(id: string): Promise<void> {
    await (await getDb()).delete("promptPresets", id);
  },
};
