#!/usr/bin/env node
import { createRequire } from "node:module";
import { AdobeExperienceDevMcpServer } from "./server.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const server = new AdobeExperienceDevMcpServer(version);
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
