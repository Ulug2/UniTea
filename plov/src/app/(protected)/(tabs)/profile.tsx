import { View, Text, Switch, StyleSheet } from "react-native";
import { useTheme } from "../../../context/ThemeContext";

export default function ProfileScreen() {
    const { theme, isDark, toggleTheme } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
                <Switch
                    value={isDark}
                    onValueChange={toggleTheme}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor={isDark ? '#fff' : '#f4f3f4'}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    settingLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
});