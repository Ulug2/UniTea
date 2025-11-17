import { Slot } from "expo-router";
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { ActivityIndicator } from "react-native";
import { ThemeProvider } from "../context/ThemeContext";

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_700Bold,
    });

    if (!fontsLoaded) {
        return <ActivityIndicator />;
    }

    return (
        <ThemeProvider>
            <Slot />
        </ThemeProvider>
    )
}