import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface Paper {
  _id: string;
  title: string;
  authors?: string[];
  thumbnailUrl?: string | null;
  pdfUrl?: string | null;
  isUpToDate?: boolean | null;
  buildStatus?: string;
  pdfSourceType?: string | null;
}

interface PaperCardProps {
  paper: Paper;
}

export function PaperCard({ paper }: PaperCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/paper/${paper._id}`);
  };

  const isBuilding = paper.buildStatus === "building";
  const needsSync = paper.isUpToDate === false;
  const canCompile = paper.pdfSourceType === "compile";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <View style={styles.thumbnailContainer}>
        {paper.thumbnailUrl ? (
          <Image
            source={{ uri: paper.thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <Ionicons name="document-text" size={28} color="#ccc" />
          </View>
        )}

        {/* Status indicator */}
        {isBuilding && (
          <View style={styles.statusBadge}>
            <Ionicons name="sync" size={12} color="#fff" />
          </View>
        )}
        {!isBuilding && needsSync && canCompile && (
          <View style={[styles.statusBadge, styles.needsSyncBadge]}>
            <Ionicons name="arrow-up-circle" size={12} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {paper.title}
        </Text>
        {paper.authors && paper.authors.length > 0 && (
          <Text style={styles.authors} numberOfLines={1}>
            {paper.authors.join(", ")}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnailContainer: {
    aspectRatio: 0.77,
    backgroundColor: "#f5f5f5",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  placeholderThumbnail: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
  },
  statusBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#007AFF",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  needsSyncBadge: {
    backgroundColor: "#FF9500",
  },
  info: {
    padding: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000",
    lineHeight: 17,
  },
  authors: {
    fontSize: 11,
    color: "#666",
    marginTop: 3,
  },
});
