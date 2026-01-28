# Create Post Edge Function

This Edge Function handles AI-powered content moderation for posts before they are inserted into the database.

## Features

- **Text Moderation**: Uses OpenAI's Moderation API to check post content
- **Image Moderation**: Uses GPT-4o-mini to analyze images for inappropriate content
- **Authentication**: Validates user session before processing
- **Error Handling**: Returns user-friendly error messages

## Setup

### 1. Set Environment Variables

You need to set the `OPENAI_API_KEY` in your Supabase project:

```bash
# Using Supabase CLI
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

Or set it in the Supabase Dashboard:
1. Go to Project Settings → Edge Functions → Secrets
2. Add `OPENAI_API_KEY` with your OpenAI API key

### 2. Deploy the Function

```bash
# Deploy from project root
supabase functions deploy create-post
```

### 3. Verify Deployment

```bash
# Check function status
supabase functions list
```

## How It Works

1. **Authentication**: Validates the user's session from the Authorization header
2. **Text Check**: If content exists, runs it through OpenAI's moderation API
3. **Image Check**: If an image is present:
   - Creates a signed URL (valid for 5 minutes)
   - Sends image to GPT-4o-mini for analysis
   - Checks if response contains "NO"
4. **Database Insert**: If all checks pass, inserts the post into the database
5. **Response**: Returns the inserted post data or an error message

## Error Messages

- `"Post violates community guidelines"` - Text content was flagged
- `"Image violates community guidelines"` - Image was flagged as inappropriate
- `"Unauthorized"` - User is not authenticated
- `"Failed to verify image. Please try again."` - Image processing error

## Testing

You can test the function locally using the Supabase CLI:

```bash
# Start local Supabase (requires Docker)
supabase start

# Test the function
supabase functions serve create-post
```

Then test with curl or Postman using your Supabase anon key and a valid auth token.

## Cost Considerations

- **Text Moderation**: ~$0.0001 per 1K characters (very cheap)
- **Image Moderation (GPT-4o-mini)**: ~$0.0001 per image (very cheap)

For a typical post with text and image, expect ~$0.0002 per post.
