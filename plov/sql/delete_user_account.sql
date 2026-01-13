-- Function to completely delete a user account including auth user
-- This function must be called with SECURITY DEFINER to have admin privileges
-- to delete from auth.users table

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
begin
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  if current_user_id is null then
    raise exception 'User must be authenticated to delete account';
  end if;

  -- Delete the profile first (this will cascade delete all related data)
  -- The cascade deletion will handle:
  -- - posts (and their comments, votes, bookmarks, reports)
  -- - comments (and their votes)
  -- - votes
  -- - bookmarks
  -- - reports
  -- - notifications
  -- - chats
  -- - blocks
  -- - notification_settings
  delete from public.profiles
  where id = current_user_id;

  -- Delete the auth user (requires SECURITY DEFINER to access auth.users)
  delete from auth.users
  where id = current_user_id;

  -- If we reach here, deletion was successful
  -- The function returns void, so no need to return anything
end;
$$;

-- Grant execute permission to authenticated users (they can only delete their own account)
grant execute on function public.delete_user_account() to authenticated;

-- Add a comment explaining the function
comment on function public.delete_user_account() is 
  'Completely deletes a user account including profile and auth user. Can only be called by the authenticated user to delete their own account.';
