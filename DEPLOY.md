# 배포 가이드 · Render(API) + Netlify(프론트)

## 1) Render에 올릴 env (서버)

| Key | 필수 | 값 예시 | 설명 |
|-----|------|---------|------|
| `FRONTEND_ORIGIN` | ✅ | `https://your-app.netlify.app` | Netlify 주소. CORS 허용 |
| `DATA_GO_KR_SERVICE_KEY` | 권장 | 공공데이터포털 Encoding 키 | 기상·건축 live |
| `PRTR_ACCESS_KEY` | 선택 | PRTR accessKey | 없으면 cache |
| `PORT` | ❌ | (비움) | Render가 자동 설정 |
| `NODE_VERSION` | 권장 | `22` | |

### Render 생성 설정
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`

배포 후 URL 예: `https://safetwin-api-xxxx.onrender.com`  
확인: `https://.../health`

> Free 플랜은 잠든 뒤 첫 요청이 30~60초 걸릴 수 있음.

---

## 2) Netlify에 올릴 env (프론트)

| Key | 필수 | 값 예시 | 설명 |
|-----|------|---------|------|
| `VITE_API_BASE` | ✅ | `https://safetwin-api-xxxx.onrender.com` | Render URL (`/api` 붙이지 말 것) |
| `VITE_KAKAO_MAP_KEY` | 선택 | 카카오 JS 키 | 없으면 Leaflet |

### Netlify 빌드 설정
- **Base directory**: `client`
- **Build command**: `npm run build`
- **Publish directory**: `dist`  
  (Base가 `client`이면 보통 `dist`만)

env는 **빌드 시점**에 들어가므로, `VITE_API_BASE` 바꾼 뒤 **Redeploy** 필요.

---

## 3) 순서 체크리스트

1. GitHub에 코드 푸시  
2. **Render** 서비스 생성 → env 입력 → Deploy  
3. `/health` 확인  
4. **Netlify** 사이트 생성 → `VITE_API_BASE`에 Render URL  
5. Render `FRONTEND_ORIGIN`에 Netlify URL 넣고 재배포  
6. 브라우저에서 시연 트리거 확인  

---

## 4) 로컬

**server/.env**
```env
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
DATA_GO_KR_SERVICE_KEY=당신키
```

**client/.env**
```env
VITE_API_BASE=
```
(비우면 Vite proxy가 `/api` → `localhost:4000`)
