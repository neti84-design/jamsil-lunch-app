# 🍱 잠실점심

잠실역 직장인을 위한 점심 식당 찾기 앱.
구내식당 공사 기간 동안 **잠실역 도보 20분 · 인당 12,000원** 안에서 뭐 먹을지 빠르게 고르기.

## 기능

- **인당 예산** 필터 (8천 / 1만 / 1.2만 / 1.5만 / 2만원) — 예산 넘는 메뉴는 빨간색 표시
- **메뉴 분류**: 한식 · 일식 · 중식 · 양식 · 아시안 · 샐러드 · 분식 · 기타
- **컨셉 분류**: 헤비하게 · 해장 · 다이어트 · 샐러드 · 배부르게 · 가볍게 · 빨리
- **좌석**: 단체석 / 혼밥
- **도보 거리** (잠실역 기준 5/10/15/20분) + 지도에 반경 표시
- 식당 상세: 가격·메뉴, **웨이팅 정도**, **예약 방법**(전화/네이버/캐치테이블/테이블링/바로 방문), 좌석, 영업시간, **연락처(바로 전화)**, 리뷰 요약·평점, 네이버지도/카카오맵 바로가기
- 지도에서 좌표 확인 (네이버 플레이스처럼 핀 클릭 → 상세)
- 🎲 "오늘 뭐 먹지?" 랜덤 추천, ⭐ 찜, 검색, 정렬(거리/평점/가격)
- 모바일 대응 (목록/지도 탭)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 생성
```

GitHub Pages 배포: `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 이 자동 배포합니다.
(저장소 Settings → Pages → Source 를 **GitHub Actions** 로 한 번 설정 필요)

## 데이터

- `src/data/restaurants.ts` 에 식당 목록이 들어 있습니다. 타입은 `src/types.ts` 참고.
- 블로그·지도 후기 기반으로 수집한 초기 데이터라 **가격·영업시간·전화번호는 방문 전 확인**이 필요합니다.
  확인 안 된 값은 `null` 로 두었고, 각 항목의 `sources` 에 출처 URL이 있습니다.
- 좌표가 `approxLocation: true` 인 곳은 주소/랜드마크 기준 근사치입니다.
  카카오 REST API 키가 있으면 아래 스크립트로 정확한 좌표를 채울 수 있습니다.

```bash
KAKAO_REST_KEY=발급키 node scripts/geocode.mjs
```

### 식당 추가하기

`src/data/restaurants.ts` 배열에 아래 형태로 항목을 추가하면 됩니다.

```ts
{
  id: 'unique-id',
  name: '가게명', branch: null,
  cuisine: '한식', subcategory: '국밥',
  signature: ['순대국'],
  priceRange: [10000, 12000],
  menu: [{ name: '순대국', price: 10000 }],
  concepts: ['hangover', 'filling'],
  seating: { group: true, solo: true, notes: '바 좌석 있음' },
  address: '서울 송파구 ...', lat: 37.51, lng: 127.10, approxLocation: true,
  phone: '02-000-0000', hours: '11:00-21:00', breakTime: null, closedDays: '일',
  reservation: { method: 'walk-in', notes: null },
  waiting: { level: 'medium', peak: '12:00-13:00', notes: null },
  reviews: { naverRating: 4.4, naverReviewCount: 500, summary: '...', highlights: ['...'] },
  nearestExit: '잠실역 8번 출구',
  links: { naverPlace: null, kakaoMap: null },
  sources: ['https://...'],
}
```

## 기술 스택

Vite · React 19 · TypeScript · react-leaflet (OpenStreetMap 타일, API 키 불필요)

## 다음에 추가하면 좋을 것

- [ ] 네이버 지도 SDK 로 교체 (클라이언트 ID 필요) — 한국 지도 디테일이 더 좋음
- [ ] 실시간 웨이팅 연동 (캐치테이블/테이블링은 공개 API가 없어 링크 연결 수준)
- [ ] 팀원들이 직접 후기·웨이팅 제보하는 기능 (Google 시트 or Supabase)
- [ ] "오늘 날씨/요일" 기반 추천, 최근 간 곳 제외
- [ ] 점심 투표 / 공유 링크
