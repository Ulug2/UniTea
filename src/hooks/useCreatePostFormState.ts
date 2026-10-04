import { useCallback, useMemo, useState } from "react";
import {
  isBoardPostType,
  sanitizePriceInput,
} from "../features/posts/utils/boardPosts";

type CreatePostMode = {
  type?: string;
  repostId?: string | string[];
};

export type PollOptions = string[];

export function useCreatePostFormState(params: CreatePostMode) {
  const { type, repostId } = params;
  // Board posts (Market tab): `market` or `lost_found`. Null for feed posts.
  const boardPostType = isBoardPostType(type) ? type : null;
  const isBoardPost = boardPostType !== null;
  const isLostFound = boardPostType === "lost_found";
  const isRepost = Boolean(repostId);

  const [content, setContent] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isPoll, setIsPoll] = useState<boolean>(false);
  const [pollOptions, setPollOptions] = useState<PollOptions>(["", ""]);

  const [category, setCategory] = useState<"lost" | "found">("lost");
  const [location, setLocation] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [price, setPriceText] = useState<string>("");
  const setPrice = useCallback(
    (text: string) => setPriceText(sanitizePriceInput(text)),
    [],
  );

  const reset = useCallback(() => {
    setContent("");
    setImages([]);
    setIsAnonymous(true);
    setIsPoll(false);
    setPollOptions(["", ""]);
    setCategory("lost");
    setLocation("");
    setTitle("");
    setPriceText("");
  }, []);

  const hasPollContent = useMemo(
    () => pollOptions.some((o) => o.trim().length > 0),
    [pollOptions]
  );

  const canSubmit = useMemo(() => {
    if (isBoardPost) {
      // Location says where a lost/found item is; for a sale it's optional.
      return (
        Boolean(title.trim()) &&
        Boolean(content.trim()) &&
        (!isLostFound || Boolean(location.trim()))
      );
    }

    if (isRepost) {
      // Reposts can be image-only or text-only; content optional.
      return Boolean(content.trim()) || images.length > 0;
    }

    // Regular feed post
    if (isPoll) {
      return hasPollContent;
    }

    return Boolean(content.trim()) || images.length > 0;
  }, [isBoardPost, isLostFound, isRepost, isPoll, content, title, location, images, hasPollContent]);

  return {
    // mode
    boardPostType,
    isBoardPost,
    isLostFound,
    isRepost,

    // form state
    content,
    setContent,
    images,
    setImages,
    isAnonymous,
    setIsAnonymous,
    isSubmitting,
    setIsSubmitting,

    isPoll,
    setIsPoll,
    pollOptions,
    setPollOptions,

    category,
    setCategory,
    location,
    setLocation,
    title,
    setTitle,
    price,
    setPrice,

    // helpers
    reset,
    canSubmit,
  };
}

