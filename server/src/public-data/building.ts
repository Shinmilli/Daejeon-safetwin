export type BuildingSnapshot = {
  source: 'building-hub-live' | 'mock-fallback';
  address: string;
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
  buildingName: string | null;
  mainPurpsCdNm: string | null;
  strctCdNm: string | null;
  useAprDay: string | null;
  totArea: number | null;
  platArea: number | null;
  groundFloorCnt: number | null;
  message?: string;
  raw?: unknown;
};

function mockBuilding(
  address: string,
  codes: { sigunguCd: string; bjdongCd: string; bun: string; ji: string },
  reason: string,
): BuildingSnapshot {
  return {
    source: 'mock-fallback',
    address,
    ...codes,
    buildingName: '모의 건축물 (API 미연결)',
    mainPurpsCdNm: '공장',
    strctCdNm: '철골구조',
    useAprDay: '19980315',
    totArea: 8420,
    platArea: 12000,
    groundFloorCnt: 3,
    message: reason,
  };
}

/**
 * 국토교통부 건축HUB 건축물대장 표제부 조회
 * https://www.data.go.kr/data/15134735/openapi.do
 * getBrTitleInfo
 */
export async function fetchBuildingTitle(params: {
  address: string;
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}): Promise<BuildingSnapshot> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  const { address, sigunguCd, bjdongCd, bun, ji } = params;

  if (!key) {
    return mockBuilding(address, { sigunguCd, bjdongCd, bun, ji }, 'DATA_GO_KR_SERVICE_KEY 미설정');
  }

  const qs = [
    `serviceKey=${key}`,
    `sigunguCd=${sigunguCd}`,
    `bjdongCd=${bjdongCd}`,
    'platGbCd=0',
    `bun=${bun.padStart(4, '0')}`,
    `ji=${ji.padStart(4, '0')}`,
    'numOfRows=10',
    'pageNo=1',
    '_type=json',
  ].join('&');

  const endpoint =
    'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?' + qs;

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return mockBuilding(address, params, `건축물대장 HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string };
        body?: {
          totalCount?: number | string;
          items?: { item?: Record<string, string> | Array<Record<string, string>> };
        };
      };
    };

    const code = json.response?.header?.resultCode;
    const rawItem = json.response?.body?.items?.item;
    const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;

    if (code !== '00' || !item) {
      return mockBuilding(
        address,
        params,
        `건축물대장 응답 없음/실패: ${json.response?.header?.resultMsg ?? code ?? 'empty'} (번지 코드 확인 필요)`,
      );
    }

    return {
      source: 'building-hub-live',
      address,
      sigunguCd,
      bjdongCd,
      bun,
      ji,
      buildingName: item.bldNm || item.dongNm || null,
      mainPurpsCdNm: item.mainPurpsCdNm || null,
      strctCdNm: item.strctCdNm || null,
      useAprDay: item.useAprDay || null,
      totArea: item.totArea ? Number(item.totArea) : null,
      platArea: item.platArea ? Number(item.platArea) : null,
      groundFloorCnt: item.grndFlrCnt ? Number(item.grndFlrCnt) : null,
      raw: item,
    };
  } catch (err) {
    return mockBuilding(
      address,
      params,
      `건축물대장 예외: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}
