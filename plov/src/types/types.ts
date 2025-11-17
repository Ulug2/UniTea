export type User = {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    created_at: string;
};

export type Post = {
    id: string;
    user_id: string;
    content: string;
    image_url: string | null;
    is_anonymous: boolean;
    post_type: "feed" | "lost_found";
    category: "lost" | "found" | null;
    location: string | null;
    upvotes: number;
    created_at: string;
};

export type Comment = {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string;
    replies?: Comment[]; // optional for nested replies
};

export type Vote = {
    user_id: string;
    post_id: string;
};

export type Chat = {
    id: string;
    post_id: string; // only for lost & found posts
    created_at: string;
};

export type ChatMessage = {
    id: string;
    chat_id: string;
    user_id: string;
    content: string;
    created_at: string;
};

export type Report = {
    id: string;
    reporter_id: string;
    post_id?: string | null;
    comment_id?: string | null;
    reason: string;
    created_at: string;
};