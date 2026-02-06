import React from "react";
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    Switch,
    ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

type NotificationSettings = {
    user_id: string;
    push_token: string | null;
    notify_chats: boolean;
    notify_upvotes: boolean;
};

interface NotificationSettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function NotificationSettingsModal({
    visible,
    onClose,
}: NotificationSettingsModalProps) {
    const { theme } = useTheme();
    const { session } = useAuth();
    const queryClient = useQueryClient();
    const userId = session?.user?.id;

    const {
        data: settings,
        isLoading,
        isFetching,
    } = useQuery<NotificationSettings | null>({
        queryKey: ["notification-settings", userId],
        enabled: Boolean(userId) && visible,
        queryFn: async () => {
            if (!userId) return null;

            const { data, error } = await supabase
                .from("notification_settings")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle();

            if (error && error.code !== "PGRST116") {
                throw error;
            }

            if (!data) {
                return {
                    user_id: userId,
                    push_token: null,
                    notify_chats: true,
                    notify_upvotes: true,
                };
            }

            return data as NotificationSettings;
        },
    });

    const updateSettingMutation = useMutation({
        mutationFn: async ({
            field,
            value,
        }: {
            field: "notify_chats" | "notify_upvotes";
            value: boolean;
        }) => {
            if (!userId) throw new Error("User ID missing");

            const { error } = await supabase
                .from("notification_settings")
                .upsert(
                    {
                        user_id: userId,
                        [field]: value,
                    },
                    { onConflict: "user_id" }
                );

            if (error) throw error;
        },
        onMutate: async ({ field, value }) => {
            await queryClient.cancelQueries({
                queryKey: ["notification-settings", userId],
            });

            const previous = queryClient.getQueryData<NotificationSettings | null>([
                "notification-settings",
                userId,
            ]);

            if (previous) {
                queryClient.setQueryData<NotificationSettings | null>(
                    ["notification-settings", userId],
                    {
                        ...previous,
                        [field]: value,
                    }
                );
            }

            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(
                    ["notification-settings", userId],
                    context.previous
                );
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: ["notification-settings", userId],
            });
        },
    });

    const isBusy = isLoading || isFetching;

    const handleToggle =
        (field: "notify_chats" | "notify_upvotes") =>
            (value: boolean) => {
                updateSettingMutation.mutate({ field, value });
            };

    const effectiveSettings: NotificationSettings = settings || {
        user_id: userId || "",
        push_token: null,
        notify_chats: true,
        notify_upvotes: true,
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <View
                    style={[styles.modalContent, { backgroundColor: theme.card }]}
                    onStartShouldSetResponder={() => true}
                >
                    <View
                        style={[styles.modalHandle, { backgroundColor: theme.border }]}
                    />

                    <Text style={[styles.modalTitle, { color: theme.text }]}>
                        Notification Preferences
                    </Text>

                    {isBusy && (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator size="small" color={theme.primary} />
                            <Text
                                style={[styles.loadingText, { color: theme.secondaryText }]}
                            >
                                Loading settings...
                            </Text>
                        </View>
                    )}

                    <View style={styles.optionRow}>
                        <View style={styles.optionLeft}>
                            <Ionicons
                                name="chatbubble-outline"
                                size={22}
                                color={theme.text}
                            />
                            <Text style={[styles.optionLabel, { color: theme.text }]}>
                                Chat Messages
                            </Text>
                        </View>
                        <Switch
                            value={effectiveSettings.notify_chats}
                            onValueChange={handleToggle("notify_chats")}
                            trackColor={{ false: theme.border, true: theme.primary }}
                            thumbColor={"white"}
                        />
                    </View>

                    <View style={styles.optionRow}>
                        <View style={styles.optionLeft}>
                            <MaterialCommunityIcons
                                name="arrow-up-bold-outline"
                                size={22}
                                color={theme.text}
                            />
                            <Text style={[styles.optionLabel, { color: theme.text }]}>
                                Upvotes
                            </Text>
                        </View>
                        <Switch
                            value={effectiveSettings.notify_upvotes}
                            onValueChange={handleToggle("notify_upvotes")}
                            trackColor={{ false: theme.border, true: theme.primary }}
                            thumbColor={"white"}
                        />
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 32,
        paddingHorizontal: 20,
    },
    modalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: "center",
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: "Poppins_700Bold",
        textAlign: "center",
        marginBottom: 16,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
    },
    loadingText: {
        fontSize: 14,
        fontFamily: "Poppins_400Regular",
    },
    optionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    optionLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    optionLabel: {
        fontSize: 16,
        fontFamily: "Poppins_500Medium",
    },
});

