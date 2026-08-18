export * from "./core";

import { runCompilerCli } from "./core";

if (import.meta.main) await runCompilerCli(process.argv.slice(2));
