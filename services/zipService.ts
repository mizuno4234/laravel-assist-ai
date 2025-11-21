import { ExtractedFile } from '../types';
import { IGNORED_DIRS, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '../constants';

// Extend Window interface to include JSZip loaded via CDN
declare global {
  interface Window {
    JSZip: any;
  }
}

export const extractProjectFiles = async (file: File): Promise<ExtractedFile[]> => {
  return new Promise((resolve, reject) => {
    if (!window.JSZip) {
      reject(new Error("JSZip library not loaded."));
      return;
    }

    const zip = new window.JSZip();
    const extractedFiles: ExtractedFile[] = [];

    zip.loadAsync(file).then(async (contents: any) => {
      const filePromises: Promise<void>[] = [];

      contents.forEach((relativePath: string, zipEntry: any) => {
        if (zipEntry.dir) return;

        // 1. Check Ignore Directories
        const isIgnoredDir = IGNORED_DIRS.some(dir => relativePath.startsWith(dir + '/') || relativePath.includes('/' + dir + '/'));
        if (isIgnoredDir) return;

        // 2. Check Allowed Extensions
        const hasValidExt = ALLOWED_EXTENSIONS.some(ext => relativePath.endsWith(ext));
        if (!hasValidExt) return;

        // 3. Read file content
        const promise = zipEntry.async("string").then((content: string) => {
          // Basic size check logic (post-read, but prevents sending massive files)
          if (content.length > MAX_FILE_SIZE_BYTES) {
            extractedFiles.push({
              path: relativePath,
              content: `// [TRUNCATED] File content too large (${content.length} chars). Path: ${relativePath}`
            });
          } else {
            extractedFiles.push({
              path: relativePath,
              content: content
            });
          }
        }).catch((err: any) => {
          console.warn(`Failed to read ${relativePath}`, err);
        });

        filePromises.push(promise);
      });

      await Promise.all(filePromises);
      resolve(extractedFiles);
    }).catch((err: any) => {
      reject(err);
    });
  });
};

export const formatContextForPrompt = (files: ExtractedFile[]): string => {
  let context = "以下は現在のLaravelプロジェクトのファイル構造と内容の一部です。これをコンテキストとして使用してください。\n\n";
  
  files.forEach(f => {
    context += `--- FILE: ${f.path} ---\n`;
    context += `${f.content}\n`;
    context += `--- END FILE ---\n\n`;
  });

  return context;
};