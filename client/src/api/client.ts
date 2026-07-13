import type { FactoriesResponse, FactoryLive } from '../types';

const BASE = '';

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
