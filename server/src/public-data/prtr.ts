import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '../../data/cache/prtr_daejeon_sample.json');

export type PrtrSnapshot = {
  source: 'prtr-live' | 'cache-fallback' | 'mock-fallback';
  year: number;
  regionHint: string;
  facilities: Array<{
    name: string;
    material: string;
    amountKg: number | null;
    note?: string;
  }>;
  message?: string;
  fetchedAt: string;
};

type CacheFile = {
  year: number;
  regionHint: string;
  facilities: PrtrSnapshot['facilities'];
  note: string;
};

/**
 * 화학물질안전원 PRTR Open API
 * https://icis.me.go.kr/prtr/infoYard/openApi.do
 *
 * 주의: 공공데이터포털과 별도 인증키(accessKey)가 필요할 수 있음.
 * 승인 전이거나 실패 시 로컬 캐시(sample)로 폴백.
 */
export async function fetchPrtrDaejeon(year = new Date().getFullYear() - 2): Promise<PrtrSnapshot> {
  const accessKey = process.env.PRTR_ACCESS_KEY?.trim();

  if (accessKey) {
    try {
      const qs = [
        `accessKey=${accessKey}`,
        `searchYear=${year}`,
        'dataType=json',
      ].join('&');
      const endpoint = `http://icis.me.go.kr/openapi/service/prtr/getPrtrList?${qs}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const text = await res.text();
        // 응답 스키마가 XML/JSON 혼재할 수 있어 우선 성공 여부만 판정
        if (text && !/error|오류|인증/i.test(text.slice(0, 200))) {
          return {
            source: 'prtr-live',
            year,
            regionHint: '전국 PRTR (대전 필터는 후처리)',
            facilities: [
              {
                name: 'PRTR live payload received',
                material: 'see raw upstream',
                amountKg: null,
                note: `응답 길이 ${text.length}B — 파서는 승인 후 스키마 확정`,
              },
            ],
            message: 'PRTR live 응답 수신. 스키마 매핑은 SETUP 문서 참고.',
            fetchedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      /* fall through to cache */
    }
  }

  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as CacheFile;
    return {
      source: 'cache-fallback',
      year: cache.year,
      regionHint: cache.regionHint,
      facilities: cache.facilities,
      message:
        accessKey
          ? 'PRTR live 실패 → 로컬 캐시 사용'
          : 'PRTR_ACCESS_KEY 미설정 → 로컬 캐시(공모 시연용 sample) 사용',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return {
      source: 'mock-fallback',
      year,
      regionHint: '대전광역시',
      facilities: [
        { name: '문평동 모의공장', material: '나트륨', amountKg: 2000 },
        { name: '한화에어로스페이스 대전', material: '추진체 관련 물질', amountKg: null },
      ],
      message: '캐시 파일 없음 — 하드코딩 mock',
      fetchedAt: new Date().toISOString(),
    };
  }
}
