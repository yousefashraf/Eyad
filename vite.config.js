import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdir, readFile } from 'fs/promises';
import { defineConfig } from 'vite';
import { createApiRouter } from './server/app.js';
import { config } from './server/config.js';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function localAuthApi() {
  return {
    name: 'local-auth-api',
    async configureServer(server) {
      server.middlewares.use('/api', await createApiRouter());
    },
  };
}

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    async generateBundle() {
      for (const directory of ['transformation', 'certificates']) {
        const files = await collectFiles(resolve(rootDir, directory));
        for (const file of files) {
          this.emitFile({
            type: 'asset',
            fileName: file.slice(rootDir.length).replace(/\\/g, '/').replace(/^\//, ''),
            source: await readFile(file),
          });
        }
      }
      for (const file of [
        'logo.png',
        'logo.jpeg',
        'logo-icon.svg',
        'ISSA-Certified-Personal-Trainer-Certification.pdf',
        'ISSA-Nutritionist-Certification.pdf',
        'ISSA-Strength-and-Conditioning-Certification.pdf',
        'Nutrition plan - Sample A.pdf',
        'Nutrition plan - Sample B.pdf',
        'Nutrition plan - Sample C.pdf',
        'Hybrid Training Program – Intermediate Edition.pdf',
        'Hybrid training program (ultimate).pdf',
        'Hyrox prep training program– Semi Edition.pdf',
      ]) {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: await readFile(resolve(rootDir, file)),
        });
      }
      for (const file of [
        'assets/images/nutrition-plan-sample-a-cover.png',
        'assets/images/nutrition-plan-sample-b-cover.png',
        'assets/images/nutrition-plan-sample-c-cover.png',
      ]) {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: await readFile(resolve(rootDir, file)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [localAuthApi(), copyStaticAssets()],
  server: {
    host: '0.0.0.0',
    port: config.serverPort,
  },
  preview: {
    host: '0.0.0.0',
    port: config.previewPort,
  },
  build: {
    rollupOptions: {
      input: [
        resolve(rootDir, 'index.html'),
        resolve(rootDir, 'about.html'),
        resolve(rootDir, 'auth-updated.html'),
        resolve(rootDir, 'admin-login.html'),
        resolve(rootDir, 'admin-submission.html'),
        resolve(rootDir, 'admin-dashboard.html'),
        resolve(rootDir, 'dietary-log.html'),
        resolve(rootDir, 'exercise-history.html'),
        resolve(rootDir, 'food-preferences.html'),
        resolve(rootDir, 'health-history.html'),
        resolve(rootDir, 'nutrition-assessment-updated.html'),
        resolve(rootDir, 'transformations.html'),
      ],
    },
  },
});
