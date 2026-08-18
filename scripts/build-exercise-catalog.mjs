import { runIngestion } from "./catalog-normalization/ingest.ts";

if (import.meta.main) await runIngestion(process.argv.slice(2));
