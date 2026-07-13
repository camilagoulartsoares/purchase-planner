import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(__dirname, "../../data");
export const uploadsDir = path.join(dataDir, "uploads");
export const dbPath = path.join(dataDir, "closet.db");
export const backupsDir = path.resolve(__dirname, "../../backups");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  ensureDir(path.dirname(dest));
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

export const backupService = {
  ensureDataDirs() {
    ensureDir(dataDir);
    ensureDir(uploadsDir);
    ensureDir(backupsDir);
  },

  isPostgres() {
    return (process.env.DATABASE_URL || "").startsWith("postgres");
  },

  /** Snapshot of photos (+ SQLite file if used). Keeps the last 20 backups. */
  create(reason = "manual") {
    this.ensureDataDirs();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const folder = path.join(backupsDir, `${stamp}_${reason}`);
    ensureDir(folder);

    if (!this.isPostgres() && fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(folder, "closet.db"));
    }
    copyRecursive(uploadsDir, path.join(folder, "uploads"));

    const manifest = {
      createdAt: new Date().toISOString(),
      reason,
      database: this.isPostgres() ? "postgresql-volume" : "sqlite-file",
      hasDatabase: fs.existsSync(path.join(folder, "closet.db")),
      uploadFiles: fs.existsSync(path.join(folder, "uploads"))
        ? fs.readdirSync(path.join(folder, "uploads")).length
        : 0,
    };
    fs.writeFileSync(
      path.join(folder, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    const all = fs
      .readdirSync(backupsDir)
      .filter((name) => fs.statSync(path.join(backupsDir, name)).isDirectory())
      .sort();
    while (all.length > 20) {
      const oldest = all.shift();
      if (!oldest) break;
      fs.rmSync(path.join(backupsDir, oldest), { recursive: true, force: true });
    }

    return folder;
  },

  list() {
    this.ensureDataDirs();
    return fs
      .readdirSync(backupsDir)
      .filter((name) => fs.statSync(path.join(backupsDir, name)).isDirectory())
      .sort()
      .reverse()
      .map((name) => {
        const folder = path.join(backupsDir, name);
        const manifestPath = path.join(folder, "manifest.json");
        const manifest = fs.existsSync(manifestPath)
          ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
          : null;
        return { name, folder, manifest };
      });
  },

  restoreLatest() {
    const [latest] = this.list();
    if (!latest) throw new Error("Nenhum backup encontrado");
    return this.restore(latest.name);
  },

  restore(backupName: string) {
    this.ensureDataDirs();
    const folder = path.join(backupsDir, backupName);
    if (!fs.existsSync(folder)) throw new Error("Backup não encontrado");

    const dbBackup = path.join(folder, "closet.db");
    if (fs.existsSync(dbBackup)) {
      fs.copyFileSync(dbBackup, dbPath);
    }
    const uploadsBackup = path.join(folder, "uploads");
    if (fs.existsSync(uploadsBackup)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      copyRecursive(uploadsBackup, uploadsDir);
    }
    return folder;
  },
};
