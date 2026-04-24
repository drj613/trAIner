import { copyFile, mkdir } from "node:fs/promises";

await mkdir("src/lib/catalog/generated", { recursive: true });
await copyFile("src/lib/catalog/exercises.ts", "src/lib/catalog/generated/exercises.ts");

console.log("Exercise catalog is bundled from src/lib/catalog/exercises.ts");
