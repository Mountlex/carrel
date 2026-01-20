import { useState, useCallback } from "react";
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { PaperCard } from "@/components/PaperCard";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/useAuth";

export default function PapersScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const papers = useQuery(
    api.papers.list,
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Convex auto-refreshes via subscriptions
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (papers === undefined) {
    return (
      <View style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#000" />
        </View>
      </View>
    );
  }

  if (papers.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="documents-outline"
          title="No papers yet"
          message="Add a repository from the web app to get started."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={papers}
        numColumns={2}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <PaperCard paper={item} />}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#000"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 12,
    paddingTop: 8,
  },
  row: {
    gap: 12,
  },
});
