1) 
select
  user_id,
  push_token,
  notify_chats,
  notify_upvotes
from public.notification_settings
where user_id = '6c920b53-4e54-41b7-80da-dec18750db5f';

[
  {
    "user_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "push_token": null,
    "notify_chats": true,
    "notify_upvotes": true
  }
]

select count(*) as settings_rows
from public.notification_settings
where user_id = '6c920b53-4e54-41b7-80da-dec18750db5f';

[
  {
    "settings_rows": 1
  }
]

2) 
-- TODO: replace <USER_ID>
select
  type,
  count(*) as pending_count
from public.notifications
where user_id = '6c920b53-4e54-41b7-80da-dec18750db5f'
  and is_read = false
  and push_sent = false
group by type
order by pending_count desc;

[
  {
    "type": "upvote",
    "pending_count": 9
  },
  {
    "type": "chat_message",
    "pending_count": 4
  }
]

-- TODO: replace <USER_ID>
select
  id,
  type,
  message,
  is_read,
  push_sent,
  created_at,
  related_user_id,
  related_post_id,
  related_comment_id
from public.notifications
where user_id = '6c920b53-4e54-41b7-80da-dec18750db5f'
order by created_at desc
limit 50;

[
  {
    "id": "3318acaa-4474-4771-8224-3abceeea65c2",
    "type": "chat_message",
    "message": "WhatsApp",
    "is_read": false,
    "push_sent": false,
    "created_at": "2026-03-20 16:40:51.908253+00",
    "related_user_id": "f2354968-618b-46a1-aaf5-d2c4373ee9e8",
    "related_post_id": null,
    "related_comment_id": null
  },
  {
    "id": "9f6a68f3-8d03-400f-a326-8d010b84b555",
    "type": "chat_message",
    "message": "Hi",
    "is_read": false,
    "push_sent": true,
    "created_at": "2026-03-20 14:28:59.651477+00",
    "related_user_id": "f2354968-618b-46a1-aaf5-d2c4373ee9e8",
    "related_post_id": null,
    "related_comment_id": null
  },
  {
    "id": "077c8700-7319-45e8-8aa1-04d15329a327",
    "type": "upvote",
    "message": "Your post received 5 upvotes!",
    "is_read": false,
    "push_sent": false,
    "created_at": "2026-03-19 09:55:34.715697+00",
    "related_user_id": "26473746-a46e-4b38-a1e5-ae641c38f7a6",
    "related_post_id": "63d8fe90-d9f4-4bff-802c-f1974b52eece",
    "related_comment_id": null
  },
  ... continues
]

3) 
-- TODO: replace <USER_ID>
select
  participant_1_id,
  participant_2_id,
  unread_count_p1,
  unread_count_p2
from public.user_chats_summary
where participant_1_id = '6c920b53-4e54-41b7-80da-dec18750db5f'
   or participant_2_id = '6c920b53-4e54-41b7-80da-dec18750db5f'
order by last_message_at desc
limit 50;

[
  {
    "participant_1_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "participant_2_id": "f2354968-618b-46a1-aaf5-d2c4373ee9e8",
    "unread_count_p1": 1,
    "unread_count_p2": 0
  },
  {
    "participant_1_id": "aec6f2d8-227b-4690-96dc-08cf772367e2",
    "participant_2_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "unread_count_p1": 0,
    "unread_count_p2": 0
  },
  {
    "participant_1_id": "73078e72-1583-459a-b7c7-f8a53d76fd8f",
    "participant_2_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "unread_count_p1": 0,
    "unread_count_p2": 0
  },
  {
    "participant_1_id": "d08968b8-7674-4f6f-ba5b-2b7dea4d0134",
    "participant_2_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "unread_count_p1": 1,
    "unread_count_p2": 0
  },
  {
    "participant_1_id": "00e5835f-2ac7-4f15-bf57-a792a7dd67a0",
    "participant_2_id": "6c920b53-4e54-41b7-80da-dec18750db5f",
    "unread_count_p1": 0,
    "unread_count_p2": 0
  }
]

select
  coalesce(sum(
    case
      when participant_1_id = '6c920b53-4e54-41b7-80da-dec18750db5f' then coalesce(unread_count_p1, 0)
      else coalesce(unread_count_p2, 0)
    end
  ),0) as total_unread
from public.user_chats_summary
where participant_1_id = '6c920b53-4e54-41b7-80da-dec18750db5f'
   or participant_2_id = '6c920b53-4e54-41b7-80da-dec18750db5f';

[
  {
    "total_unread": "1"
  }
]

4)

4a) 

-- See triggers on likely sources of notifications
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('votes', 'chat_messages', 'posts', 'comments', 'notifications')
order by schema_name, table_name, trigger_name;

