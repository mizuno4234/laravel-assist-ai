
import React, { useState, useRef } from 'react';
import { Project } from '../types';

interface ProjectListProps {
  projects: Project[];
  currentProjectId: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onMergeProjects: (selectedIds: string[], newName: string) => void;
  onExportProject: (id: string) => void;
  onImportProject: (file: File) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, 
  currentProjectId, 
  onSelectProject, 
  onNewProject,
  onDeleteProject,
  onRenameProject,
  onMergeProjects,
  onExportProject,
  onImportProject
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  
  // Merge Modal State
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState('');

  const startEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingId(project.id);
    setEditName(project.name);
    setDeleteConfirmId(null);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onRenameProject(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setDeleteConfirmId(project.id);
    setEditingId(null);
  };

  const executeDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteProject(id);
    setDeleteConfirmId(null);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const handleExportClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onExportProject(id);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportProject(file);
    }
    e.target.value = ''; // Reset
  };

  // Merge Handlers
  const openMergeModal = () => {
    if (projects.length < 2) {
      alert('結合するには少なくとも2つのプロジェクトが必要です。');
      return;
    }
    setSelectedMergeIds([]);
    setMergeName('');
    setIsMergeModalOpen(true);
  };

  const toggleMergeSelection = (id: string) => {
    setSelectedMergeIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const executeMerge = () => {
    if (selectedMergeIds.length < 2) return;
    onMergeProjects(selectedMergeIds, mergeName.trim());
    setIsMergeModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-64">
      <div className="p-4 border-b border-slate-800 flex flex-col gap-2">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md transition-colors text-sm font-medium shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新規プロジェクト
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={openMergeModal}
            disabled={projects.length < 2}
            className={`flex-1 flex items-center justify-center gap-1 bg-slate-800 border border-slate-700 text-slate-300 py-1.5 px-2 rounded-md text-xs font-medium shadow-sm transition-colors
              ${projects.length < 2 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 hover:text-white'}`}
            title="プロジェクト結合"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            結合
          </button>
          
          <button
            onClick={handleImportClick}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-800 border border-slate-700 text-slate-300 py-1.5 px-2 rounded-md text-xs font-medium shadow-sm transition-colors hover:bg-slate-700 hover:text-white"
            title="JSONからインポート"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            復元
          </button>
          <input 
            type="file" 
            accept=".json" 
            ref={importInputRef} 
            className="hidden" 
            onChange={handleFileChange}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.length === 0 && (
          <div className="text-slate-500 text-xs text-center mt-8 px-4 leading-relaxed">
            プロジェクトがありません。<br/>新規作成または復元してください。
          </div>
        )}
        
        {projects.map((project) => {
          // 1. Delete Confirmation Mode
          if (deleteConfirmId === project.id) {
            return (
              <div key={project.id} className="w-full px-3 py-2 bg-red-900/30 border border-red-500/30 rounded-md flex items-center justify-between animate-pulse-once">
                <span className="text-xs text-red-200 font-bold">削除しますか？</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => executeDelete(e, project.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded font-medium transition-colors shadow-sm whitespace-nowrap"
                  >
                    はい
                  </button>
                  <button 
                    onClick={cancelDelete}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          }

          // 2. Editing Mode
          if (editingId === project.id) {
            return (
               <div key={project.id} className="w-full flex items-center p-1.5 bg-slate-800 rounded-md">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="w-full bg-slate-900 border border-indigo-500 rounded px-2 py-1.5 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            );
          }

          // 3. Standard Mode
          return (
            <div 
              key={project.id}
              className={`group relative w-full flex items-center rounded-md text-sm transition-all duration-200
                ${currentProjectId === project.id 
                  ? 'bg-slate-800 shadow-sm' 
                  : 'hover:bg-slate-800/50'}`}
            >
              <button
                onClick={() => onSelectProject(project.id)}
                className={`flex-1 text-left px-3 py-3 truncate outline-none ${currentProjectId === project.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}
              >
                <div className="font-medium truncate pr-1">{project.name}</div>
                <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                  {project.filesLoadedCount ? (
                    <span className="bg-slate-700/50 px-1.5 py-0.5 rounded text-[10px] text-slate-500">
                      {project.filesLoadedCount} files
                    </span>
                  ) : null}
                </div>
              </button>

              {/* Action Buttons */}
              <div className="flex items-center pr-1 z-10 shrink-0 gap-0.5">
                 <button
                  onClick={(e) => handleExportClick(e, project.id)}
                  className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700/50 rounded transition-colors"
                  title="エクスポート"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4h12" transform="rotate(180 12 12)" />
                  </svg>
                </button>
                <button
                  onClick={(e) => startEdit(e, project)}
                  className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-700/50 rounded transition-colors"
                  title="名前を変更"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                   </svg>
                </button>
                <button
                  onClick={(e) => handleDeleteClick(e, project)}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded transition-colors"
                  title="削除"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                   </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800 text-[10px] text-slate-600 text-center leading-tight">
        Laravel Dev Assist<br/>Powered by Gemini 3.0
      </div>

      {/* Merge Projects Modal */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">プロジェクト結合</h3>
              <p className="text-xs text-slate-400 mt-1">結合するプロジェクトを選択してください（2つ以上）</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {projects.map(project => (
                <label 
                  key={project.id} 
                  className={`flex items-center p-3 rounded-md border cursor-pointer transition-colors
                    ${selectedMergeIds.includes(project.id) 
                      ? 'bg-indigo-900/30 border-indigo-500/50' 
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedMergeIds.includes(project.id)}
                    onChange={() => toggleMergeSelection(project.id)}
                    className="w-4 h-4 text-indigo-600 bg-slate-700 border-slate-600 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-medium text-slate-200">{project.name}</div>
                    <div className="text-xs text-slate-500">
                      {project.filesLoadedCount || 0} files • {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900 rounded-b-lg">
              <div>
                <label className="block text-xs text-slate-400 mb-1">新しいプロジェクト名</label>
                <input 
                  type="text" 
                  value={mergeName}
                  onChange={(e) => setMergeName(e.target.value)}
                  placeholder="Merged Project"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsMergeModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
                >
                  キャンセル
                </button>
                <button 
                  onClick={executeMerge}
                  disabled={selectedMergeIds.length < 2}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-900/20"
                >
                  結合する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
