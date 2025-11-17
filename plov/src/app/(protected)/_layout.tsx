import { AntDesign, Entypo, MaterialIcons } from "@expo/vector-icons";
import { Stack, router, Redirect } from "expo-router";
import { View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

export default function AppLayout() {
    const { theme } = useTheme();

    return (
        <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
                name="post/[id]"
                options={{
                    headerTitle: "",
                    headerStyle: { backgroundColor: theme.primary },
                    headerLeft: () => (
                        <AntDesign
                            name="close"
                            size={24}
                            color="white"
                            onPress={() => router.back()}
                        />
                    ),
                    headerRight: () => (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <Entypo name="dots-three-horizontal" size={24} color="white" />
                        </View>
                    ),
                    animation: "slide_from_bottom",
                }}
            />
        </Stack>
    )
}