[
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_a_43402",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_43402\" AFTER DELETE ON public.chat_messages FROM chat_messages NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_a_43403",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_43403\" AFTER UPDATE ON public.chat_messages FROM chat_messages NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_43404",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_43404\" AFTER INSERT ON public.chat_messages FROM chat_messages NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_43405",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_43405\" AFTER UPDATE ON public.chat_messages FROM chat_messages NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_49203",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49203\" AFTER INSERT ON public.chat_messages FROM chats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_49204",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49204\" AFTER UPDATE ON public.chat_messages FROM chats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_51702",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51702\" AFTER INSERT ON public.chat_messages FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "RI_ConstraintTrigger_c_51703",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51703\" AFTER UPDATE ON public.chat_messages FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "trigger_name": "trigger_notify_chat_message",
    "trigger_def": "CREATE TRIGGER trigger_notify_chat_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION notify_chat_message()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49136",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49136\" AFTER DELETE ON public.comments FROM votes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49137",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49137\" AFTER UPDATE ON public.comments FROM votes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49146",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49146\" AFTER DELETE ON public.comments FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49147",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49147\" AFTER UPDATE ON public.comments FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49161",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49161\" AFTER DELETE ON public.comments FROM notifications NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49162",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49162\" AFTER UPDATE ON public.comments FROM notifications NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49191",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49191\" AFTER DELETE ON public.comments FROM reports NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_a_49192",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49192\" AFTER UPDATE ON public.comments FROM reports NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_49143",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49143\" AFTER INSERT ON public.comments FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_49144",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49144\" AFTER UPDATE ON public.comments FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_49148",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49148\" AFTER INSERT ON public.comments FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_49149",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49149\" AFTER UPDATE ON public.comments FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_51652",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51652\" AFTER INSERT ON public.comments FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "RI_ConstraintTrigger_c_51653",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51653\" AFTER UPDATE ON public.comments FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "trg_update_comment_count",
    "trigger_def": "CREATE TRIGGER trg_update_comment_count AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON public.comments FOR EACH ROW EXECUTE FUNCTION fn_update_comment_count()"
  },
  {
    "schema_name": "public",
    "table_name": "comments",
    "trigger_name": "trigger_update_post_on_comment",
    "trigger_def": "CREATE TRIGGER trigger_update_post_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION update_post_engagement_timestamp()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_49158",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49158\" AFTER INSERT ON public.notifications FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_49159",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49159\" AFTER UPDATE ON public.notifications FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_49163",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49163\" AFTER INSERT ON public.notifications FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_49164",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49164\" AFTER UPDATE ON public.notifications FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_51682",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51682\" AFTER INSERT ON public.notifications FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_51683",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51683\" AFTER UPDATE ON public.notifications FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_51687",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51687\" AFTER INSERT ON public.notifications FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "RI_ConstraintTrigger_c_51688",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51688\" AFTER UPDATE ON public.notifications FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "notifications-insert",
    "trigger_def": "CREATE TRIGGER \"notifications-insert\" AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://rtynfdpezsrolwsglgoe.supabase.co/functions/v1/send-push-notification', 'POST', '{\"Content-type\":\"application/json\",\"Authorization\":\"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eW5mZHBlenNyb2x3c2dsZ29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY0NTQ0OCwiZXhwIjoyMDgwMjIxNDQ4fQ.9JTGfdqevdyPHl-vQJBJcT_p-u6YAms46owrcWXwQaQ\"}', '{}', '5000')"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49131",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49131\" AFTER DELETE ON public.posts FROM votes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49132",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49132\" AFTER UPDATE ON public.posts FROM votes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49141",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49141\" AFTER DELETE ON public.posts FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49142",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49142\" AFTER UPDATE ON public.posts FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49151",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49151\" AFTER DELETE ON public.posts FROM bookmarks NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49152",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49152\" AFTER UPDATE ON public.posts FROM bookmarks NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49156",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49156\" AFTER DELETE ON public.posts FROM notifications NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49157",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49157\" AFTER UPDATE ON public.posts FROM notifications NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49166",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49166\" AFTER DELETE ON public.posts FROM polls NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49167",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49167\" AFTER UPDATE ON public.posts FROM polls NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49186",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49186\" AFTER DELETE ON public.posts FROM reports NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49187",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49187\" AFTER UPDATE ON public.posts FROM reports NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49196",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49196\" AFTER DELETE ON public.posts FROM chats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49197",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49197\" AFTER UPDATE ON public.posts FROM chats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49206",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49206\" AFTER DELETE ON public.posts FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_setnull_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49207",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49207\" AFTER UPDATE ON public.posts FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49250",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49250\" AFTER DELETE ON public.posts FROM post_stats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_cascade_del\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_a_49251",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_a_49251\" AFTER UPDATE ON public.posts FROM post_stats NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_noaction_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_c_49208",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49208\" AFTER INSERT ON public.posts FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_c_49209",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49209\" AFTER UPDATE ON public.posts FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_c_51647",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51647\" AFTER INSERT ON public.posts FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "RI_ConstraintTrigger_c_51648",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51648\" AFTER UPDATE ON public.posts FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "trg_init_post_stats",
    "trigger_def": "CREATE TRIGGER trg_init_post_stats AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION fn_init_post_stats()"
  },
  {
    "schema_name": "public",
    "table_name": "posts",
    "trigger_name": "trg_update_repost_count",
    "trigger_def": "CREATE TRIGGER trg_update_repost_count AFTER INSERT OR DELETE OR UPDATE OF reposted_from_post_id ON public.posts FOR EACH ROW EXECUTE FUNCTION fn_update_repost_count()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_49133",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49133\" AFTER INSERT ON public.votes FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_49134",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49134\" AFTER UPDATE ON public.votes FROM posts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_49138",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49138\" AFTER INSERT ON public.votes FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_49139",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_49139\" AFTER UPDATE ON public.votes FROM comments NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_51657",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51657\" AFTER INSERT ON public.votes FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_ins\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "RI_ConstraintTrigger_c_51658",
    "trigger_def": "CREATE CONSTRAINT TRIGGER \"RI_ConstraintTrigger_c_51658\" AFTER UPDATE ON public.votes FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION \"RI_FKey_check_upd\"()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "trg_update_vote_score",
    "trigger_def": "CREATE TRIGGER trg_update_vote_score AFTER INSERT OR DELETE OR UPDATE OF vote_type ON public.votes FOR EACH ROW EXECUTE FUNCTION fn_update_vote_score()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "trigger_notify_upvote_milestone",
    "trigger_def": "CREATE TRIGGER trigger_notify_upvote_milestone AFTER INSERT ON public.votes FOR EACH ROW WHEN ((new.post_id IS NOT NULL)) EXECUTE FUNCTION notify_upvote_milestone()"
  },
  {
    "schema_name": "public",
    "table_name": "votes",
    "trigger_name": "trigger_update_post_on_vote",
    "trigger_def": "CREATE TRIGGER trigger_update_post_on_vote AFTER INSERT OR UPDATE ON public.votes FOR EACH ROW WHEN ((new.post_id IS NOT NULL)) EXECUTE FUNCTION update_post_engagement_timestamp()"
  }
]

