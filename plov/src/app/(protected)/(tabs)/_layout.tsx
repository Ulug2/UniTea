import { Tabs } from "expo-router";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { View, Pressable, StyleSheet } from "react-native";

// Create a context for filter state
type FeedFilter = 'hot' | 'new' | 'top';
const FilterContext = createContext<{
    selectedFilter: FeedFilter;
    setSelectedFilter: (filter: FeedFilter) => void;
}>({
    selectedFilter: 'hot',
    setSelectedFilter: () => { },
});

export const useFilterContext = () => useContext(FilterContext);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [selectedFilter, setSelectedFilter] = useState<FeedFilter>('hot');
    return (
        <FilterContext.Provider value={{ selectedFilter, setSelectedFilter }}>
            {children}
        </FilterContext.Provider>
    );
}

function FilterButtons() {
    const { theme } = useTheme();
    const { selectedFilter, setSelectedFilter } = useFilterContext();

    return (
        <View style={styles.filterButtons}>
            <Pressable
                style={[
                    styles.filterBtn,
                    selectedFilter === 'hot' && { backgroundColor: theme.primary + '20' }
                ]}
                onPress={() => setSelectedFilter('hot')}
            >
                <FontAwesome
                    name="fire"
                    size={18}
                    color={selectedFilter === 'hot' ? theme.primary : theme.secondaryText}
                />
            </Pressable>
            <Pressable
                style={[
                    styles.filterBtn,
                    selectedFilter === 'new' && { backgroundColor: theme.primary + '20' }
                ]}
                onPress={() => setSelectedFilter('new')}
            >
                <FontAwesome
                    name="clock-o"
                    size={18}
                    color={selectedFilter === 'new' ? theme.primary : theme.secondaryText}
                />
            </Pressable>
            <Pressable
                style={[
                    styles.filterBtn,
                    selectedFilter === 'top' && { backgroundColor: theme.primary + '20' }
                ]}
                onPress={() => setSelectedFilter('top')}
            >
                <FontAwesome
                    name="trophy"
                    size={18}
                    color={selectedFilter === 'top' ? theme.primary : theme.secondaryText}
                />
            </Pressable>
        </View>
    );
}

export default function TabLayout() {
    const { theme } = useTheme();

    return (
        <FilterProvider>
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
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                        height: 100
                    },
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: "Feed",
                        headerTitle: "Plov",
                        headerTitleAlign: "left",
                        headerTitleStyle: {
                            fontSize: 28,
                            fontWeight: "bold",
                            color: theme.text,
                        },
                        headerRight: () => <FilterButtons />,
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
                    }}
                />
            </Tabs>
        </FilterProvider>
    );
}

const styles = StyleSheet.create({
    filterButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginRight: 16,
    },
    filterBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
});