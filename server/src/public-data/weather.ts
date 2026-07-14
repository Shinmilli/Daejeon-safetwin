/**
 * 기상청 격자 변환 (위경도 → nx, ny)
 * 공식: 기상청 단기예보 오픈API 활용가이드 Lambert conformal conic
 */
export function latLngToGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

export type WeatherSnapshot = {
  source: 'kma-live' | 'mock-fallback';
  lat: number;
  lng: number;
  nx: number;
  ny: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  windDirectionLabel: string;
  precipitationMm: number | null;
  observedAt: string;
  rawCategories?: Record<string, string>;
  message?: string;
};

const WDIR_LABELS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

function degToLabel(deg: number): string {
  const idx = Math.round(deg / 22.5) % 16;
  return WDIR_LABELS[idx] ?? '—';
}

function baseDateTimeForNcst(): { base_date: string; base_time: string } {
  const now = new Date();
  // 초단기실황은 매시간 40분 이후 제공 → 40분 이전이면 1시간 전
  const shifted = new Date(now.getTime() - 40 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  const h = String(shifted.getHours()).padStart(2, '0');
  return { base_date: `${y}${m}${d}`, base_time: `${h}00` };
}

function mockWeather(lat: number, lng: number, reason: string): WeatherSnapshot {
  const { nx, ny } = latLngToGrid(lat, lng);
  return {
    source: 'mock-fallback',
    lat,
    lng,
    nx,
    ny,
    temperatureC: 28.4,
    humidityPct: 62,
    windSpeedMs: 3.2,
    windDirectionDeg: 225,
    windDirectionLabel: 'SW',
    precipitationMm: 0,
    observedAt: new Date().toISOString(),
    message: reason,
  };
}

/**
 * 기상청 초단기실황 (온도·습도·풍향·풍속)
 * https://www.data.go.kr/data/15084084/openapi.do
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  const { nx, ny } = latLngToGrid(lat, lng);

  if (!key) {
    return mockWeather(lat, lng, 'DATA_GO_KR_SERVICE_KEY 미설정 — mock 기상 사용');
  }

  const { base_date, base_time } = baseDateTimeForNcst();

  try {
    // serviceKey가 이미 encode된 경우 이중인코딩 방지
    const qs = [
      `serviceKey=${key}`,
      'pageNo=1',
      'numOfRows=100',
      'dataType=JSON',
      `base_date=${base_date}`,
      `base_time=${base_time}`,
      `nx=${nx}`,
      `ny=${ny}`,
    ].join('&');
    const endpoint =
      'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?' + qs;

    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return mockWeather(lat, lng, `기상청 HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: { items?: { item?: Array<{ category: string; obsrValue: string }> } };
      };
    };

    const code = json.response?.header?.resultCode;
    const items = json.response?.body?.items?.item ?? [];
    if (code !== '00' || items.length === 0) {
      return mockWeather(
        lat,
        lng,
        `기상청 응답 실패: ${json.response?.header?.resultMsg ?? code ?? 'empty'}`,
      );
    }

    const map: Record<string, string> = {};
    for (const it of items) map[it.category] = it.obsrValue;

    const wsd = map.WSD ? Number(map.WSD) : null;
    const vec = map.VEC ? Number(map.VEC) : null;

    return {
      source: 'kma-live',
      lat,
      lng,
      nx,
      ny,
      temperatureC: map.T1H ? Number(map.T1H) : null,
      humidityPct: map.REH ? Number(map.REH) : null,
      windSpeedMs: wsd,
      windDirectionDeg: vec,
      windDirectionLabel: vec != null ? degToLabel(vec) : '—',
      precipitationMm: map.RN1 ? Number(map.RN1) : 0,
      observedAt: new Date().toISOString(),
      rawCategories: map,
    };
  } catch (err) {
    return mockWeather(
      lat,
      lng,
      `기상청 호출 예외: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}
