
export enum Sender {
  USER = 'USER',
  AI = 'AI',
  SYSTEM = 'SYSTEM'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isThinking?: boolean;
  estimatedTime?: string; // "約 5〜10 秒"
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  fileContextSummary?: string; // Brief description of loaded files
  filesLoadedCount?: number;
  // Persistence fields
  savedMessages?: Message[];
  savedFiles?: ExtractedFile[];
}

export interface ExtractedFile {
  path: string;
  content: string;
}

export enum AnalysisType {
  GENERAL = 'GENERAL',
  UNUSED_CHECK = 'UNUSED_CHECK',
  CODE_REVIEW = 'CODE_REVIEW',
  SECURITY_CHECK = 'SECURITY_CHECK'
}
