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

-- ---------- v5: 점심 투표 ----------
-- 누구나 후보 식당을 골라 투표(polls)를 만들고 링크로 공유, 가고 싶은 곳에 표(poll_votes)를 찍는다.
-- 한 기기가 여러 곳을 고를 수 있고(같은 곳은 한 번만), 본인 표만 취소할 수 있습니다.
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 40),
  candidates text[] not null check (cardinality(candidates) between 2 and 12),
  device_id text check (char_length(device_id) <= 64),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  restaurant_id text not null check (char_length(restaurant_id) <= 100),
  device_id text not null check (char_length(device_id) <= 64),
  created_at timestamptz not null default now(),
  unique (poll_id, device_id, restaurant_id)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "polls_select_all" on public.polls;
create policy "polls_select_all" on public.polls for select using (true);
drop policy if exists "polls_insert_all" on public.polls;
create policy "polls_insert_all" on public.polls for insert with check (true);

drop policy if exists "poll_votes_select_all" on public.poll_votes;
create policy "poll_votes_select_all" on public.poll_votes for select using (true);
-- 후보에 있는 식당에만 표를 찍을 수 있다
drop policy if exists "poll_votes_insert_candidate" on public.poll_votes;
create policy "poll_votes_insert_candidate" on public.poll_votes
  for insert with check (
    exists (select 1 from public.polls p where p.id = poll_id and restaurant_id = any (p.candidates))
  );

alter table public.polls replica identity full;
alter table public.poll_votes replica identity full;

-- 후보 추가 (링크를 받은 사람 누구나, 최대 12곳)
create or replace function public.add_poll_candidate(p_id uuid, p_restaurant text)
returns public.polls
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.polls;
begin
  if char_length(p_restaurant) between 1 and 100 then
    update public.polls
      set candidates = array_append(candidates, p_restaurant)
      where id = p_id and not (p_restaurant = any (candidates)) and cardinality(candidates) < 12;
  end if;
  select * into rec from public.polls where id = p_id;
  return rec;
end;
$$;

-- 본인 표 취소: 같은 기기에서 찍은 것만
create or replace function public.delete_own_poll_vote(p_id uuid, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.poll_votes where id = p_id and device_id = p_device;
$$;

grant execute on function public.add_poll_candidate(uuid, text) to anon, authenticated;
grant execute on function public.delete_own_poll_vote(uuid, text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;

-- ---------- v6: 많이 본 매장 ----------
-- 식당 상세를 연 횟수를 하루 단위로만 센다 (누가 봤는지는 남기지 않음). 홈 '추천'에서 최근 2주 많이 본 순으로 씀.
create table if not exists public.restaurant_views (
  restaurant_id text not null check (char_length(restaurant_id) <= 100),
  day date not null default ((now() at time zone 'Asia/Seoul')::date),
  views int not null default 0,
  primary key (restaurant_id, day)
);
create index if not exists restaurant_views_day_idx on public.restaurant_views (day);

alter table public.restaurant_views enable row level security;
drop policy if exists "restaurant_views_select_all" on public.restaurant_views;
create policy "restaurant_views_select_all" on public.restaurant_views for select using (true);

-- 1 더하기 (직접 쓰기는 막고 이 함수로만)
create or replace function public.bump_view(p_restaurant text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.restaurant_views (restaurant_id, day, views)
  select p_restaurant, (now() at time zone 'Asia/Seoul')::date, 1
  where char_length(p_restaurant) between 1 and 100
  on conflict (restaurant_id, day) do update set views = public.restaurant_views.views + 1;
$$;

grant execute on function public.bump_view(text) to anon, authenticated;

-- ---------- v7: 공유톡을 누구나 올리기 ----------
-- 앱 '제보·의견 > 공유톡 올리기'로 누구나 질문을 올린다 (댓글 열림). 한 기기에서 하루 3개까지, 본인 글은 본인이 지울 수 있다.
alter table public.talk_posts add column if not exists device_id text check (char_length(device_id) <= 64);

create or replace function public.talk_create(p_body text, p_device text)
returns public.talk_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.talk_posts;
begin
  if coalesce(char_length(p_device), 0) not between 1 and 64 then
    raise exception '기기 정보가 없어요';
  end if;
  if (select count(*) from public.talk_posts where device_id = p_device and created_at > now() - interval '1 day') >= 3 then
    raise exception '공유톡은 하루에 3개까지 올릴 수 있어요';
  end if;
  insert into public.talk_posts (body, allow_comments, device_id) values (p_body, true, p_device) returning * into rec;
  return rec;
end;
$$;

create or replace function public.delete_own_talk_post(p_id uuid, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.talk_posts where id = p_id and device_id = p_device;
$$;

grant execute on function public.talk_create(text, text) to anon, authenticated;
grant execute on function public.delete_own_talk_post(uuid, text) to anon, authenticated;

-- ---------- v8: 관리자 공유톡 글 고치기 ----------
create or replace function public.admin_talk_update(p_id uuid, p_body text, p_token text)
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
  update public.talk_posts set body = p_body where id = p_id returning * into rec;
  return rec;
end;
$$;

grant execute on function public.admin_talk_update(uuid, text, text) to anon, authenticated;
