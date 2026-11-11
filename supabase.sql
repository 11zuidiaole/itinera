-- itinera：在 Supabase 的 SQL Editor 里整段运行一次（和 deadline 清单用同一个项目）

create table if not exists public.itinera_boards (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.itinera_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.itinera_boards enable row level security;
alter table public.itinera_history enable row level security;

grant select, insert, update on public.itinera_boards to authenticated;
grant select, insert on public.itinera_history to authenticated;

drop policy if exists "own itinera select" on public.itinera_boards;
drop policy if exists "own itinera insert" on public.itinera_boards;
drop policy if exists "own itinera update" on public.itinera_boards;
drop policy if exists "own itinera history select" on public.itinera_history;
drop policy if exists "own itinera history insert" on public.itinera_history;

create policy "own itinera select" on public.itinera_boards for select to authenticated using (auth.uid() = user_id);
create policy "own itinera insert" on public.itinera_boards for insert to authenticated with check (auth.uid() = user_id);
create policy "own itinera update" on public.itinera_boards for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own itinera history select" on public.itinera_history for select to authenticated using (auth.uid() = user_id);
create policy "own itinera history insert" on public.itinera_history for insert to authenticated with check (auth.uid() = user_id);

-- 自动存历史版本：每 10 分钟最多存一份改动前的内容，每人保留最近 200 份
create or replace function public.snapshot_itinera() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from itinera_history
    where user_id = old.user_id and created_at > now() - interval '10 minutes'
  ) then
    insert into itinera_history (user_id, data) values (old.user_id, old.data);
    delete from itinera_history
    where user_id = old.user_id
      and id not in (select id from itinera_history where user_id = old.user_id order by id desc limit 200);
  end if;
  return new;
end $$;

drop trigger if exists itinera_snapshot on public.itinera_boards;
create trigger itinera_snapshot before update on public.itinera_boards
for each row execute function public.snapshot_itinera();
