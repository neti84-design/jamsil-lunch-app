# 🍱 오늘잠심 — 잠실점심

**구내식당 공사 이슈로 인한 식사 문제 해결을 위한 어플!** 잠실역 직장인을 위한 점심 식당 찾기 + 실시간 웨이팅·후기 공유 앱.

## 기능

- **인당 예산** 필터 (8천 / 1만 / 1.2만 / 1.5만 / 2만 / 3만원 / 전체) — 예산 넘는 메뉴는 빨간색 표시
- **종류**: 한식 · 일식 · 중식 · 양식 · 아시안 · 샐러드 · 분식 · 기타 (캐치테이블·테이블링의 1차 분류와 동일)
- **메뉴**: 국밥·탕 · 백반·정식 · 고기·구이 · 면·국수 · 돈까스 · 라멘·우동 · 초밥·회 · 중식·마라 · 피자·버거 · 파스타 · 샐러드·포케 · 분식·김밥 · 도시락 · 샤브·전골 · 쌀국수·태국 (데이터의 세부 분류·대표 메뉴에서 자동 추출)
- **방문 목적** (캐치테이블 "방문 목적" 태그 방식): 빠른 점심 · 든든한 한 끼 · 고기·육식 · 해장 · 가볍게 · 건강식 · 샐러드·포케
- **좌석·편의** (테이블링 "편의시설" 항목 방식): 혼밥 / **단체석(인원 선택 4~20명)** / **룸**
- **도보 거리** (잠실역 기준 5/10/15/20분/전체) + 지도에 반경 표시
- 식당 상세: 가격·메뉴, 평소 웨이팅, 예약 방법(전화/네이버/캐치테이블/테이블링/바로 방문), 좌석(단체 최대 인원·룸), 영업시간, 연락처(바로 전화), 리뷰 요약·평점, 네이버지도/카카오맵 바로가기
- 🔴 **실시간 웨이팅**: 식당 상세에서 한 줄로 "앞에 N팀 · 약 N분" 제보 → 목록 상단에 세로로 최근 5건, 카드에도 바로 반영 (3시간 유지)
- 🍽️ **숨은맛집 / 역시맛집 체크**: 먹어본 사람이 한 기기당 한 번 체크, 카드와 메인 목록에 실시간 집계
- 💬 **한 줄 후기**: 별점 + 한 줄, 닉네임 없음. 내가 쓴 글은 "내 후기"로 표시되고 내가 지울 수 있음
- 🛠️ **관리자 모드**: 화면 하단 "관리자" → 비밀번호 입력 → 모든 후기·제보·체크를 한 곳에서 보고 삭제
- 📊 **별점 많은 순** 기본 정렬: 팀 별점 합계 + 맛집 체크 수가 많은 곳이 위로, 새 후기가 들어오면 실시간으로 순서가 바뀜
- 🟢 영업 상태: 네이버 지도처럼 **영업 중 / 마감 1시간 전 / 브레이크타임 / 영업 전 / 영업 종료 / 오늘 휴무** 를 한국 시간 기준으로 계산해 카드·상세에 표시 (영업시간 문자열을 해석, 미확인 가게는 표시 안 함)
- 하단 메뉴: **홈 · 검색 · 지도 · 관심매장 · 추천매장**
  - 홈: 음식 카테고리 아이콘(국밥·탕, 돈까스 …), **건물별 모아보기**(5곳 이상 모인 장미상가·롯데월드몰), 최근 본 식당, 실시간 웨이팅, 지금 영업 중인 가까운 매장
  - 검색: 검색 버튼·키보드 "검색" 키, 최근 검색어(개별/전체 삭제), **별점순 · 가까운순 · 평점순 · 저렴한순** + **영업 중 · 혼밥** 빠른 필터, **세부조건**(건물·예산·종류·메뉴·방문 목적·좌석·도보) — 손가락으로 위로 끌면 따라 접히고, 목록을 내려도 접힘
  - 관심매장: ☆ 로 저장한 곳 (이 기기)
  - 추천매장: 다른 사람들의 관심 저장·숨은/역시맛집 체크·별점이 많은 곳 (관심 저장 공유는 `supabase/schema.sql` v3 적용 필요)
- 제목을 누르면 처음 화면으로
- ⭐ 찜, 검색, 정렬(별점 많은/평점 높은/가까운/저렴한 순), 모바일 대응 (목록/지도 탭)

### 목록에 보이는 식당 수 기준

