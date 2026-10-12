-- 잠실점심 실시간 제보 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  kind text not null check (kind in ('wait', 'review')),
  wait_level text check (wait_level in ('low', 'medium', 'high')),
  wait_minutes int check (wait_minutes between 0 and 180),
  rating int check (rating between 1 and 5),
  comment text check (char_length(comment) <= 300),
  nickname text check (char_length(nickname) <= 20),
  created_at timestamptz not null default now()
);

create index if not exists reports_restaurant_created_idx
  on public.reports (restaurant_id, created_at desc);

-- 누구나 읽기/쓰기 (익명 키 사용). 수정·삭제는 불가.
alter table public.reports enable row level security;

drop policy if exists "reports_select_all" on public.reports;
create policy "reports_select_all" on public.reports
  for select using (true);

drop policy if exists "reports_insert_all" on public.reports;
create policy "reports_insert_all" on public.reports
  for insert with check (true);

-- 실시간 구독 활성화
alter publication supabase_realtime add table public.reports;
