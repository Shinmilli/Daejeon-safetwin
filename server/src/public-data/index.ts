import { fetchWeather, type WeatherSnapshot } from './weather.js';
import { fetchBuildingTitle, type BuildingSnapshot } from './building.js';
import { fetchPrtrDaejeon, type PrtrSnapshot } from './prtr.js';
import { buildGisOverlay, type GisOverlay } from './plume.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '../../data/factory_baseline.json');

type FactoryBuildingCodes = {
  id: string;
  address: string;
  lat: number;
  lng: number;
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
};

type BaselineFile = {
  factories: Record<
    string,
    {
      id: string;
      address: string;
      lat: number;
      lng: number;
      buildingLookup?: {
        sigunguCd: string;
        bjdongCd: string;
        bun: string;
        ji: string;
      };
    }
  >;
};

export type PublicDataStatus = {
  dataGoKrKeyConfigured: boolean;
  prtrKeyConfigured: boolean;
  weather: { mode: WeatherSnapshot['source']; message?: string };
  building: { mode: BuildingSnapshot['source']; message?: string };
  prtr: { mode: PrtrSnapshot['source']; message?: string };
  checkedAt: string;
};

export type FactoryPublicEnrichment = {
  factoryId: string;
  weather: WeatherSnapshot;
  building: BuildingSnapshot;
};

export type { GisOverlay };

let weatherCache: { at: number; byFactory: Map<string, WeatherSnapshot> } = {
  at: 0,
  byFactory: new Map(),
};
let buildingCache: { at: number; byFactory: Map<string, BuildingSnapshot> } = {
  at: 0,
  byFactory: new Map(),
};
let prtrCache: { at: number; data: PrtrSnapshot | null } = { at: 0, data: null };

const WEATHER_TTL_MS = 5 * 60 * 1000;
const BUILDING_TTL_MS = 60 * 60 * 1000;
const PRTR_TTL_MS = 60 * 60 * 1000;

function loadFactories(): FactoryBuildingCodes[] {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineFile;
  return Object.values(baseline.factories).map((f) => ({
    id: f.id,
    address: f.address,
    lat: f.lat,
    lng: f.lng,
    sigunguCd: f.buildingLookup?.sigunguCd ?? '30200',
    bjdongCd: f.buildingLookup?.bjdongCd ?? '11500',
    bun: f.buildingLookup?.bun ?? '0001',
    ji: f.buildingLookup?.ji ?? '0000',
  }));
}

export function getPublicDataConfigStatus(): Omit<
  PublicDataStatus,
  'weather' | 'building' | 'prtr' | 'checkedAt'
> {
  return {
    dataGoKrKeyConfigured: Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim()),
    prtrKeyConfigured: Boolean(process.env.PRTR_ACCESS_KEY?.trim()),
  };
}

export async function getWeatherForFactory(factoryId: string): Promise<WeatherSnapshot> {
  const now = Date.now();
  if (now - weatherCache.at < WEATHER_TTL_MS && weatherCache.byFactory.has(factoryId)) {
    return weatherCache.byFactory.get(factoryId)!;
  }

  const factories = loadFactories();
  const target = factories.find((f) => f.id === factoryId) ?? factories[0];
  const snap = await fetchWeather(target.lat, target.lng);

  if (now - weatherCache.at >= WEATHER_TTL_MS) {
    weatherCache = { at: now, byFactory: new Map() };
  }
  weatherCache.byFactory.set(factoryId, snap);
  return snap;
}

export async function getBuildingForFactory(factoryId: string): Promise<BuildingSnapshot> {
  const now = Date.now();
  if (now - buildingCache.at < BUILDING_TTL_MS && buildingCache.byFactory.has(factoryId)) {
    return buildingCache.byFactory.get(factoryId)!;
  }

  const factories = loadFactories();
  const target = factories.find((f) => f.id === factoryId) ?? factories[0];
  const snap = await fetchBuildingTitle({
    address: target.address,
    sigunguCd: target.sigunguCd,
    bjdongCd: target.bjdongCd,
    bun: target.bun,
    ji: target.ji,
  });

  if (now - buildingCache.at >= BUILDING_TTL_MS) {
    buildingCache = { at: now, byFactory: new Map() };
  }
  buildingCache.byFactory.set(factoryId, snap);
  return snap;
}

export async function getPrtr(): Promise<PrtrSnapshot> {
  const now = Date.now();
  if (prtrCache.data && now - prtrCache.at < PRTR_TTL_MS) return prtrCache.data;
  const data = await fetchPrtrDaejeon();
  prtrCache = { at: now, data };
  return data;
}

export async function getPublicDataStatus(): Promise<PublicDataStatus> {
  const [weather, building, prtr] = await Promise.all([
    getWeatherForFactory('hanwha-daejeon'),
    getBuildingForFactory('hanwha-daejeon'),
    getPrtr(),
  ]);
  const cfg = getPublicDataConfigStatus();
  return {
    ...cfg,
    weather: { mode: weather.source, message: weather.message },
    building: { mode: building.source, message: building.message },
    prtr: { mode: prtr.source, message: prtr.message },
    checkedAt: new Date().toISOString(),
  };
}

export async function enrichFactoryPublicData(
  factoryId: string,
): Promise<FactoryPublicEnrichment> {
  const [weather, building] = await Promise.all([
    getWeatherForFactory(factoryId),
    getBuildingForFactory(factoryId),
  ]);
  return { factoryId, weather, building };
}

/** 기상 기반 GIS 확산 열지도 + 우회 대피 경로 */
export async function getGisOverlay(factoryId: string): Promise<{
  factoryId: string;
  origin: { lat: number; lng: number };
  weather: WeatherSnapshot;
  overlay: GisOverlay;
}> {
  const factories = loadFactories();
  const target = factories.find((f) => f.id === factoryId) ?? factories[0];
  const weather = await getWeatherForFactory(target.id);
  const overlay = buildGisOverlay(target.lat, target.lng, weather, 350);
  return {
    factoryId: target.id,
    origin: { lat: target.lat, lng: target.lng },
    weather,
    overlay,
  };
}
