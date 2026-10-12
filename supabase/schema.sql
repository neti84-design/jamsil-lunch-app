-- 오늘잠심(잠실점심) 실시간 제보 테이블
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

-- v3: 관심 저장('fav')도 태그로 공유 → 추천매장 집계

-- v4: '배달 돼요' 체크도 태그로 (기존 제약을 교체)
alter table public.reports drop constraint if exists reports_tag_check;
alter table public.reports add constraint reports_tag_check check (tag in ('hidden', 'classic', 'fav', 'delivery'));

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

-- ---------- v4: 공유톡 ----------
-- 관리자가 올리는 한 줄 질문·공지(talk_posts)와 사람들이 다는 한 줄 답(talk_comments).
-- 글은 관리자 함수로만 올리고/닫고/지울 수 있고, 답은 댓글이 열린 글에만 누구나 달 수 있습니다.
create table if not exists public.talk_posts (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 100),
  allow_comments boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.talk_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.talk_posts (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 60),
  device_id text check (char_length(device_id) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists talk_comments_post_created_idx on public.talk_comments (post_id, created_at desc);

alter table public.talk_posts enable row level security;
alter table public.talk_comments enable row level security;

drop policy if exists "talk_posts_select_all" on public.talk_posts;
create policy "talk_posts_select_all" on public.talk_posts for select using (true);

drop policy if exists "talk_comments_select_all" on public.talk_comments;
create policy "talk_comments_select_all" on public.talk_comments for select using (true);

-- 댓글이 열린 글에만 답을 달 수 있다
drop policy if exists "talk_comments_insert_open" on public.talk_comments;
create policy "talk_comments_insert_open" on public.talk_comments
  for insert with check (
    exists (select 1 from public.talk_posts p where p.id = post_id and p.allow_comments)
  );

alter table public.talk_posts replica identity full;
alter table public.talk_comments replica identity full;

-- 관리자: 글 올리기 (비밀번호가 틀리면 null)
create or replace function public.admin_talk_create(p_body text, p_allow boolean, p_token text)
returns public.talk_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.talk_posts;
begin
  if not public.admin_check(p_token) then
    return null;
  end if;
  insert into public.talk_posts (body, allow_comments) values (p_body, p_allow) returning * into rec;
  return rec;
end;
$$;

-- 관리자: 댓글 열기/닫기
create or replace function public.admin_talk_set_comments(p_id uuid, p_allow boolean, p_token text)
returns public.talk_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.talk_posts;
begin
  if not public.admin_check(p_token) then
    return null;
  end if;
  update public.talk_posts set allow_comments = p_allow where id = p_id returning * into rec;
  return rec;
end;
$$;

-- 관리자: 글 삭제 (댓글도 함께)
create or replace function public.admin_talk_delete_post(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_token) then
    return false;
  end if;
  delete from public.talk_posts where id = p_id;
  return true;
end;
$$;

-- 관리자: 댓글 삭제
create or replace function public.admin_talk_delete_comment(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_token) then
    return false;
  end if;
  delete from public.talk_comments where id = p_id;
  return true;
end;
$$;

-- 본인 댓글 삭제: 같은 기기에서 쓴 것만
create or replace function public.delete_own_talk_comment(p_id uuid, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.talk_comments where id = p_id and device_id = p_device;
$$;

grant execute on function public.admin_talk_create(text, boolean, text) to anon, authenticated;
grant execute on function public.admin_talk_set_comments(uuid, boolean, text) to anon, authenticated;
grant execute on function public.admin_talk_delete_post(uuid, text) to anon, authenticated;
grant execute on function public.admin_talk_delete_comment(uuid, text) to anon, authenticated;
grant execute on function public.delete_own_talk_comment(uuid, text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.talk_posts;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.talk_comments;
exception when duplicate_object then null;
end $$;
