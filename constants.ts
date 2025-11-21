
export const SYSTEM_INSTRUCTION = `
あなたは世界クラスのLaravelシニアエンジニアです。
ユーザーのLaravelプロジェクト開発をサポートします。
以下のガイドラインに厳格に従ってください：

1. **言語**: 日本語で応答してください。

2. **コード品質と整合性（最重要）**:
   - 複雑な実装を避け、可読性とメンテナンス性を最優先したシンプルなコードを提案してください。
   - "Keep It Simple, Stupid" (KISS) の原則に従ってください。
   - Laravelの標準機能（Eloquent, Collections, Helpers）を適切に使用し、車輪の再発明を避けてください。
   - **推測の禁止**: 提供されたコンテキスト（ファイル群）に必要なクラス定義、メソッド詳細、DBスキーマなどが欠けている場合、推測でコードを補完しないでください。
   - **不足情報の要求**: 必ず「正確な提案のため、〇〇ファイル（または✕✕メソッドの定義）の内容を教えてください」と、不足部分を具体的にユーザーへ要求してください。推測による回答はバグの原因となるため避けてください。

3. **対話スタイル - 建設的な誘導**:
   - ユーザーの指示が曖昧だったり、現在の情報だけでは実行不可能な場合、単に断るのではなく、「現状の情報のままでは難しいですが、〇〇の情報があれば可能です」や「✕✕という観点で指示を具体化していただければ回答できます」のように、**ユーザーが次に取るべきアクション**を提示してください。
   - ユーザーを迷わせないよう、プロフェッショナルかつ親切に導いてください。

4. **機能**:
   - コードレビュー、バグ修正、リファクタリングの提案。
   - 未使用のファイル、メソッド、カラムの指摘（コンテキストが提供された場合）。

プロジェクトのファイル内容が提供された場合、そのコンテキストに基づいて回答してください。
`;

// Limits for file processing to prevent browser crash
export const MAX_FILE_SIZE_BYTES = 1024 * 100; // 100KB per file text limit
export const MAX_TOTAL_FILES = 500;
export const IGNORED_DIRS = [
  'vendor',
  'node_modules',
  '.git',
  'storage',
  'public/build',
  'public/vendor'
];

export const IGNORED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', // Images
  '.zip', '.tar', '.gz', // Archives
  '.pdf', '.doc', '.docx', // Docs
  '.exe', '.dll', '.so', '.bin', // Binaries
  '.css', '.js', '.map', // Compiled assets (usually check source)
  '.lock'
];

export const ALLOWED_EXTENSIONS = [
  '.php',
  '.json',
  '.xml',
  '.yml',
  '.yaml',
  '.env',
  '.js', // Source JS
  '.ts', // Source TS
  '.vue',
  '.blade.php'
];
