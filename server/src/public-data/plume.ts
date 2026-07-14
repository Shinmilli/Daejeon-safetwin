import type { WeatherSnapshot } from './weather.js';

/** 미터 오프셋 → 위경도 (대략, 대전 위도) */
function offsetLatLng(
  lat: number,
  lng: number,
  eastM: number,
  northM: number,
): [number, number] {
  const dLat = northM / 111_320;
  const dLng = eastM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

/** 기상청 VEC: 바람이 불어오는 방위(°). 확산은 그 반대(풍하) 방향. */
export function downwindBearingDeg(windFromDeg: number): number {
  return (windFromDeg + 180) % 360;
}

function bearingToOffset(bearingDeg: number, distanceM: number): { east: number; north: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    east: distanceM * Math.sin(rad),
    north: distanceM * Math.cos(rad),
  };
}

export type GisOverlay = {
  caption: string;
  weatherSource: WeatherSnapshot['source'];
  windFromDeg: number;
  windToDeg: number;
  windLabel: string;
  windSpeedMs: number;
  /** 풍하 방향 부채꼴 확산 폴리곤 (외곽) */
  plumePolygon: Array<[number, number]>;
  /** GIS 격자 셀 중심 + 강도(0~1) — 열지도 */
  gridCells: Array<{ lat: number; lng: number; intensity: number; sizeM: number }>;
  /** 주민 우회 대피 경로 (위험구역을 피한 폴리라인) */
  evacuationRoutes: Array<{
    id: string;
    label: string;
    path: Array<[number, number]>;
  }>;
  evacuationRadiusM: number;
};

/**
 * 기상청 풍향·풍속 기반 GIS 격자 가스확산 + 우회 대피 경로
 * (제안서: GIS 격자 맵 기반 가스 확산 열지도 · 주민 동적 우회 대피 경로 시각화)
 */
export function buildGisOverlay(
  originLat: number,
  originLng: number,
  weather: WeatherSnapshot,
  evacuationRadiusM = 350,
): GisOverlay {
  const windFrom = weather.windDirectionDeg ?? 225;
  const windSpeed = weather.windSpeedMs ?? 3.2;
  const windTo = downwindBearingDeg(windFrom);
  const spreadHalfAngle = Math.max(25, Math.min(55, 45 - windSpeed * 2)); // 강풍일수록 좁고 길게
  const plumeLen = Math.min(1200, 400 + windSpeed * 120);

  // --- plume sector polygon ---
  const plumePolygon: Array<[number, number]> = [[originLat, originLng]];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bearing = windTo - spreadHalfAngle + t * (spreadHalfAngle * 2);
    const { east, north } = bearingToOffset(bearing, plumeLen);
    plumePolygon.push(offsetLatLng(originLat, originLng, east, north));
  }

  // --- GIS grid heatmap cells (downwind biased) ---
  const gridCells: GisOverlay['gridCells'] = [];
  const cell = 120; // m
  const extent = Math.ceil(plumeLen / cell) + 1;
  for (let i = -2; i <= extent; i++) {
    for (let j = -extent; j <= extent; j++) {
      const east = j * cell;
      const north = i * cell;
      // rotate into wind frame: x=crosswind, y=downwind
      const rad = ((90 - windTo) * Math.PI) / 180;
      const x = east * Math.cos(rad) + north * Math.sin(rad);
      const y = -east * Math.sin(rad) + north * Math.cos(rad);
      if (y < -cell || y > plumeLen + cell) continue;
      const halfWidth = (y / plumeLen) * Math.tan((spreadHalfAngle * Math.PI) / 180) * plumeLen + cell;
      if (Math.abs(x) > halfWidth) continue;
      const along = Math.max(0, 1 - y / plumeLen);
      const across = 1 - Math.abs(x) / Math.max(halfWidth, 1);
      const intensity = Math.max(0, Math.min(1, along * across));
      if (intensity < 0.08) continue;
      const [lat, lng] = offsetLatLng(originLat, originLng, east, north);
      gridCells.push({ lat, lng, intensity, sizeM: cell * 0.9 });
    }
  }

  // --- evacuation detour routes (avoid plume centerline) ---
  // 좌/우 측면으로 우회 후 풍상(안전) 방향으로 탈출
  const upwind = windFrom; // 바람이 오는 쪽 = 상대적으로 안전
  const leftBearing = (windTo - 90 + 360) % 360;
  const rightBearing = (windTo + 90) % 360;

  const makeRoute = (
    id: string,
    label: string,
    sideBearing: number,
  ): GisOverlay['evacuationRoutes'][0] => {
    const p0: [number, number] = [originLat, originLng];
    const side1 = bearingToOffset(sideBearing, evacuationRadiusM * 0.9);
    const p1 = offsetLatLng(originLat, originLng, side1.east, side1.north);
    const side2 = bearingToOffset(sideBearing, evacuationRadiusM * 1.4);
    const along = bearingToOffset(upwind, evacuationRadiusM * 1.6);
    const p2 = offsetLatLng(originLat, originLng, side2.east + along.east * 0.3, side2.north + along.north * 0.3);
    const p3 = offsetLatLng(originLat, originLng, along.east * 1.2 + side2.east * 0.4, along.north * 1.2 + side2.north * 0.4);
    return { id, label, path: [p0, p1, p2, p3] };
  };

  const evacuationRoutes = [
    makeRoute('evac-left', '우회 대피 A (측면)', leftBearing),
    makeRoute('evac-right', '우회 대피 B (측면)', rightBearing),
  ];

  const caption = `GIS 격자 맵 기반 가스 확산 열지도 · 주민 동적 우회 대피 경로 시각화 · 풍향 ${weather.windDirectionLabel}→${windLabelOpposite(weather.windDirectionLabel)} (${weather.source})`;

  return {
    caption,
    weatherSource: weather.source,
    windFromDeg: windFrom,
    windToDeg: windTo,
    windLabel: weather.windDirectionLabel,
    windSpeedMs: windSpeed,
    plumePolygon,
    gridCells,
    evacuationRoutes,
    evacuationRadiusM,
  };
}

function windLabelOpposite(label: string): string {
  const map: Record<string, string> = {
    N: 'S',
    NNE: 'SSW',
    NE: 'SW',
    ENE: 'WSW',
    E: 'W',
    ESE: 'WNW',
    SE: 'NW',
    SSE: 'NNW',
    S: 'N',
    SSW: 'NNE',
    SW: 'NE',
    WSW: 'ENE',
    W: 'E',
    WNW: 'ESE',
    NW: 'SE',
    NNW: 'SSE',
  };
  return map[label] ?? '풍하';
}
