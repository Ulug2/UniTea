# Create Comment Edge Function

Creates a comment (or reply) on a post. Comments are not AI-moderated; reports and admin removal handle abusive content.

## How It Works

1. **Authentication**: Validates the user's session from the Authorization header
2. **Idempotency**: If the client-supplied `id` already exists for this user, returns that comment
3. **Rate limit**: 10 comments per 2 minutes per user
4. **Validation**: Checks that content and post_id are provided
5. **Database Insert**: Inserts the comment under the caller's RLS context
6. **Notification**: Inserts a `comment_reply` notification for the post author (failures never block the comment)

## Deploy

```bash
supabase functions deploy create-comment
```

## Error Messages

- `"Unauthorized"` - User is not authenticated
- `"Invalid comment id"` - Client-supplied id is not a UUID
- `"Comment content is required"` - Empty content
- `"Post ID is required"` - Missing post_id
