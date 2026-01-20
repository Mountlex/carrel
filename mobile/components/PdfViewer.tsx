import { useState } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import Pdf from "react-native-pdf";

interface PdfViewerProps {
  source: string;
}

export function PdfViewer({ source }: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfSource = { uri: source, cache: true };

  return (
    <View style={styles.container}>
      <Pdf
        source={pdfSource}
        style={styles.pdf}
        trustAllCerts={false}
        onLoadComplete={(numberOfPages) => {
          setTotalPages(numberOfPages);
          setIsLoading(false);
        }}
        onPageChanged={(page) => {
          setCurrentPage(page);
        }}
        onError={(err) => {
          console.error("PDF Error:", err);
          setError("Failed to load PDF");
          setIsLoading(false);
        }}
        enablePaging={true}
        horizontal={false}
        enableAntialiasing={true}
        enableAnnotationRendering={true}
        fitPolicy={0}
        spacing={0}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#000" />
        </View>
      )}

      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {totalPages > 0 && !isLoading && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {currentPage} / {totalPages}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  pdf: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: "#c00",
    textAlign: "center",
  },
  pageIndicator: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pageText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});
