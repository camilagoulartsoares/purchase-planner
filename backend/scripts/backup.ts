#!/usr/bin/env npx tsx
import { backupService } from "../src/services/backupService.js";

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === "restore") {
    const folder = arg
      ? backupService.restore(arg)
      : backupService.restoreLatest();
    console.log("Backup restaurado:", folder);
    process.exit(0);
  }

  if (cmd === "list") {
    const list = backupService.list();
    if (!list.length) {
      console.log("Nenhum backup ainda.");
    } else {
      for (const item of list) {
        console.log(
          `- ${item.name} | fotos: ${item.manifest?.uploadFiles ?? "?"} | ${item.manifest?.createdAt ?? ""}`,
        );
      }
    }
    process.exit(0);
  }

  const folder = backupService.create(cmd || "manual");
  console.log("Backup criado:", folder);
  console.log("Guarda: banco (preços/dados) + pasta de fotos.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
