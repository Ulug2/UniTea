export type User = {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    is_verified: boolean;
    is_banned: boolean;
    created_at: string;
    updated_at: string;
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
    is_deleted: boolean;
    is_edited: boolean;
    edited_at: string | null;
    view_count: number;
    created_at: string;
    updated_at: string;
};

export type Comment = {
    id: string;
    post_id: string;
    user_id: string | null;
    parent_comment_id: string | null;
    content: string;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
};

export type Vote = {
    id: string;
    user_id: string;
    post_id: string | null;
    comment_id: string | null;
    vote_type: "upvote" | "downvote";
    created_at: string;
};

export type Chat = {
    id: string;
    post_id: string;
    participant_1_id: string;
    participant_2_id: string;
    last_message_at: string;
    created_at: string;
};

export type ChatMessage = {
    id: string;
    chat_id: string;
    user_id: string;
    content: string;
    is_read: boolean;
    created_at: string;
};

export type Report = {
    id: string;
    reporter_id: string;
    post_id: string | null;
    comment_id: string | null;
    reason: string;
    status: "pending" | "reviewed" | "resolved";
    reviewed_by: string | null;
    created_at: string;
    resolved_at: string | null;
};

export type Notification = {
    id: string;
    user_id: string;
    type: "comment_reply" | "upvote" | "chat_message" | "mention" | "post_update";
    related_post_id: string | null;
    related_comment_id: string | null;
    related_user_id: string | null;
    message: string;
    is_read: boolean;
    created_at: string;
};

export type Bookmark = {
    id: string;
    user_id: string;
    post_id: string;
    created_at: string;
};

export type Block = {
    id: string;
    blocker_id: string;
    blocked_id: string;
    created_at: string;
};