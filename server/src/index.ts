import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';
import { startSensorSimulation } from './services/simulation.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'Daejeon Safe-Twin API', version: '1.0.0' });
});

app.use('/api', apiRouter);

startSensorSimulation(3000);

app.listen(PORT, () => {
  console.log(`[Safe-Twin] API listening on http://localhost:${PORT}`);
  console.log(`[Safe-Twin] Sensor simulation tick: every 3s`);
  console.log(`[Safe-Twin] Demo trigger: POST /api/trigger-incident`);
});
