import { useCallback, useMemo, useState } from "react";

type CreatePostMode = {
  type?: string;
  repostId?: string | string[];
};

export type PollOptions = string[];

export function useCreatePostFormState(params: CreatePostMode) {
  const { type, repostId } = params;
  const isLostFound = type === "lost_found";
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

  const reset = useCallback(() => {
    setContent("");
    setImages([]);
    setIsAnonymous(true);
    setIsPoll(false);
    setPollOptions(["", ""]);
    setCategory("lost");
    setLocation("");
    setTitle("");
  }, []);

  const hasPollContent = useMemo(
    () => pollOptions.some((o) => o.trim().length > 0),
    [pollOptions]
  );

  const canSubmit = useMemo(() => {
    if (isLostFound) {
      return Boolean(title.trim()) && Boolean(content.trim()) && Boolean(location.trim());
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
  }, [isLostFound, isRepost, isPoll, content, title, location, images, hasPollContent]);

  return {
    // mode
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

    // helpers
    reset,
    canSubmit,
  };
}

