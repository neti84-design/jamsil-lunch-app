-- 잠심(잠실점심) 실시간 제보 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  kind text not null,
  wait_level text check (wait_level in ('low', 'medium', 'high')),
  wait_minutes int check (wait_minutes between 0 and 180),
  rating int check (rating between 1 and 5),
  comment text check (char_length(comment) <= 300),
  nickname text check (char_length(nickname) <= 20),
  created_at timestamptz not null default now()
);

-- v2 추가 컬럼: 앞에 몇 팀, 숨은맛집/역시맛집 태그, 작성 기기
alter table public.reports add column if not exists wait_teams int check (wait_teams between 0 and 99);
alter table public.reports add column if not exists tag text check (tag in ('hidden', 'classic'));
alter table public.reports add column if not exists device_id text check (char_length(device_id) <= 64);

-- kind 에 'tag' 허용 (기존 제약을 교체)
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('wait', 'review', 'tag'));

create index if not exists reports_restaurant_created_idx
  on public.reports (restaurant_id, created_at desc);

-- 누구나 읽기/쓰기 (익명 키 사용). 수정·삭제는 아래 함수로만.
alter table public.reports enable row level security;

drop policy if exists "reports_select_all" on public.reports;
create policy "reports_select_all" on public.reports
  for select using (true);

drop policy if exists "reports_insert_all" on public.reports;
create policy "reports_insert_all" on public.reports
  for insert with check (true);

-- 삭제 시 실시간 DELETE 이벤트에 id 가 실리도록
alter table public.reports replica identity full;

-- ---------- 관리자 설정 ----------
-- 관리자 비밀번호는 이 테이블에만 저장되고, 익명 키로는 읽을 수 없습니다(RLS, 정책 없음).
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;

-- ★ 아래 한 줄의 비밀번호를 원하는 값으로 바꿔서 실행하세요 (앱 하단 "관리자" 에서 입력)
insert into public.app_config (key, value) values ('admin_token', 'change-me')
  on conflict (key) do nothing;
-- 나중에 바꾸려면: update public.app_config set value = '새비밀번호' where key = 'admin_token';

-- 관리자 비밀번호 확인
create or replace function public.admin_check(p_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_config where key = 'admin_token' and value = p_token);
$$;

-- 관리자 삭제: 비밀번호가 맞으면 아무 글이나 삭제
create or replace function public.admin_delete_report(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_token) then
    return false;
  end if;
  delete from public.reports where id = p_id;
  return true;
end;
$$;

-- 본인 글 삭제: 같은 기기(device_id)에서 쓴 글만 삭제
create or replace function public.delete_own_report(p_id uuid, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.reports where id = p_id and device_id = p_device;
$$;

grant execute on function public.admin_check(text) to anon, authenticated;
grant execute on function public.admin_delete_report(uuid, text) to anon, authenticated;
grant execute on function public.delete_own_report(uuid, text) to anon, authenticated;

-- 실시간 구독 활성화 (이미 추가돼 있으면 오류가 나도 무시해도 됩니다)
do $$
begin
  alter publication supabase_realtime add table public.reports;
exception when duplicate_object then null;
end $$;