4b) 
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid as function_oid,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where pg_get_functiondef(p.oid) ilike '%insert into public.notifications%'
   or pg_get_functiondef(p.oid) ilike '%insert into notifications%'
order by schema_name, function_name;

Error: Failed to run sql query: ERROR: 42809: "array_agg" is an aggregate function

Note: A limit of 100 was applied to your query. If this was the cause of a syntax error, try selecting "No limit" instead and re-run the query.


5) 

-- This is a broad text search; it should surface any milestone logic.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (
  pg_get_functiondef(p.oid) ilike '%upvote%' or
  pg_get_functiondef(p.oid) ilike '%vote%' or
  pg_get_functiondef(p.oid) ilike '%notifications%'
)
and (
  pg_get_functiondef(p.oid) ilike '%5%' or
  pg_get_functiondef(p.oid) ilike '%10%' or
  pg_get_functiondef(p.oid) ilike '%20%' or
  pg_get_functiondef(p.oid) ilike '%50%' or
  pg_get_functiondef(p.oid) ilike '%100%'
)
order by schema_name, function_name;


Error: Failed to run sql query: ERROR: 42809: "array_agg" is an aggregate function


a)
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'notify_upvote_milestone';

result:
[
  {
    "schema_name": "public",
    "function_name": "notify_upvote_milestone",
    "function_def": "CREATE OR REPLACE FUNCTION public.notify_upvote_milestone()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  post_author_id uuid;\n  current_vote_count integer;\nBEGIN\n  -- Only process upvotes\n  IF NEW.vote_type != 'upvote' THEN\n    RETURN NEW;\n  END IF;\n\n  -- Skip if voting on own post (SECURITY DEFINER bypasses RLS)\n  SELECT user_id INTO post_author_id\n  FROM posts\n  WHERE id = NEW.post_id;\n\n  IF post_author_id IS NULL OR post_author_id = NEW.user_id THEN\n    RETURN NEW;\n  END IF;\n\n  -- Count current upvotes for this post (SECURITY DEFINER bypasses RLS)\n  SELECT COUNT(*) INTO current_vote_count\n  FROM votes\n  WHERE post_id = NEW.post_id\n  AND vote_type = 'upvote';\n\n  -- Only notify when reaching exactly 5 upvotes (to avoid duplicate notifications)\n  IF current_vote_count = 5 THEN\n    -- Check if post author has notify_upvotes enabled (SECURITY DEFINER bypasses RLS)\n    IF EXISTS (\n      SELECT 1 FROM notification_settings\n      WHERE user_id = post_author_id\n      AND notify_upvotes = true\n    ) THEN\n      -- Create notification\n      INSERT INTO notifications (\n        user_id,\n        type,\n        related_post_id,\n        related_user_id,\n        message,\n        is_read\n      ) VALUES (\n        post_author_id,\n        'upvote',\n        NEW.post_id,\n        NEW.user_id,\n        'Your post received 5 upvotes!',\n        false\n      );\n    END IF;\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  }
]

B) 
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'notify_chat_message';

