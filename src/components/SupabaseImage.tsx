import { ComponentProps, useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { downloadImage } from "../utils/supabaseImages";
import { supabase } from "../lib/supabase";

type SupabaseImageProps = {
  bucket?: string;
  path: string;
} & ComponentProps<typeof Image>;

export default function SupabaseImage({
  path,
  bucket = "post-images",
  ...imageProps
}: SupabaseImageProps) {
  const [image, setImage] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const handleDownload = async () => {
    try {
      const result = await downloadImage(path, supabase, bucket);
      setImage(result);
    } catch (error) {
      console.error("Error downloading image:", error);
      setImage(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    if (path && bucket) {
      handleDownload();
    } else {
      setIsLoading(false);
    }
  }, [path, bucket]);

  if (isLoading) {
    return (
      <View
        style={[
          {
            backgroundColor: "gainsboro",
            alignItems: "center",
            justifyContent: "center",
          },
          imageProps.style,
        ]}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (!image) {
    return null;
  }

  return <Image source={{ uri: image }} {...imageProps} />;
}

