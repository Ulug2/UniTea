import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";

export default function ChatScreen() {
    const { theme } = useTheme();
    
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Text style={[styles.text, { color: theme.text }]}>Chat Screen</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
});