result: 

[
  {
    "schema_name": "public",
    "function_name": "notify_chat_message",
    "function_def": "CREATE OR REPLACE FUNCTION public.notify_chat_message()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  recipient_id uuid;\n  chat_record record;\n  sender_username text;\n  message_content text;\nBEGIN\n  -- Get chat to find recipient (SECURITY DEFINER bypasses RLS)\n  SELECT participant_1_id, participant_2_id INTO chat_record\n  FROM chats\n  WHERE id = NEW.chat_id;\n\n  -- If chat not found, skip (shouldn't happen, but safety check)\n  IF chat_record IS NULL OR chat_record.participant_1_id IS NULL THEN\n    RETURN NEW;\n  END IF;\n\n  -- Determine recipient (the other participant)\n  IF chat_record.participant_1_id = NEW.user_id THEN\n    recipient_id := chat_record.participant_2_id;\n  ELSE\n    recipient_id := chat_record.participant_1_id;\n  END IF;\n\n  -- Skip if recipient is anonymous or sender is recipient\n  IF recipient_id IS NULL OR recipient_id::text LIKE 'anonymous-%' OR recipient_id = NEW.user_id THEN\n    RETURN NEW;\n  END IF;\n\n  -- Check if recipient has notify_chats enabled (SECURITY DEFINER bypasses RLS)\n  IF EXISTS (\n    SELECT 1 FROM notification_settings\n    WHERE user_id = recipient_id\n    AND notify_chats = true\n  ) THEN\n    -- Get sender username for notification title (SECURITY DEFINER bypasses RLS)\n    SELECT username INTO sender_username\n    FROM profiles\n    WHERE id = NEW.user_id;\n\n    -- Determine message content: use actual content if available, otherwise \"Sent an image\" for image-only\n    IF NEW.content IS NOT NULL AND TRIM(NEW.content) != '' THEN\n      message_content := NEW.content;\n    ELSIF NEW.image_url IS NOT NULL THEN\n      message_content := 'Sent an image';\n    ELSE\n      message_content := 'Sent a message';\n    END IF;\n\n    -- Mark any existing unsent chat_message notifications from this sender to this recipient\n    -- as push_sent = true so the edge function won't re-send them (fixes duplicate \"old\" push)\n    UPDATE notifications\n    SET push_sent = true\n    WHERE user_id = recipient_id\n      AND type = 'chat_message'\n      AND related_user_id = NEW.user_id\n      AND push_sent = false;\n\n    -- Prevent duplicate notifications: Check if a notification was already created\n    -- for this user/sender combination in the last minute (prevents trigger firing multiple times)\n    IF NOT EXISTS (\n      SELECT 1 FROM notifications\n      WHERE user_id = recipient_id\n        AND type = 'chat_message'\n        AND related_user_id = NEW.user_id\n        AND created_at > NOW() - INTERVAL '1 minute'\n    ) THEN\n      -- Create notification with actual message content\n      INSERT INTO notifications (\n        user_id,\n        type,\n        related_user_id,\n        message,\n        is_read,\n        push_sent\n      ) VALUES (\n        recipient_id,\n        'chat_message',\n        NEW.user_id,\n        message_content,\n        false,\n        false\n      );\n    END IF;\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  }
]

C)
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where t.tgname = 'notifications-insert';

result: 
[
  {
    "schema_name": "public",
    "table_name": "notifications",
    "trigger_name": "notifications-insert",
    "trigger_def": "CREATE TRIGGER \"notifications-insert\" AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://rtynfdpezsrolwsglgoe.supabase.co/functions/v1/send-push-notification', 'POST', '{\"Content-type\":\"application/json\",\"Authorization\":\"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eW5mZHBlenNyb2x3c2dsZ29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY0NTQ0OCwiZXhwIjoyMDgwMjIxNDQ4fQ.9JTGfdqevdyPHl-vQJBJcT_p-u6YAms46owrcWXwQaQ\"}', '{}', '5000')"
  }
]