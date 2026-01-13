-- Create notification_settings table to store Expo push token and per-user preferences
create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push_token text,
  notify_chats boolean not null default true,
  notify_trending boolean not null default true,
  notify_upvotes boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.notification_settings enable row level security;

-- Allow users to select / update only their own settings
create policy "Users can manage their own notification settings"
  on public.notification_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: keep updated_at in sync
create or replace function public.set_notification_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_notification_settings_updated_at on public.notification_settings;

create trigger set_notification_settings_updated_at
before update on public.notification_settings
for each row
execute procedure public.set_notification_settings_updated_at();

