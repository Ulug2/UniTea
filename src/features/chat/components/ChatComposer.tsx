import React from "react";
import {
  View,
  TextInput,
  Pressable,
  Image,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type ChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  selectedImageUri: string | null;
  onRemoveImage: () => void;
  isSending: boolean;
  disabled: boolean;
  placeholder?: string;
  textColor: string;
  placeholderColor: string;
  styles: {
    inputContainer: StyleProp<ViewStyle>;
    input: StyleProp<ViewStyle>;
    sendButton: StyleProp<ViewStyle>;
    imagePickerButton: StyleProp<ViewStyle>;
    imagePreviewContainer: StyleProp<ViewStyle>;
    imagePreview: StyleProp<import("react-native").ImageStyle>;
    removeImageButton: StyleProp<ViewStyle>;
  };
  paddingBottom?: number;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onPickImage,
  selectedImageUri,
  onRemoveImage,
  isSending,
  disabled,
  placeholder = "Type a message...",
  textColor,
  placeholderColor,
  styles: styleSet,
  paddingBottom = 0,
}: ChatComposerProps) {
  return (
    <>
      {selectedImageUri && (
        <View style={styleSet.imagePreviewContainer}>
          <Image source={{ uri: selectedImageUri }} style={styleSet.imagePreview} />
          <Pressable style={styleSet.removeImageButton} onPress={onRemoveImage}>
            <Ionicons name="close-circle" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      )}
      <View style={[styleSet.inputContainer, { paddingBottom }]}>
        <Pressable style={styleSet.imagePickerButton} onPress={onPickImage}>
          <Ionicons name="image-outline" size={24} color={textColor} />
        </Pressable>
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={onChangeText}
          style={styleSet.input}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={onSend}
          style={[
            styleSet.sendButton,
            { opacity: disabled || isSending ? 0.5 : 1 },
          ]}
          disabled={disabled || isSending}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </>
  );
}
