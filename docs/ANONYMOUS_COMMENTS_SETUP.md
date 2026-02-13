# Anonymous comments: "User #" display

For anonymous comments to show **User 1**, **User 2**, etc. (instead of "Anonymous"), two things must be in place.

## 1. Database migration

Run the migration that adds the column and backfill (see earlier SQL in this repo):

- `ALTER TABLE public.comments ADD COLUMN post_specific_anon_id integer;`
- Optional index and backfill for existing rows.

## 2. Deploy the `create-comment` edge function

The Supabase Edge Function **create-comment** must be the version that assigns `post_specific_anon_id` for anonymous comments. If an older version is deployed (without that logic), new anonymous comments will be stored with `post_specific_anon_id = null` and will still display as "Anonymous".

After updating the function code, deploy it, for example:

```bash
supabase functions deploy create-comment
```

Then new anonymous comments will get a number and display as "User #". Existing comments with `null` will keep showing "Anonymous" until you run the backfill SQL.
