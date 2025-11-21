
import React, { useState, useEffect, useRef } from 'react';
import { Content } from "@google/genai";
import { Message, Sender, Project, ExtractedFile, AnalysisType } from './types';
import { sendMessageStream, generateStaticAnalysis } from './services/geminiService';
import { extractProjectFiles, formatContextForPrompt } from './services/zipService';
import { getAllProjects, saveProject, deleteProject } from './services/db';
import ProjectList from './components/ProjectList';
import MarkdownRenderer from './components/MarkdownRenderer';

const App: React.FC = () => {
  // -- State --
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  
  // Settings State
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('gemini-2.5-flash'); // Default model
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Refs for scrolling and state access
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for persistence (to avoid stale closures during switches)
  const messagesRef = useRef<Message[]>([]);
  const filesRef = useRef<ExtractedFile[]>([]);

  // Ref for aborting requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // -- Effects --

  // Initial Data Load from DB & LocalStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load API Key
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) {
          setApiKey(storedKey);
        } else {
          // If no key, open settings automatically
          setIsSettingsOpen(true);
        }

        // Load Model ID
        const storedModel = localStorage.getItem('gemini_model_id');
        if (storedModel) {
          setModelId(storedModel);
        }

        // Load Projects
        const loadedProjects = await getAllProjects();
        setProjects(loadedProjects);
      } catch (e) {
        console.error("Failed to initialize app data", e);
      } finally {
        setIsAppLoading(false);
      }
    };
    loadData();
  }, []);

  // Sync state to refs
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    filesRef.current = extractedFiles;
  }, [extractedFiles]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // -- Handlers --

  const saveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model_id', modelId);
    setIsSettingsOpen(false);
  };

  // Helper to get the up-to-date object of the current project and save to DB
  const saveCurrentProjectToDb = async () => {
    if (!currentProjectId) return;
    
    // Find current project metadata
    const currentProjectMeta = projects.find(p => p.id === currentProjectId);
    if (!currentProjectMeta) return;

    const updatedProject: Project = {
      ...currentProjectMeta,
      savedMessages: messagesRef.current,
      savedFiles: filesRef.current,
      filesLoadedCount: filesRef.current.length
    };

    // Save to DB
    await saveProject(updatedProject);
    
    // Update State List
    setProjects(prev => prev.map(p => 
      p.id === currentProjectId ? updatedProject : p
    ));
    
    return updatedProject;
  };

  const createNewProject = async () => {
    // Save previous if exists
    await saveCurrentProjectToDb();

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: `Project ${projects.length + 1}`,
      createdAt: Date.now(),
      savedMessages: [],
      savedFiles: []
    };

    // Initialize new state
    const initialMsg = {
      id: 'welcome',
      text: '新しいプロジェクトを作成しました。ZIPファイルをアップロードして解析を開始するか、Laravelについて質問してください。',
      sender: Sender.AI,
      timestamp: Date.now()
    };
    
    newProject.savedMessages = [initialMsg];

    // Save to DB
    await saveProject(newProject);

    setProjects(prev => [newProject, ...prev]);
    
    // Switch context
    setCurrentProjectId(newProject.id);
    setMessages([initialMsg]);
    setExtractedFiles([]);
    setIsSidebarOpen(false);
  };

  const handleSelectProject = async (id: string) => {
    if (id === currentProjectId) return;

    // 1. Save current project state
    await saveCurrentProjectToDb();

    // 2. Load new project state from list (which is synced with DB on load/save)
    const targetProject = projects.find(p => p.id === id);
    if (targetProject) {
      setCurrentProjectId(id);
      setMessages(targetProject.savedMessages || []);
      setExtractedFiles(targetProject.savedFiles || []);
    }
    
    setIsSidebarOpen(false);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) {
      setCurrentProjectId(null);
      setMessages([]);
      setExtractedFiles([]);
    }
  };

  const handleRenameProject = async (id: string, newName: string) => {
    // Update in DB
    const project = projects.find(p => p.id === id);
    if (project) {
      const updated = { ...project, name: newName };
      await saveProject(updated);
      
      setProjects(prev => prev.map(p => 
        p.id === id ? updated : p
      ));
    }
  };

  const handleMergeProjects = async (selectedProjectIds: string[], newName: string) => {
    if (selectedProjectIds.length < 2) return;

    // Save current state first to ensure we have latest data
    await saveCurrentProjectToDb();

    // We must read from projects state which should be up to date
    const sources = selectedProjectIds.map(id => {
      const p = projects.find(proj => proj.id === id);
      // If it's the currently active project, use the refs to be absolutely sure
      if (id === currentProjectId) {
        return {
          messages: messagesRef.current,
          files: filesRef.current
        };
      }
      return {
        messages: p?.savedMessages || [],
        files: p?.savedFiles || []
      };
    });

    // Merge Files (Deduplicate by path)
    const fileMap = new Map<string, ExtractedFile>();
    sources.forEach(source => {
      source.files.forEach(f => fileMap.set(f.path, f));
    });
    const mergedFiles = Array.from(fileMap.values());

    // Merge Messages (Sort by timestamp)
    let mergedMessages: Message[] = [];
    sources.forEach(source => {
      mergedMessages = [...mergedMessages, ...source.messages];
    });
    mergedMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    const mergeMarker: Message = {
      id: crypto.randomUUID(),
      text: `--- プロジェクト結合: ${selectedProjectIds.length}個のプロジェクト履歴を統合しました ---`,
      sender: Sender.SYSTEM,
      timestamp: Date.now()
    };
    mergedMessages.push(mergeMarker);

    // Create New Project
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: newName || `Merged Project ${projects.length + 1}`,
      createdAt: Date.now(),
      savedMessages: mergedMessages,
      savedFiles: mergedFiles,
      filesLoadedCount: mergedFiles.length
    };

    await saveProject(newProject);

    setProjects(prev => [newProject, ...prev]);
    
    // Switch to new project
    setCurrentProjectId(newProject.id);
    setMessages(mergedMessages);
    setExtractedFiles(mergedFiles);
    setIsSidebarOpen(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!currentProjectId) {
      alert("まずはプロジェクトを作成または選択してください。");
      return;
    }

    setIsLoading(true);
    const loadingMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: loadingMsgId,
      text: `📂 ${file.name} を解析中...`,
      sender: Sender.SYSTEM,
      timestamp: Date.now()
    }]);

    try {
      const files = await extractProjectFiles(file);
      setExtractedFiles(files);
      
      // Update local refs immediately for saving
      filesRef.current = files;

      // Update messages
      const successMsg = {
        id: crypto.randomUUID(),
        text: `✅ 解析完了: ${files.length} 個のファイルを読み込みました。\n\n以後の質問は、この ${file.name} のコードをベースに回答します。`,
        sender: Sender.SYSTEM,
        timestamp: Date.now()
      };

      setMessages(prev => {
        const newMsgs = prev.filter(m => m.id !== loadingMsgId).concat(successMsg);
        messagesRef.current = newMsgs; // Sync ref
        return newMsgs;
      });
      
      // Trigger Save to DB
      const projectToSave = projects.find(p => p.id === currentProjectId);
      if (projectToSave) {
        const updatedProject = {
          ...projectToSave,
          // Only update name if it's the default name or explicitly requested. 
          // For now, let's keep the project name unless it's "Project X".
          name: projectToSave.name.startsWith('Project ') ? file.name.replace('.zip', '') : projectToSave.name,
          filesLoadedCount: files.length,
          savedFiles: files,
          savedMessages: [...messages.filter(m => m.id !== loadingMsgId), successMsg] 
        };
        await saveProject(updatedProject);
        setProjects(prev => prev.map(p => p.id === currentProjectId ? updatedProject : p));
      }

    } catch (error: any) {
      setMessages(prev => prev.filter(m => m.id !== loadingMsgId).concat({
        id: crypto.randomUUID(),
        text: `❌ エラー: ファイルの読み込みに失敗しました。\n${error.message}`,
        sender: Sender.SYSTEM,
        timestamp: Date.now()
      }));
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    }
  };

  // Helper to format error message
  const formatError = (error: any): string => {
    const msg = error?.message || '';
    if (msg.includes('Aborted') || msg.name === 'AbortError') {
      return '🛑 生成を中断しました。';
    }
    if (msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return '⚠️ API利用制限に達しました。\n設定から「Gemini 2.5 Flash」に切り替えるか、しばらく待ってから再試行してください。';
    }
    return `エラーが発生しました: ${msg}`;
  };

  // Estimate processing time based on context and model
  const calculateEstimate = (model: string, fileCount: number): string => {
    const isPro = model.includes('pro');
    
    // Base Latency: Flash ~2s, Pro ~5s
    let minSec = isPro ? 5 : 2;
    let maxSec = isPro ? 10 : 5;

    // File Factor: ~0.1s per file (Flash), ~0.3s per file (Pro) for prompt processing
    const fileFactor = isPro ? 0.3 : 0.1;
    
    if (fileCount > 0) {
      const additional = Math.ceil(fileCount * fileFactor);
      minSec += additional;
      maxSec += additional * 1.5; // Probing for longer output
    }

    return `約 ${Math.ceil(minSec)} 〜 ${Math.ceil(maxSec)} 秒`;
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      
      // Update the last message to reflect cancellation
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.isThinking) {
           return prev.map(m => m.id === lastMsg.id ? {
             ...m,
             text: '🛑 ユーザーにより中断されました。',
             isThinking: false,
             estimatedTime: undefined
           } : m);
        }
        return prev;
      });
    }
  };

  const runAnalysis = async (type: AnalysisType) => {
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }
    if (extractedFiles.length === 0) {
      alert("解析対象のファイルがありません。ZIPファイルをアップロードしてください。");
      return;
    }

    setIsLoading(true);
    abortControllerRef.current = new AbortController();
    
    const tempId = crypto.randomUUID();
    let prompt = "";
    let label = "";

    switch (type) {
      case AnalysisType.UNUSED_CHECK:
        label = "未使用コードの検出";
        prompt = "提供されたファイルコンテキストに基づき、使用されていない可能性のあるコントローラーメソッド、モデルのプロパティ、またはViewファイルを特定してください。確信度が高いもののみをリストアップしてください。";
        break;
      case AnalysisType.CODE_REVIEW:
        label = "コードレビュー";
        prompt = "プロジェクト全体を通して、可読性が低い、またはLaravelのベストプラクティス（DI、Eloquent、Collectionなど）に反している箇所を指摘し、リファクタリング案を提示してください。";
        break;
      case AnalysisType.SECURITY_CHECK:
        label = "セキュリティチェック";
        prompt = "SQLインジェクション、XSS、CSRF、またはハードコードされた認証情報の可能性がないかチェックしてください。";
        break;
      default:
        label = "解析";
        prompt = "プロジェクトの全体的な品質を評価してください。";
    }

    const estimate = calculateEstimate(modelId, extractedFiles.length) + " (解析モード)";

    setMessages(prev => [...prev, {
      id: tempId,
      text: `🔍 ${label}を実行中...`,
      sender: Sender.SYSTEM,
      timestamp: Date.now(),
      isThinking: true,
      estimatedTime: estimate
    }]);

    try {
      const contextStr = formatContextForPrompt(extractedFiles);
      // Note: Static analysis is not streamed in current implementation, so we can't break mid-stream easily
      // but we can check signal after result. Ideally service should support signal.
      // We check abort state after await.
      const result = await generateStaticAnalysis(apiKey, modelId, contextStr, prompt);
      
      if (abortControllerRef.current?.signal.aborted) {
         throw new Error("Aborted");
      }

      if (result) {
        setMessages(prev => {
          const newMsgs = prev.filter(m => m.id !== tempId).concat({
            id: crypto.randomUUID(),
            text: result,
            sender: Sender.AI,
            timestamp: Date.now()
          });
          return newMsgs;
        });
        setTimeout(saveCurrentProjectToDb, 500);
      }
    } catch (error: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId).concat({
        id: crypto.randomUUID(),
        text: formatError(error),
        sender: Sender.SYSTEM,
        timestamp: Date.now()
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      text: input,
      sender: Sender.USER,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    
    // Create AbortController
    abortControllerRef.current = new AbortController();

    // Calculate Estimate
    const estimate = calculateEstimate(modelId, extractedFiles.length);

    try {
      const history: Content[] = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      let messageToSend = input;
      if (extractedFiles.length > 0 && messages.filter(m => m.sender === Sender.USER).length === 0) {
         const context = formatContextForPrompt(extractedFiles);
         messageToSend = `${context}\n\nユーザーの質問: ${input}`;
      }

      const aiMsgId = crypto.randomUUID();
      
      setMessages(prev => [...prev, {
        id: aiMsgId,
        text: '',
        sender: Sender.AI,
        timestamp: Date.now(),
        isThinking: true,
        estimatedTime: estimate
      }]);

      const streamResponse = await sendMessageStream(apiKey, modelId, history, messageToSend);
      
      let fullText = '';
      
      for await (const chunk of streamResponse) {
        // Check cancellation in loop
        if (abortControllerRef.current?.signal.aborted) {
           break; 
        }

        const text = chunk.text || '';
        fullText += text;
        
        setMessages(prev => prev.map(m => 
          m.id === aiMsgId ? { ...m, text: fullText, isThinking: false, estimatedTime: undefined } : m
        ));
      }
      
      if (abortControllerRef.current?.signal.aborted) {
         throw new Error("Aborted");
      }
      
      setTimeout(() => {
        saveCurrentProjectToDb();
      }, 500);

    } catch (error: any) {
      setMessages(prev => {
          // If error is explicit abort, we might have already handled it or caught here
          const isAbort = error.message === 'Aborted' || error.name === 'AbortError';
          
          // Filter out the empty thinking message if it failed completely (except abort which we want to show as stopped)
          const filtered = prev.filter(m => !(m.sender === Sender.AI && m.text === '' && m.isThinking));
          
          return [...filtered, {
            id: crypto.randomUUID(),
            text: formatError(error),
            sender: isAbort ? Sender.AI : Sender.SYSTEM,
            timestamp: Date.now()
          }];
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownloadResponse = (content: string) => {
    try {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      const date = new Date();
      const timestamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `laravel-assist-response-${timestamp}.md`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert('ダウンロードに失敗しました。');
    }
  };

  if (isAppLoading) {
    return (
      <div className="flex h-screen bg-slate-900 items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              設定
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Gemini API Key
                </label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">
                    Google AI Studioでキーを取得
                  </a>
                  <span className="ml-2 text-slate-600">※従量課金設定を推奨</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  使用モデル
                </label>
                <div className="relative">
                  <select 
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm appearance-none"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (高速・低コスト・推奨)</option>
                    <option value="gemini-3-pro-preview">Gemini 3.0 Pro (高精度・高コスト)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>
                </div>
                <p className={`text-xs mt-2 leading-relaxed ${modelId.includes('pro') ? 'text-amber-400' : 'text-slate-500'}`}>
                  {modelId.includes('pro') 
                    ? '※ ProモデルはFlashの約20〜40倍のコストがかかる場合があります。長時間のチャットや大容量ファイルの解析では、従量課金が高額になる可能性があるためご注意ください。'
                    : '※ Flashモデルは非常に安価（100万トークン数十円程度）で、日常的な開発支援に最適です。'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
               {/* Allow close if key exists */}
              {localStorage.getItem('gemini_api_key') && (
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  キャンセル
                </button>
              )}
              <button 
                onClick={saveSettings}
                disabled={!apiKey.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <ProjectList 
          projects={projects}
          currentProjectId={currentProjectId}
          onSelectProject={handleSelectProject}
          onNewProject={createNewProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onMergeProjects={handleMergeProjects}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 w-full relative">
        {/* Header */}
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 bg-slate-900/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
             {/* Hamburger Menu (Mobile Only) */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden text-slate-400 hover:text-white p-1 -ml-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1 className="font-semibold text-lg text-indigo-400 flex items-center gap-2 truncate">
              <svg className="w-5 h-5 shrink-0 hidden xs:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="truncate">
                {currentProjectId ? projects.find(p => p.id === currentProjectId)?.name : 'Laravel Dev Assist'}
              </span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
             {/* Settings Button */}
             <button
               onClick={() => setIsSettingsOpen(true)}
               className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
               title="設定 (API Key / Model)"
             >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
               </svg>
             </button>

             {currentProjectId && (
                 <label className={`cursor-pointer flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap hidden md:flex
                   ${isLoading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-600/30'}`}>
                   <input 
                     type="file" 
                     accept=".zip" 
                     className="hidden" 
                     ref={fileInputRef}
                     onChange={handleFileUpload}
                     disabled={isLoading}
                   />
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                   </svg>
                   <span className="hidden lg:inline">プロジェクト読込</span>
                 </label>
             )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0f172a]">
          {!currentProjectId ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60 px-4 text-center">
              <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <p>左上のメニューからプロジェクトを作成してください</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.sender === Sender.USER ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[95%] md:max-w-[85%] rounded-2xl px-4 py-3 md:px-5 md:py-4 shadow-sm
                      ${msg.sender === Sender.USER 
                        ? 'bg-indigo-600 text-white rounded-br-sm' 
                        : msg.sender === Sender.SYSTEM
                          ? 'bg-slate-800 border border-slate-700 text-slate-300 w-full max-w-full font-mono text-xs'
                          : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm'
                      }`}
                  >
                    {msg.sender === Sender.AI || msg.sender === Sender.SYSTEM ? (
                      <MarkdownRenderer content={msg.text} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                    )}
                    
                    {msg.isThinking && (
                       <div className="flex items-center justify-between gap-4 mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                          <div className="flex flex-col gap-1">
                             <div className="flex items-center gap-2 text-slate-400 text-sm">
                                <div className="flex gap-1">
                                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                                <span className="animate-pulse font-medium text-indigo-300">AIが思考中...</span>
                             </div>
                             {msg.estimatedTime && (
                               <div className="text-xs text-slate-500 pl-1">
                                 予測完了時間: {msg.estimatedTime}
                               </div>
                             )}
                          </div>
                          
                          <button 
                            onClick={stopGeneration}
                            className="flex items-center gap-1 px-2 py-1 bg-red-900/30 hover:bg-red-900/50 border border-red-700/30 text-red-300 text-xs rounded transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                            </svg>
                            停止
                          </button>
                       </div>
                    )}

                    {msg.sender === Sender.AI && !msg.isThinking && msg.text && !msg.text.includes('中断されました') && (
                      <div className="flex justify-end mt-3 pt-2 border-t border-slate-700/50">
                        <button
                          onClick={() => handleDownloadResponse(msg.text)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 transition-colors group"
                          title="Markdownとして保存"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4h12" transform="rotate(180 12 12)" />
                          </svg>
                          <span className="opacity-70 group-hover:opacity-100">Markdown保存</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {currentProjectId && (
          <div className="p-3 md:p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            {/* Analysis Shortcuts (Above Input) */}
             {extractedFiles.length > 0 && (
               <div className="flex gap-2 mb-2 px-1 overflow-x-auto md:hidden">
                 <button 
                   onClick={() => runAnalysis(AnalysisType.UNUSED_CHECK)} 
                   disabled={isLoading} 
                   className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 whitespace-nowrap"
                 >
                   未使用コード
                 </button>
                 <button 
                   onClick={() => runAnalysis(AnalysisType.CODE_REVIEW)} 
                   disabled={isLoading} 
                   className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 whitespace-nowrap"
                 >
                   レビュー
                 </button>
               </div>
             )}

            <div className="max-w-4xl mx-auto relative">
              <button
                onClick={() => chatFileInputRef.current?.click()}
                disabled={isLoading}
                className="absolute left-3 bottom-3 p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition-colors"
                title="ZIPファイルを添付"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                 </svg>
              </button>
              <input 
                 type="file" 
                 accept=".zip" 
                 className="hidden" 
                 ref={chatFileInputRef}
                 onChange={handleFileUpload}
                 disabled={isLoading}
              />

              <textarea
                className="w-full bg-slate-800 text-slate-200 rounded-xl border border-slate-700 p-3 md:p-4 pl-14 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none shadow-lg text-sm md:text-base"
                rows={1}
                placeholder={apiKey ? "Laravelについて質問..." : "まずは設定からAPIキーを入力してください"}
                value={input}
                onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                    }
                }}
                disabled={isLoading || !apiKey}
                style={{ minHeight: '48px', maxHeight: '150px' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading || !apiKey}
                className="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