필터를 모두 "전체"로 두면 수록된 **59곳이 전부** 보입니다. 필터 영역 아래 "기준: …" 줄에 현재 적용된 조건이 항상 표시됩니다.
(이전 버전은 기본값이 인당 1.2만원·도보 20분이라 45곳만 보였습니다.)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 생성
```

## 배포 (Vercel)

주소: **https://jamsim.vercel.app**

1. https://vercel.com 로그인 → **Add New… → Project** → GitHub 저장소 `jamsil-lunch-app` **Import**
2. **Project Name** 을 `jamsim` 으로 변경 (→ `jamsim.vercel.app`)
3. Framework Preset 은 **Vite** 로 자동 인식됩니다 (`vercel.json` 에 빌드 설정 포함)
4. **Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가 (아래 Supabase 절 참고)
5. **Deploy** → 이후 `main` 브랜치에 푸시할 때마다 자동 재배포됩니다

프로젝트 이름은 Settings → General → Project Name 에서 나중에도 바꿀 수 있습니다.

## 실시간 제보·후기 연결 (Supabase, 5분)

키를 넣기 전에는 제보가 **내 기기(localStorage)에만** 저장되고 화면에 "이 기기에만 저장" 배지가 뜹니다.
팀원과 공유하려면 무료 Supabase 프로젝트를 하나 만들어 연결하세요.

1. https://supabase.com 가입 → **New project** (리전 Northeast Asia(Seoul) 권장)
2. 좌측 **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
3. **Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
4. 로컬 실행: 프로젝트 루트에 `.env` 파일 생성 (`.env.example` 참고)
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Vercel 배포: 프로젝트 **Settings → Environment Variables** 에
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 두 개를 추가 → **Redeploy** 하면 반영

동작 방식: `reports` 테이블 하나에 웨이팅 제보·후기·맛집 체크가 쌓이고, Supabase Realtime 으로 다른 사람의 제보가 새로고침 없이 바로 뜹니다.
익명 키로 누구나 읽기/쓰기가 가능하고, 삭제는 **본인 글(같은 기기)** 또는 **관리자 비밀번호**로만 가능합니다(RLS + 함수). 링크를 아는 사람만 쓰는 사내용 전제입니다.

### 관리자 비밀번호

`supabase/schema.sql` 안의 `insert into public.app_config ... 'change-me'` 줄의 값을 원하는 비밀번호로 바꿔 실행하세요.
이미 실행했다면 SQL Editor 에서 아래처럼 바꿀 수 있습니다.

```sql
update public.app_config set value = '새비밀번호' where key = 'admin_token';
```

앱 하단 "관리자" → 비밀번호 입력 → 모든 후기를 보고 지울 수 있습니다. 비밀번호는 이 기기에 저장되어 다음에도 유지됩니다.
Supabase 미연결(로컬 저장) 상태에서는 `.env` 의 `VITE_ADMIN_KEY`(기본값 `admin`)를 씁니다.

### 이미 v1 스키마를 실행했다면

`supabase/schema.sql` 을 그대로 다시 실행하면 됩니다. 새 컬럼(`wait_teams`, `tag`, `device_id`)과 함수가 추가되고 기존 데이터는 유지됩니다.

## 데이터

현재 **59곳** 수록 (한식 25 · 일식 13 · 중식 7 · 분식 4 · 샐러드 4 · 아시안 3 · 양식 3). 기본 필터(전체)에서 59곳이 모두 보입니다.

단체석 최대 인원(`seating.groupSize`)과 룸 유무(`seating.room`)는 후기·매장 유형 기반 **추정값**이라 `estimated: true` 로 표시됩니다.
확인된 곳은 값을 고치고 `estimated` 를 지우면 "(추정)" 표시가 사라집니다.

- `src/data/restaurants.ts` 에 식당 목록이 들어 있습니다. 타입은 `src/types.ts` 참고.
- 검색 결과(다이닝코드·식신·테이블링·폴레·블로그 요약) 기반으로 수집한 초기 데이터라 **가격·영업시간·전화번호는 방문 전 확인**이 필요합니다.
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
  seating: { group: true, solo: true, groupSize: 8, room: false, estimated: true, notes: '바 좌석 있음' },
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
- [x] 팀원들이 직접 후기·웨이팅 제보하는 기능 (Supabase)
- [x] 제보 삭제(본인/관리자), 닉네임 대신 기기 식별
- [ ] "오늘 날씨/요일" 기반 추천, 최근 간 곳 제외
- [ ] 점심 투표 / 공유 링크
