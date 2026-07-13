import { Router } from 'express';
import {
  getAllFactories,
  getBaselineMeta,
  getFactory,
  resetIncidents,
  triggerIncident,
} from '../services/simulation.js';
import { checkAnomaly } from '../ai/mahalanobis.js';
import { generateTacticalRecipe } from '../ai/recipe.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '../../data/factory_baseline.json');

export const apiRouter = Router();

/** GET /api/factories — 관내 공장 실시간 센서·안전등급 */
apiRouter.get('/factories', (_req, res) => {
  res.json({
    ok: true,
    meta: getBaselineMeta(),
    factories: getAllFactories(),
  });
});

apiRouter.get('/factories/:id', (req, res) => {
  const factory = getFactory(req.params.id);
  if (!factory) {
    res.status(404).json({ ok: false, error: 'Factory not found' });
    return;
  }
  res.json({ ok: true, factory });
});

/**
 * POST /api/trigger-incident
 * body: { factoryId?: string } — 기본 한화에어로스페이스 대전
 */
apiRouter.post('/trigger-incident', async (req, res) => {
  try {
    const factoryId = (req.body?.factoryId as string) || 'munpyeong-parts';
    const factory = await triggerIncident(factoryId);
    res.json({
      ok: true,
      message: 'Incident triggered — Mahalanobis threshold breached',
      factory,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Trigger failed',
    });
  }
});

apiRouter.post('/reset', async (_req, res) => {
  await resetIncidents();
  res.json({ ok: true, factories: getAllFactories() });
});

/** 기술검증용: 마할라노비스 직접 호출 */
apiRouter.post('/ai/check-anomaly', (req, res) => {
  const { currentData, factoryId } = req.body as {
    currentData: number[];
    factoryId?: string;
  };
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const id = factoryId || 'munpyeong-parts';
  const f = baseline.factories[id];
  if (!f || !currentData) {
    res.status(400).json({ ok: false, error: 'currentData and valid factoryId required' });
    return;
  }
  const result = checkAnomaly(currentData, f.meanVector, f.covarianceMatrix, baseline.threshold);
  res.json({ ok: true, result, baseline: { meanVector: f.meanVector, threshold: baseline.threshold } });
});

/** 기술검증용: 1초 레시피 직접 생성 */
apiRouter.post('/ai/recipe', async (req, res) => {
  const { factoryName, material, zone } = req.body as {
    factoryName: string;
    material: string;
    zone: string;
  };
  const recipe = await generateTacticalRecipe(
    factoryName || '한화에어로스페이스 대전',
    material || '나트륨',
    zone || '대덕구 문평동',
  );
  res.json({ ok: true, recipe });
});
