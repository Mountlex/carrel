import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { generateThumbnailFromPdf } from "../lib/thumbnail";

interface UploadResult {
  success: boolean;
  error?: string;
}

interface UsePdfUploadOptions {
  onSuccess?: () => void;
  onError?: (error: unknown, message: string) => void;
}

export function usePdfUpload(userId: Id<"users"> | undefined, options: UsePdfUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const generateUploadUrl = useMutation(api.papers.generateUploadUrl);
  const uploadPdf = useMutation(api.papers.uploadPdf);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult> => {
      if (!userId) {
        return { success: false, error: "User not authenticated" };
      }

      if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
        return { success: false, error: "Please select a valid PDF file" };
      }

      setIsUploading(true);
      try {
        // Generate thumbnail client-side
        let thumbnailStorageId: Id<"_storage"> | undefined;
        try {
          const { blob: thumbnailBlob } = await generateThumbnailFromPdf(file);
          const thumbnailUploadUrl = await generateUploadUrl();
          const thumbnailResponse = await fetch(thumbnailUploadUrl, {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: thumbnailBlob,
          });
          if (thumbnailResponse.ok) {
            const { storageId } = await thumbnailResponse.json();
            thumbnailStorageId = storageId;
          }
        } catch (thumbnailError) {
          console.warn("Client-side thumbnail generation failed:", thumbnailError);
          // Continue without thumbnail - not critical
        }

        // Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Upload the file
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Failed to upload file");
        }

        const { storageId } = await response.json();

        // Create the paper with the uploaded PDF
        const title = file.name.replace(/\.pdf$/i, "");
        await uploadPdf({
          userId,
          title,
          pdfStorageId: storageId,
          thumbnailStorageId,
          fileSize: file.size,
        });

        options.onSuccess?.();
        return { success: true };
      } catch (error) {
        console.error("Upload failed:", error);
        options.onError?.(error, "Failed to upload PDF");
        return { success: false, error: "Failed to upload PDF" };
      } finally {
        setIsUploading(false);
      }
    },
    [userId, generateUploadUrl, uploadPdf, options]
  );

  return {
    isUploading,
    uploadFile,
  };
}
