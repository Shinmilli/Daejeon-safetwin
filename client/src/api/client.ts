import type { FactoriesResponse, FactoryLive } from '../types';

/** 로컬은 Vite proxy(빈 문자열). 배포 시 Netlify env에 VITE_API_BASE=https://xxx.onrender.com */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

export async function fetchFactories(): Promise<FactoriesResponse> {
  const res = await fetch(`${BASE}/api/factories`);
  if (!res.ok) throw new Error('Failed to fetch factories');
  return res.json();
}

export async function triggerIncident(factoryId = 'hanwha-daejeon'): Promise<FactoryLive> {
  const res = await fetch(`${BASE}/api/trigger-incident`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factoryId }),
  });
  if (!res.ok) throw new Error('Failed to trigger incident');
  const data = await res.json();
  return data.factory as FactoryLive;
}

export async function resetIncidents(): Promise<void> {
  await fetch(`${BASE}/api/reset`, { method: 'POST' });
}

export type PublicDataStatus = {
  dataGoKrKeyConfigured: boolean;
  prtrKeyConfigured: boolean;
  weather: { mode: string; message?: string };
  building: { mode: string; message?: string };
  prtr: { mode: string; message?: string };
  checkedAt: string;
};

export type GisOverlayPayload = {
  factoryId: string;
  origin: { lat: number; lng: number };
  weather: {
    source: string;
    windDirectionDeg: number | null;
    windDirectionLabel: string;
    windSpeedMs: number | null;
  };
  overlay: {
    caption: string;
    weatherSource: string;
    windFromDeg: number;
    windToDeg: number;
    windLabel: string;
    windSpeedMs: number;
    plumePolygon: Array<[number, number]>;
    gridCells: Array<{ lat: number; lng: number; intensity: number; sizeM: number }>;
    evacuationRoutes: Array<{
      id: string;
      label: string;
      path: Array<[number, number]>;
    }>;
    evacuationRadiusM: number;
  };
};

export async function fetchPublicDataStatus(): Promise<PublicDataStatus> {
  const res = await fetch(`${BASE}/api/public-data/status`);
  if (!res.ok) throw new Error('Failed to fetch public-data status');
  const data = await res.json();
  return data.status as PublicDataStatus;
}

export async function fetchGisOverlay(factoryId: string): Promise<GisOverlayPayload> {
  const res = await fetch(
    `${BASE}/api/public-data/gis-overlay?factoryId=${encodeURIComponent(factoryId)}`,
  );
  if (!res.ok) throw new Error('Failed to fetch GIS overlay');
  const data = await res.json();
  return {
    factoryId: data.factoryId,
    origin: data.origin,
    weather: data.weather,
    overlay: data.overlay,
  };
}
