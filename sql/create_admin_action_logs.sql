-- Create admin_action_logs table to track all admin moderation actions.
-- Run this in the Supabase SQL Editor.

create table if not exists public.admin_action_logs (
  id              uuid        primary key default gen_random_uuid(),
  admin_id        uuid        not null references public.profiles(id) on delete set null,
  action          text        not null, -- 'ban' | 'unban' | 'delete_post'
  target_user_id  uuid        references public.profiles(id) on delete set null,
  target_post_id  uuid,       -- no FK: post may already be deleted when queried
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists admin_action_logs_admin_id_idx    on public.admin_action_logs (admin_id);
create index if not exists admin_action_logs_created_at_idx  on public.admin_action_logs (created_at desc);
create index if not exists admin_action_logs_action_idx      on public.admin_action_logs (action);

-- Row Level Security
alter table public.admin_action_logs enable row level security;

-- Only admins can read logs (service role bypasses RLS for inserts from edge functions)
create policy "Admins can read action logs"
  on public.admin_action_logs
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
