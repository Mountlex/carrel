interface PdfViewerProps {
  url: string;
  title?: string;
}

export function PdfViewer({ url, title }: PdfViewerProps) {
  return (
    <iframe
      src={url}
      className="h-full w-full"
      title={title || "PDF viewer"}
      sandbox="allow-same-origin allow-scripts"
    />
  );
}
