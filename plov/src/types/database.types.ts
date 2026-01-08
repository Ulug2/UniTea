export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "13.0.5"
    }
    public: {
        Tables: {
            blocks: {
                Row: {
                    blocked_id: string
                    blocker_id: string
                    created_at: string | null
                    id: string
                }
                Insert: {
                    blocked_id: string
                    blocker_id: string
                    created_at?: string | null
                    id?: string
                }
                Update: {
                    blocked_id?: string
                    blocker_id?: string
                    created_at?: string | null
                    id?: string
                }
                Relationships: []
            }
            bookmarks: {
                Row: {
                    created_at: string | null
                    id: string
                    post_id: string
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    post_id: string
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    post_id?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "bookmarks_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "bookmarks_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "bookmarks_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            chat_messages: {
                Row: {
                    chat_id: string
                    content: string
                    created_at: string | null
                    id: string
                    is_read: boolean | null
                    user_id: string
                }
                Insert: {
                    chat_id: string
                    content: string
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    user_id: string
                }
                Update: {
                    chat_id?: string
                    content?: string
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "chat_messages_chat_id_fkey"
                        columns: ["chat_id"]
                        isOneToOne: false
                        referencedRelation: "chats"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "chat_messages_chat_id_fkey"
                        columns: ["chat_id"]
                        isOneToOne: false
                        referencedRelation: "user_chats_summary"
                        referencedColumns: ["chat_id"]
                    },
                ]
            }
            chats: {
                Row: {
                    created_at: string | null
                    id: string
                    last_message_at: string | null
                    participant_1_id: string
                    participant_2_id: string
                    post_id: string | null
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    last_message_at?: string | null
                    participant_1_id: string
                    participant_2_id: string
                    post_id?: string | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    last_message_at?: string | null
                    participant_1_id?: string
                    participant_2_id?: string
                    post_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            comments: {
                Row: {
                    content: string
                    created_at: string | null
                    id: string
                    is_deleted: boolean | null
                    parent_comment_id: string | null
                    post_id: string
                    updated_at: string | null
                    user_id: string | null
                }
                Insert: {
                    content: string
                    created_at?: string | null
                    id?: string
                    is_deleted?: boolean | null
                    parent_comment_id?: string | null
                    post_id: string
                    updated_at?: string | null
                    user_id?: string | null
                }
                Update: {
                    content?: string
                    created_at?: string | null
                    id?: string
                    is_deleted?: boolean | null
                    parent_comment_id?: string | null
                    post_id?: string
                    updated_at?: string | null
                    user_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "comments_parent_comment_id_fkey"
                        columns: ["parent_comment_id"]
                        isOneToOne: false
                        referencedRelation: "comments"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "comments_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "comments_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "comments_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            notifications: {
                Row: {
                    created_at: string | null
                    id: string
                    is_read: boolean | null
                    message: string
                    related_comment_id: string | null
                    related_post_id: string | null
                    related_user_id: string | null
                    type: string
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    message: string
                    related_comment_id?: string | null
                    related_post_id?: string | null
                    related_user_id?: string | null
                    type: string
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    message?: string
                    related_comment_id?: string | null
                    related_post_id?: string | null
                    related_user_id?: string | null
                    type?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "notifications_related_comment_id_fkey"
                        columns: ["related_comment_id"]
                        isOneToOne: false
                        referencedRelation: "comments"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "notifications_related_post_id_fkey"
                        columns: ["related_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "notifications_related_post_id_fkey"
                        columns: ["related_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "notifications_related_post_id_fkey"
                        columns: ["related_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            posts: {
                Row: {
                    category: string | null
                    content: string
                    created_at: string | null
                    edited_at: string | null
                    id: string
                    image_url: string | null
                    is_anonymous: boolean | null
                    is_deleted: boolean | null
                    is_edited: boolean | null
                    location: string | null
                    post_type: string
                    repost_comment: string | null
                    reposted_from_post_id: string | null
                    updated_at: string | null
                    user_id: string
                    view_count: number | null
                }
                Insert: {
                    category?: string | null
                    content: string
                    created_at?: string | null
                    edited_at?: string | null
                    id?: string
                    image_url?: string | null
                    is_anonymous?: boolean | null
                    is_deleted?: boolean | null
                    is_edited?: boolean | null
                    location?: string | null
                    post_type: string
                    repost_comment?: string | null
                    reposted_from_post_id?: string | null
                    updated_at?: string | null
                    user_id: string
                    view_count?: number | null
                }
                Update: {
                    category?: string | null
                    content?: string
                    created_at?: string | null
                    edited_at?: string | null
                    id?: string
                    image_url?: string | null
                    is_anonymous?: boolean | null
                    is_deleted?: boolean | null
                    is_edited?: boolean | null
                    location?: string | null
                    post_type?: string
                    repost_comment?: string | null
                    reposted_from_post_id?: string | null
                    updated_at?: string | null
                    user_id?: string
                    view_count?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    bio: string | null
                    created_at: string | null
                    id: string
                    is_admin: boolean | null
                    is_banned: boolean | null
                    is_verified: boolean | null
                    updated_at: string | null
                    username: string
                }
                Insert: {
                    avatar_url?: string | null
                    bio?: string | null
                    created_at?: string | null
                    id: string
                    is_admin?: boolean | null
                    is_banned?: boolean | null
                    is_verified?: boolean | null
                    updated_at?: string | null
                    username: string
                }
                Update: {
                    avatar_url?: string | null
                    bio?: string | null
                    created_at?: string | null
                    id?: string
                    is_admin?: boolean | null
                    is_banned?: boolean | null
                    is_verified?: boolean | null
                    updated_at?: string | null
                    username?: string
                }
                Relationships: []
            }
            reports: {
                Row: {
                    comment_id: string | null
                    created_at: string | null
                    id: string
                    post_id: string | null
                    reason: string
                    reporter_id: string
                    resolved_at: string | null
                    reviewed_by: string | null
                    status: string | null
                }
                Insert: {
                    comment_id?: string | null
                    created_at?: string | null
                    id?: string
                    post_id?: string | null
                    reason: string
                    reporter_id: string
                    resolved_at?: string | null
                    reviewed_by?: string | null
                    status?: string | null
                }
                Update: {
                    comment_id?: string | null
                    created_at?: string | null
                    id?: string
                    post_id?: string | null
                    reason?: string
                    reporter_id?: string
                    resolved_at?: string | null
                    reviewed_by?: string | null
                    status?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "reports_comment_id_fkey"
                        columns: ["comment_id"]
                        isOneToOne: false
                        referencedRelation: "comments"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reports_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reports_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "reports_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            votes: {
                Row: {
                    comment_id: string | null
                    created_at: string | null
                    id: string
                    post_id: string | null
                    user_id: string
                    vote_type: string
                }
                Insert: {
                    comment_id?: string | null
                    created_at?: string | null
                    id?: string
                    post_id?: string | null
                    user_id: string
                    vote_type: string
                }
                Update: {
                    comment_id?: string | null
                    created_at?: string | null
                    id?: string
                    post_id?: string | null
                    user_id?: string
                    vote_type?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "votes_comment_id_fkey"
                        columns: ["comment_id"]
                        isOneToOne: false
                        referencedRelation: "comments"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "votes_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "votes_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "votes_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
        }
        Views: {
            posts_summary_view: {
                Row: {
                    avatar_url: string | null
                    category: string | null
                    comment_count: number | null
                    content: string | null
                    created_at: string | null
                    edited_at: string | null
                    image_url: string | null
                    is_anonymous: boolean | null
                    is_banned: boolean | null
                    is_deleted: boolean | null
                    is_edited: boolean | null
                    is_verified: boolean | null
                    location: string | null
                    original_author_avatar: string | null
                    original_author_username: string | null
                    original_content: string | null
                    original_created_at: string | null
                    original_is_anonymous: boolean | null
                    original_post_id: string | null
                    original_user_id: string | null
                    post_id: string | null
                    post_type: string | null
                    repost_comment: string | null
                    repost_count: number | null
                    reposted_from_post_id: string | null
                    updated_at: string | null
                    user_id: string | null
                    user_vote: string | null
                    username: string | null
                    view_count: number | null
                    vote_score: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "posts_reposted_from_post_id_fkey"
                        columns: ["reposted_from_post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
            user_chats_summary: {
                Row: {
                    chat_id: string | null
                    created_at: string | null
                    last_message_at: string | null
                    last_message_content: string | null
                    participant_1_id: string | null
                    participant_2_id: string | null
                    post_id: string | null
                    unread_count_p1: number | null
                    unread_count_p2: number | null
                }
                Insert: {
                    chat_id?: string | null
                    created_at?: string | null
                    last_message_at?: string | null
                    last_message_content?: never
                    participant_1_id?: string | null
                    participant_2_id?: string | null
                    post_id?: string | null
                    unread_count_p1?: never
                    unread_count_p2?: never
                }
                Update: {
                    chat_id?: string | null
                    created_at?: string | null
                    last_message_at?: string | null
                    last_message_content?: never
                    participant_1_id?: string | null
                    participant_2_id?: string | null
                    post_id?: string | null
                    unread_count_p1?: never
                    unread_count_p2?: never
                }
                Relationships: [
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["original_post_id"]
                    },
                    {
                        foreignKeyName: "chats_post_id_fkey"
                        columns: ["post_id"]
                        isOneToOne: false
                        referencedRelation: "posts_summary_view"
                        referencedColumns: ["post_id"]
                    },
                ]
            }
        }
        Functions: {
            get_repost_count: { Args: { post_id: string }; Returns: number }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
    DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    public: {
        Enums: {},
    },
} as const
