# Daejeon Safe-Twin · 공공데이터 연동 설정 가이드
# 작성일 기준: 2026 대전 공공데이터·AI 활용 창업경진대회

이 문서는 **본인이 직접 해야 하는 일**만 순서대로 정리한 체크리스트입니다.  
코드 연동(기상청·건축물대장·PRTR 폴백)은 이미 서버에 들어가 있습니다.

---

## 한눈에 보기

| 할 일 | 필수? | 예상 시간 | 결과 |
|-------|-------|-----------|------|
| 1. 공공데이터포털 가입 + 인증키 | ✅ 필수 | 10~20분 | `DATA_GO_KR_SERVICE_KEY` |
| 2. 기상청 API 활용신청 | ✅ 필수 | 5분 (자동승인) | 기상 live |
| 3. 건축물대장 API 활용신청 | ✅ 필수 | 5분 (자동승인 가능) | 건축 live |
| 4. `server/.env`에 키 저장 | ✅ 필수 | 2분 | 서버가 live 호출 |
| 5. 서버 재시작 후 상태 확인 | ✅ 필수 | 2분 | `/api/public-data/status` |
| 6. (선택) PRTR 인증키 신청 | ⭕ 선택 | 1~수일 | 위험물 통계 live |
| 7. (선택) 건축물 번지 코드 보정 | ⭕ 선택 | 10~30분 | 표제부 매칭률↑ |

---

## 1단계. 공공데이터포털 가입

1. 브라우저에서 https://www.data.go.kr 접속
2. **회원가입 / 로그인** (네이버·카카오·공동인증서 등)
3. 로그인 후 우측 상단 **마이페이지** 진입

---

## 2단계. 인증키(Service Key) 발급

1. 마이페이지 → **오픈API** → **인증키 발급현황**
2. 아직 키가 없으면 **일반 인증키 발급** (또는 개발계정 발급)
3. 발급된 키를 복사  
   - **Encoding** 키를 쓰는 것을 권장합니다.  
   - Decoding 키를 쓰면 URL에서 특수문자 문제가 날 수 있습니다.

> 이 키가 기상청·건축물대장 공통으로 쓰입니다. (`DATA_GO_KR_SERVICE_KEY`)

---

## 3단계. API 활용신청 (2개)

### 3-A. 기상청 단기예보 조회서비스

1. 검색: `기상청_단기예보 조회서비스`  
   직접 링크: https://www.data.go.kr/data/15084084/openapi.do
2. **활용신청** 클릭
3. 활용목적 예:  
   `대전 산단 지능형 방재 플랫폼(Safe-Twin) MVP — 풍향·풍속·기온을 GIS 확산 시뮬레이션에 활용`
4. 심의: **자동승인**인 경우가 많음 (수 분~즉시)

### 3-B. 국토교통부 건축HUB 건축물대장정보

1. 검색: `건축HUB_건축물대장정보`  
   직접 링크: https://www.data.go.kr/data/15134735/openapi.do
2. **활용신청**
3. 활용목적 예:  
   `산단 공장 건축 구조·용도·준공일을 조회하여 붕괴 위험 스코어 입력 피처로 활용`
4. 승인 확인 (자동승인인 경우 즉시)

> 신청이 안 되어 있으면 키는 있어도 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 납니다.

---

## 4단계. 프로젝트에 키 넣기

터미널에서:

```bash
cd /home/sumin/SafeTwin/server
cp .env.example .env
nano .env   # 또는 Cursor에서 server/.env 열기
```

아래처럼 붙여넣기:

```env
PORT=4000
DATA_GO_KR_SERVICE_KEY=여기에_발급받은_Encoding키
PRTR_ACCESS_KEY=
```

저장 후 서버 재시작:

```bash
# 기존 서버가 떠 있으면 종료 후
cd /home/sumin/SafeTwin/server
npm run dev
```

시작 로그에 다음이 보이면 성공:

```
[Safe-Twin] data.go.kr key: SET
```

`MISSING`이면 `.env` 경로/키 이름/`npm run dev` 실행 위치를 다시 확인하세요.

---

## 5단계. 연동 확인 (본인이 확인할 명령)

### A. 헬스체크

```bash
curl -s http://localhost:4000/health | python3 -m json.tool
```

`publicData.dataGoKrKeyConfigured: true` 이어야 합니다.

### B. 공공데이터 상태

```bash
curl -s http://localhost:4000/api/public-data/status | python3 -m json.tool
```

| 필드 | 성공 시 | 키 없을 때 |
|------|---------|------------|
| `weather.mode` | `kma-live` | `mock-fallback` |
| `building.mode` | `building-hub-live` | `mock-fallback` |
| `prtr.mode` | `prtr-live` 또는 `cache-fallback` | `cache-fallback` |

