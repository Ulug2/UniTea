import Auth from '../../components/Auth';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

export default function AuthScreen() {
    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                bounces={false}
            >
                <Auth />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}