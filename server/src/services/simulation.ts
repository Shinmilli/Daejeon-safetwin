import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAnomaly, DEFAULT_THRESHOLD } from '../ai/mahalanobis.js';
import { generateTacticalRecipe } from '../ai/recipe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '../../data/factory_baseline.json');

export type FactoryLive = {
  id: string;
  name: string;
  shortName: string;
  material: string;
  zone: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  sensors: {
    gas_ppm: number;
    current_amp: number;
    temperature_c: number;
  };
  sensorVector: number[];
  mahalanobisDistance: number;
  isAnomaly: boolean;
  safetyGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  safetyScore: number;
  status: 'normal' | 'warning' | 'critical' | 'fire';
  fallbackUsed?: boolean;
  incidentActive: boolean;
  recipeMarkdown: string | null;
  updatedAt: string;
};

type BaselineFactory = {
  id: string;
  name: string;
  shortName: string;
  material: string;
  zone: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  meanVector: number[];
  covarianceMatrix: number[][];
  normalRanges: Record<string, [number, number]>;
};

type BaselineFile = {
  threshold: number;
  factories: Record<string, BaselineFactory>;
};

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineFile;
const threshold = baseline.threshold ?? DEFAULT_THRESHOLD;

const liveState = new Map<string, FactoryLive>();

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function noise(center: number, amp: number) {
  return center + (Math.random() * 2 - 1) * amp;
}

function scoreFromDistance(distance: number, isAnomaly: boolean, fire: boolean): {
  score: number;
  grade: FactoryLive['safetyGrade'];
  status: FactoryLive['status'];
} {
  if (fire) return { score: 32, grade: 'F', status: 'fire' };
  if (isAnomaly || distance > threshold) {
    const score = clamp(Math.round(55 - distance * 4), 20, 60);
    return { score, grade: score < 40 ? 'F' : 'D', status: 'critical' };
  }
  if (distance > 2.0) {
    const score = clamp(Math.round(85 - distance * 5), 70, 88);
    return { score, grade: 'B', status: 'warning' };
  }
  const score = clamp(Math.round(98 - distance * 3), 90, 99);
  return { score, grade: 'A', status: 'normal' };
}

function evaluate(factory: BaselineFactory, vector: number[], incidentActive: boolean): FactoryLive {
  const result = checkAnomaly(vector, factory.meanVector, factory.covarianceMatrix, threshold);
  const fire = incidentActive && result.isAnomaly;
  const { score, grade, status } = scoreFromDistance(
    result.distance,
    result.isAnomaly,
    fire,
  );

  return {
    id: factory.id,
    name: factory.name,
    shortName: factory.shortName,
    material: factory.material,
    zone: factory.zone,
    address: factory.address,
    district: factory.district,
    lat: factory.lat,
    lng: factory.lng,
    sensors: {
      gas_ppm: round1(vector[0]),
      current_amp: round1(vector[1]),
      temperature_c: round1(vector[2]),
    },
    sensorVector: vector.map(round1),
    mahalanobisDistance: result.distance,
    isAnomaly: result.isAnomaly,
    safetyGrade: grade,
    safetyScore: score,
    status: fire ? 'fire' : status,
    fallbackUsed: result.fallbackUsed,
    incidentActive,
    recipeMarkdown: null,
    updatedAt: new Date().toISOString(),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function initState() {
  for (const factory of Object.values(baseline.factories)) {
    liveState.set(factory.id, evaluate(factory, [...factory.meanVector], false));
  }
}

initState();

export function startSensorSimulation(intervalMs = 3000) {
  setInterval(() => {
    for (const factory of Object.values(baseline.factories)) {
      const prev = liveState.get(factory.id)!;
      if (prev.incidentActive) continue;

      const [gMin, gMax] = factory.normalRanges.gas_ppm;
      const [cMin, cMax] = factory.normalRanges.current_amp;
      const [tMin, tMax] = factory.normalRanges.temperature_c;

      const vector = [
        clamp(noise(factory.meanVector[0], 8), gMin, gMax),
        clamp(noise(factory.meanVector[1], 12), cMin, cMax),
        clamp(noise(factory.meanVector[2], 1.5), tMin, tMax),
      ];

      liveState.set(factory.id, evaluate(factory, vector, false));
    }
  }, intervalMs);
}

export function getAllFactories(): FactoryLive[] {
  return Array.from(liveState.values());
}

export function getFactory(id: string): FactoryLive | undefined {
  return liveState.get(id);
}

export function getBaselineMeta() {
  return {
    threshold,
    featureOrder: ['gas_ppm', 'current_amp', 'temperature_c'],
    factoryIds: Object.keys(baseline.factories),
  };
}

/** 기본 시연 대상: 한화에어로스페이스 대전 (나트륨 RAG 가드레일) */
export async function triggerIncident(factoryId = 'hanwha-daejeon'): Promise<FactoryLive> {
  const factory = baseline.factories[factoryId];
  if (!factory) {
    throw new Error(`Unknown factory: ${factoryId}`);
  }

  const spikeVector = [
    factory.meanVector[0] + 180,
    factory.meanVector[1] + 220,
    factory.meanVector[2] + 25,
  ];

  const live = evaluate(factory, spikeVector, true);
  live.status = 'fire';
  live.safetyScore = 32;
  live.safetyGrade = 'F';
  live.incidentActive = true;
  live.isAnomaly = true;

  const recipe = await generateTacticalRecipe(factory.name, factory.material, factory.zone);
  live.recipeMarkdown = recipe;

  liveState.set(factory.id, live);
  return live;
}

export async function resetIncidents() {
  for (const factory of Object.values(baseline.factories)) {
    liveState.set(factory.id, evaluate(factory, [...factory.meanVector], false));
  }
}
