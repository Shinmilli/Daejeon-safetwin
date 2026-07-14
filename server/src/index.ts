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

/** 끝 / 제거. FRONTEND_ORIGIN 외에도 *.netlify.app / localhost 허용 */
const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  const o = origin.replace(/\/$/, '');
  if (frontendOrigins.includes('*')) return true;
  if (frontendOrigins.includes(o)) return true;
  if (/^http:\/\/localhost:\d+$/.test(o)) return true;
  // Netlify 미리보기/프로덕션 도메인
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(o)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (isAllowedOrigin(origin)) {
        // 요청 Origin 그대로 반사 (브라우저 CORS 통과)
        cb(null, origin);
        return;
      }
      console.warn(`[Safe-Twin] CORS blocked: ${origin} | allowlist=${frontendOrigins.join(',')}`);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  const pub = getPublicDataConfigStatus();
  res.json({
    ok: true,
    service: 'Daejeon Safe-Twin API',
    version: '1.2.1',
    publicData: pub,
    corsAllowlist: frontendOrigins,
  });
});

app.use('/api', apiRouter);

startSensorSimulation(3000);

app.listen(PORT, '0.0.0.0', () => {
  const pub = getPublicDataConfigStatus();
  console.log(`[Safe-Twin] API listening on 0.0.0.0:${PORT}`);
  console.log(`[Safe-Twin] CORS allowlist: ${frontendOrigins.join(', ')} + *.netlify.app + localhost`);
  console.log(
    `[Safe-Twin] data.go.kr key: ${pub.dataGoKrKeyConfigured ? 'SET' : 'MISSING (weather/building → mock)'}`,
  );
  console.log(
    `[Safe-Twin] PRTR key: ${pub.prtrKeyConfigured ? 'SET' : 'MISSING (PRTR → cache sample)'}`,
  );
});
