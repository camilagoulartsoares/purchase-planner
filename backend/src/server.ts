import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { backupService } from "./services/backupService.js";

backupService.ensureDataDirs();

const app = createApp();

app.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
  console.log(`Dados persistentes em: backend/data`);
  console.log(
    `Fotos: ${
      env.cloudinary.cloudName ? "Cloudinary (nuvem)" : "disco local (data/uploads)"
    }`,
  );
});
