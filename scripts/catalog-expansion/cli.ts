import { runSearchCli } from "./io";

runSearchCli(process.argv.slice(2), process.cwd())
  .then((lines) => { for (const line of lines) console.log(line); })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
