#!/usr/bin/env node
import { AdobeExperienceDevMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = new AdobeExperienceDevMcpServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
