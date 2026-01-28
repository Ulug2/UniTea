# Create Comment Edge Function

This Edge Function handles AI-powered content moderation for comments before they are inserted into the database.

## Features

- **Text Moderation**: Uses OpenAI's Moderation API to check comment content
- **Authentication**: Validates user session before processing
- **Error Handling**: Returns user-friendly error messages
- **Supports Replies**: Handles both top-level comments and nested replies

## Setup

### 1. Set Environment Variables

The function uses the same `OPENAI_API_KEY` as the `create-post` function:

```bash
# Using Supabase CLI (if not already set)
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

### 2. Deploy the Function

```bash
# Deploy from project root
supabase functions deploy create-comment
```

### 3. Verify Deployment

```bash
# Check function status
supabase functions list
```

## How It Works

1. **Authentication**: Validates the user's session from the Authorization header
2. **Validation**: Checks that content and post_id are provided
3. **Text Check**: Runs content through OpenAI's moderation API
4. **Database Insert**: If check passes, inserts the comment into the database
5. **Response**: Returns the inserted comment data or an error message

## Error Messages

- `"Comment violates community guidelines"` - Text content was flagged
- `"Unauthorized"` - User is not authenticated
- `"Comment content is required"` - Empty content
- `"Post ID is required"` - Missing post_id

## Cost Considerations

- **Text Moderation**: ~$0.0001 per 1K characters (very cheap)

For a typical comment, expect ~$0.0001 per comment.
