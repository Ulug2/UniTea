supabase functions deploy check-email-exists# check-email-exists

Checks if an email is already registered in `auth.users`. Used by the app before calling `signUp` so existing users are not sent a confirmation email and see a "User already exists" message instead.

- **Method:** POST
- **Body:** `{ "email": "user@example.com" }`
- **Response:** `{ "exists": true }` or `{ "exists": false }`
- **Auth:** Uses `SUPABASE_SERVICE_ROLE_KEY` internally; invoke with anon key from the client.
