import { Tabs } from "expo-router";
import { AntDesign, Feather, Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";

export default function TabLayout() {
    const { theme } = useTheme();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.primary,
                tabBarInactiveTintColor: theme.secondaryText,
                tabBarStyle: {
                    backgroundColor: theme.card,
                    borderTopColor: theme.border,
                },
                headerStyle: {
                    backgroundColor: theme.background,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Feed",
                    headerTitle: "Plov",
                    headerTitleAlign: "center",
                    headerTitleStyle: {
                        fontSize: 28,
                        fontWeight: "bold",
                        color: theme.text,
                    },
                    tabBarIcon: ({ color }) => (
                        <Ionicons name="home-outline" size={24} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="chat"
                options={{
                    title: "Chat",
                    headerTitleAlign: "center",
                    headerTitleStyle: {
                        fontSize: 24,
                        fontWeight: "bold",
                        color: theme.text,
                    },
                    tabBarIcon: ({ color }) => (
                        <Ionicons name="chatbubble-ellipses-outline" size={24} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="lostfound"
                options={{
                    title: "Lost & Found",
                    headerTitleAlign: "center",
                    headerTitleStyle: {
                        fontSize: 24,
                        fontWeight: "bold",
                        color: theme.text,
                    },
                    tabBarIcon: ({ color }) => (
                        <Ionicons name="bag-outline" size={24} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: "Profile",
                    headerTitleAlign: "center",
                    headerTitleStyle: {
                        fontSize: 24,
                        fontWeight: "bold",
                        color: theme.text,
                    },
                    tabBarIcon: ({ color }) => (
                        <Ionicons name="person-outline" size={24} color={color} />
                    ),
                    headerRight: () => (
                        <Feather
                            name="settings"
                            size={22}
                            color={theme.text}
                            style={{ paddingRight: 10 }}
                            onPress={() => console.log("sign out")}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}