import { main as rebucketMain } from "./rebucketIndexCli.mjs";

const argv = process.argv.slice(2);
const hasFieldArg = argv.includes("--field");
const nextArgv = hasFieldArg ? argv : ["--field", "number", ...argv];

await rebucketMain(nextArgv);
