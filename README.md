# Daejeon Safe-Twin

2026 대전 공공데이터·AI 활용 창업경진대회 MVP  
**지능형 로컬 방재 플랫폼** — 2단계 하이브리드 아키텍처

`1차 엣지 스크리닝(마할라노비스)` → `2차 서버 정밀 추론 + RAG 가드레일`

## Quick Start

```bash
# 터미널 1 — API (포트 4000)
cd server && npm install && npm run dev

# 터미널 2 — Dashboard (포트 5173)
cd client && npm install && npm run dev
```

브라우저: http://localhost:5173

### 시연 핫키
| 키 | 동작 |
|----|------|
| `Ctrl + Space` 또는 `Shift + Enter` | 사고 시나리오 전체 트리거 |
| `Alt + R` | 시뮬레이션 리셋 |
| UI 버튼 **시연 트리거** | 동일 |

시나리오: 평상시 예찰 → 가스/전류 스파이크 → D_M > 3.0 → B2G 작전 모드 + 1초 레시피 팝업

## 아키텍처

```
client (React + TS + Tailwind)
  ├─ B2G 관제실 (GIS 마커 / 네온 펄스 / 1초 레시피)
  └─ B2B 안심 사업장 (게이지 / 차트 / 보험료 절감)

server (Express + TS)
  ├─ GET  /api/factories          3초 노이즈 스트리밍 상태
  ├─ POST /api/trigger-incident   시연용 스파이크
  ├─ POST /api/ai/check-anomaly   마할라노비스 직접 검증
  └─ POST /api/ai/recipe          RAG 가드레일 레시피

data/
  ├─ msds_rules.json         MSDS Hard Block DB
  └─ factory_baseline.json   μ / Σ 베이스라인
```

## 지도

카카오 기본 파란 핀은 사용하지 않습니다.  
**Carto Dark Matter** 다크 타일 + 상태별 커스텀 마커 + 독성가스 열지도로 관제실 GIS를 구성합니다.  
사고 시 해당 공장에 `⚠ 화재 진원 FIRE-IN` 라벨·네온 펄스·350m 대피 원이 표시되고 지도가 진원으로 이동합니다.

## 공공데이터 실연동

키 없이도 서버는 기동됩니다 (자동 mock/cache 폴백).  
실연동은 `SETUP_PUBLIC_DATA.md` 체크리스트를 따라 `server/.env`에 키를 넣으면 됩니다.

```bash
cd server && cp .env.example .env
# DATA_GO_KR_SERVICE_KEY=... 입력 후
npm run dev
curl -s http://localhost:4000/api/public-data/status | python3 -m json.tool
```

| API | 엔드포인트 |
|-----|------------|
| 상태 | `GET /api/public-data/status` |
| 기상청 | `GET /api/public-data/weather?factoryId=hanwha-daejeon` |
| 건축물대장 | `GET /api/public-data/building?factoryId=...` |
| PRTR | `GET /api/public-data/prtr` |

## 심사 대응 포인트

1. **마할라노비스**: `server/src/ai/mahalanobis.ts` + `factory_baseline.json`의 μ·Σ
2. **RAG 가드레일**: `msds_rules.json`의 forbidden/optimal_agent → 나트륨 시 용수·살수 Hard Block
3. **실시간성**: 서버 `setInterval` 3초 + 프론트 폴링 2초
4. **InsurTech BM**: B2B 뷰의 112일 인증 / 24만원 절감 패널
5. **공공 Open API**: 기상·건축물대장 실호출 + PRTR 캐시 폴백 (`SETUP_PUBLIC_DATA.md`)
