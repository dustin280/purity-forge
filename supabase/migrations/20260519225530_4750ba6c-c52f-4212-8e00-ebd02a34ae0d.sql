
create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_name text,
  event text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index access_logs_created_at_idx on public.access_logs (created_at desc);
create index access_logs_user_id_idx on public.access_logs (user_id);

alter table public.access_logs enable row level security;

create policy "access_logs_select_admin" on public.access_logs
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "access_logs_insert_self" on public.access_logs
  for insert to authenticated
  with check (user_id = auth.uid());
