import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createApiRouter } from './app.js';
import { config } from './config.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const app = express();

app.use('/api', await createApiRouter());
app.use(express.static(join(rootDir, 'dist')));

app.listen(config.serverPort, '0.0.0.0', () => {
  console.info(`Production server listening on port ${config.serverPort}`);
});