### C. 기상 단건

```bash
curl -s "http://localhost:4000/api/public-data/weather?factoryId=hanwha-daejeon" | python3 -m json.tool
```

`source: "kma-live"` 이고 `temperatureC` 등이 숫자가 나오면 실연동 성공입니다.

### D. 건축물대장 단건

```bash
curl -s "http://localhost:4000/api/public-data/building?factoryId=hanwha-daejeon" | python3 -m json.tool
```

- `building-hub-live` → 표제부 매칭 성공  
- `mock-fallback` + “응답 없음” → **번지 코드(bun/ji/bjdongCd) 보정** 필요 (아래 7단계)

대시보드(B2G) 상단/카드에도 **공공데이터 LIVE/MOCK** 배지가 표시됩니다.

---

## 6단계. (선택) PRTR 화학물질 배출·이동량

PRTR은 공공데이터포털 키와 **별도**입니다.

1. https://icis.me.go.kr/prtr/infoYard/openApi.do 접속  
   (또는 https://icis.mcee.go.kr/prtr/infoYard/openApi.do )
2. **OPENAPI 신청 → 승인 → accessKey 발급** (승인에 시일 소요 가능)
3. `server/.env`에:

```env
PRTR_ACCESS_KEY=발급받은_accessKey
```

4. 서버 재시작 후:

```bash
curl -s http://localhost:4000/api/public-data/prtr | python3 -m json.tool
```

승인 전에는 `server/data/cache/prtr_daejeon_sample.json`이 자동 사용됩니다.  
심사 답변: “PRTR은 기관 승인 대기 중이며, 승인 전엔 공개 통계 스키마와 동일한 로컬 캐시로 파이프라인을 검증했다.”

---

## 7단계. (선택) 건축물 번지 코드 정확히 맞추기

건축물대장은 **시군구코드 + 법정동코드 + 본번/부번**이 맞아야 live 데이터가 옵니다.

1. https://www.juso.go.kr (도로명주소) 또는 건축HUB에서 해당 공장 주소 검색
2. 지번·법정동코드 확인
3. `server/data/factory_baseline.json`의 각 공장 `buildingLookup` 수정:

```json
"buildingLookup": {
  "sigunguCd": "30200",
  "bjdongCd": "11500",
  "bun": "0099",
  "ji": "0000"
}
```

| 필드 | 의미 | 예 |
|------|------|----|
| `sigunguCd` | 시군구 5자리 | 유성구 `30200`, 대덕구 `30230` |
| `bjdongCd` | 법정동 5자리 | 외삼동 등 |
| `bun` | 본번 4자리 zero-pad | `0099` |
| `ji` | 부번 4자리 | 없으면 `0000` |

수정 후 서버 재시작 → `/api/public-data/building` 재호출.

---

## 절대 하지 말아야 할 것

- `.env`를 GitHub에 커밋하지 말 것 (이미 `.gitignore`에 `/.env` 권장)
- 인증키를 PPT/제안서 본문에 그대로 붙이지 말 것 (심사 후 유출)
- “데이터 안심구역 실시간 가동 로그”를 지금 외부에서 붙이려 하지 말 것 → **기관 협약 전제**, 현재는 시뮬레이터가 정상

---

## 심사 때 말할 한 줄 스크립트

> “공개 Open API인 기상청 초단기실황과 국토부 건축물대장은 `data.go.kr` 인증키로 실호출하고, PRTR은 화학물질안전원 별도 승인 체계라 승인 전엔 동일 스키마 캐시로 파이프라인을 검증합니다. 실시간 공장 센서와 소방 내부망은 안심구역·행정망 협약 대상이라 MVP에서는 통계적 스크리닝 시뮬레이터로 대체했습니다.”

---

## 문제 해결

| 증상 | 조치 |
|------|------|
| `data.go.kr key: MISSING` | `server/.env` 존재 여부, 변수명 `DATA_GO_KR_SERVICE_KEY`, 서버 재시작 |
| 기상 `SERVICE_KEY_IS_NOT_REGISTERED` | 해당 API **활용신청** 누락 |
| 기상 HTTP 500 / 빈 items | 초단기실황 시각(매시 40분) — 잠시 후 재시도 |
| 건축물 `응답 없음` | `buildingLookup` 번지 코드 보정 |
| CORS / 프론트에서 안 보임 | API는 `localhost:4000`, Vite 프록시 `/api` 확인 |
| PRTR 계속 cache | 정상(미승인). `PRTR_ACCESS_KEY` 넣기 전엔 cache가 맞음 |
