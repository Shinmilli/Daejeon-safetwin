import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';
import { startSensorSimulation } from './services/simulation.js';
import { getPublicDataConfigStatus } from './public-data/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 4000;

/** Netlify 등 프론트 도메인. 여러 개면 콤마로 구분 */
const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // 서버 간 호출·curl 등 Origin 없는 요청 허용
      if (!origin) {
        cb(null, true);
        return;
      }
      if (
        frontendOrigins.includes('*') ||
        frontendOrigins.includes(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin)
      ) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  const pub = getPublicDataConfigStatus();
  res.json({
    ok: true,
    service: 'Daejeon Safe-Twin API',
    version: '1.2.0',
    publicData: pub,
  });
});

app.use('/api', apiRouter);

startSensorSimulation(3000);

app.listen(PORT, '0.0.0.0', () => {
  const pub = getPublicDataConfigStatus();
  console.log(`[Safe-Twin] API listening on 0.0.0.0:${PORT}`);
  console.log(`[Safe-Twin] CORS origins: ${frontendOrigins.join(', ')}`);
  console.log(
    `[Safe-Twin] data.go.kr key: ${pub.dataGoKrKeyConfigured ? 'SET' : 'MISSING (weather/building → mock)'}`,
  );
  console.log(
    `[Safe-Twin] PRTR key: ${pub.prtrKeyConfigured ? 'SET' : 'MISSING (PRTR → cache sample)'}`,
  );
});
