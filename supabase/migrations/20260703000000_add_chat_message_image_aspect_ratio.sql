-- Store the image's aspect ratio (width / height) captured at send time so
-- chat image bubbles can reserve their exact final size on first render —
-- mirrors posts.image_aspect_ratio (20260409120000_add_image_aspect_ratio.sql)
-- and eliminates the layout jump that previously happened once an image's
-- real dimensions became known after it finished loading.

BEGIN;

ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS image_aspect_ratio FLOAT;

COMMIT;
