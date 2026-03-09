function extractMissingFiles(logText) {
  if (!logText) return [];

  const patterns = [
    /! LaTeX Error: File [`']([^`'\n]+)[`'] not found\./g,
    /! I can't find file [`']([^`'\n]+)[`']\./g,
    /! Package [^\n]+? Error: File [`']([^`'\n]+)[`'] not found(?:[^\n]*)/g,
    /(?:^|\n)LaTeX Warning: File [`']([^`'\n]+)[`'] not found(?:[^\n]*)/g,
    /(?:^|\n)Package [^\n]+? Warning: File [`']([^`'\n]+)[`'] not found(?:[^\n]*)/g,
  ];

  const missingFiles = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(logText)) !== null) {
      const filePath = match[1]?.trim();
      if (filePath) {
        missingFiles.add(filePath);
      }
    }
  }

  return Array.from(missingFiles).sort();
}

module.exports = {
  extractMissingFiles,
};
