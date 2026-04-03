import React, { useState } from 'react';
import { ProjectMeta, FolderMeta } from '../types';
import {
  Trash2,
  Settings,
  HelpCircle,
  User,
  FileText,
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';

interface SidebarProps {
  projects: ProjectMeta[];
  folders: FolderMeta[];
  activeProjectId: string | null;
  isCollapsed: boolean;
  isGenerating: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onNewDocument: (folderId?: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const Sidebar: React.FC<SidebarProps> = ({
  projects,
  folders,
  activeProjectId,
  isCollapsed,
  isGenerating,
  onToggleCollapse,
  onSelectProject,
  onNewProject,
  onNewDocument,
  onDeleteProject,
  onDeleteFolder,
  onRenameFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tendr_expanded_folders');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      localStorage.setItem('tendr_expanded_folders', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Group documents by folder
  const folderDocs = new Map<string, ProjectMeta[]>();
  const standaloneDocs: ProjectMeta[] = [];

  for (const p of projects) {
    if (p.folderId) {
      const list = folderDocs.get(p.folderId) || [];
      list.push(p);
      folderDocs.set(p.folderId, list);
    } else {
      standaloneDocs.push(p);
    }
  }

  return (
    <aside className="flex flex-col h-full w-56 bg-slate-50 border-r border-slate-200/60 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-6">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
          <FileText size={16} />
        </div>
        <div>
          <h2 className="font-[Manrope] font-bold text-slate-900 text-sm leading-none">Tendr</h2>
          <p className="text-[9px] uppercase tracking-[0.15em] text-slate-400 mt-0.5">Procurement AI</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-3 mb-4 flex gap-2">
        <button
          onClick={onNewProject}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-indigo-600 font-medium text-xs bg-white rounded-lg border border-slate-200/60 hover:shadow-sm transition-all disabled:opacity-40"
          title="New Project"
        >
          <FolderPlus size={14} />
          <span>Project</span>
        </button>
        <button
          onClick={() => onNewDocument()}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-indigo-600 font-medium text-xs bg-white rounded-lg border border-slate-200/60 hover:shadow-sm transition-all disabled:opacity-40"
          title="New Document"
        >
          <FilePlus size={14} />
          <span>Document</span>
        </button>
      </div>

      {/* Folder + Document List */}
      <div className="flex-1 overflow-y-auto px-3">
        {/* Folders */}
        {folders.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 px-3 mb-2">
              Projects
            </h3>
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  documents={folderDocs.get(folder.id) || []}
                  isExpanded={expandedFolders.has(folder.id)}
                  activeProjectId={activeProjectId}
                  isGenerating={isGenerating}
                  onToggle={() => toggleFolder(folder.id)}
                  onSelectProject={onSelectProject}
                  onDeleteProject={onDeleteProject}
                  onNewDocument={() => onNewDocument(folder.id)}
                  onDeleteFolder={() => onDeleteFolder(folder.id)}
                  onRenameFolder={(name) => onRenameFolder(folder.id, name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Standalone Documents */}
        <div>
          <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 px-3 mb-2">
            {folders.length > 0 ? 'Documents' : 'Recent Documents'}
          </h3>
          <div className="space-y-0.5">
            {standaloneDocs.length === 0 && folders.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">No documents yet</p>
            )}
            {standaloneDocs.map((project) => (
              <SidebarDocItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                disabled={isGenerating}
                onSelect={() => onSelectProject(project.id)}
                onDelete={() => onDeleteProject(project.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-200/60 space-y-0.5">
        <FooterLink icon={<Settings size={16} />} label="Settings" />
        <FooterLink icon={<HelpCircle size={16} />} label="Support" />
        <FooterLink icon={<User size={16} />} label="Account" />
      </div>
    </aside>
  );
};

// ── Folder Item ──────────────────────────────────────────────────────────────

const SidebarFolderItem: React.FC<{
  folder: FolderMeta;
  documents: ProjectMeta[];
  isExpanded: boolean;
  activeProjectId: string | null;
  isGenerating: boolean;
  onToggle: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onNewDocument: () => void;
  onDeleteFolder: () => void;
  onRenameFolder: (name: string) => void;
}> = ({
  folder, documents, isExpanded, activeProjectId, isGenerating,
  onToggle, onSelectProject, onDeleteProject, onNewDocument, onDeleteFolder, onRenameFolder,
}) => {
  const [hovering, setHovering] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== folder.name) {
      onRenameFolder(renameValue.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/60 cursor-pointer group relative"
        onClick={onToggle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setShowMenu(false); }}
      >
        {isExpanded
          ? <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
          : <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
        }
        {isExpanded
          ? <FolderOpen size={14} className="text-indigo-500 flex-shrink-0" />
          : <FolderClosed size={14} className="text-slate-400 flex-shrink-0" />
        }

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-xs font-medium text-slate-800 bg-white border border-indigo-300 rounded px-1 py-0.5 outline-none min-w-0"
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-slate-700 truncate">
            {folder.name}
          </span>
        )}

        <span className="text-[10px] text-slate-400 flex-shrink-0">
          {documents.length}
        </span>

        {hovering && !isRenaming && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-0.5 text-slate-300 hover:text-slate-600 rounded transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-6 z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 w-36">
                <button
                  onClick={(e) => { e.stopPropagation(); onNewDocument(); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <FilePlus size={12} /> Add document
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(folder.name); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Pencil size={12} /> Rename
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteFolder(); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 size={12} /> Delete project
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nested documents */}
      {isExpanded && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {documents.length === 0 ? (
            <button
              onClick={onNewDocument}
              className="w-full text-left px-3 py-1.5 text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"
            >
              + Add a document
            </button>
          ) : (
            documents.map((doc) => (
              <SidebarDocItem
                key={doc.id}
                project={doc}
                isActive={doc.id === activeProjectId}
                disabled={isGenerating}
                compact
                onSelect={() => onSelectProject(doc.id)}
                onDelete={() => onDeleteProject(doc.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Document Item ────────────────────────────────────────────────────────────

const SidebarDocItem: React.FC<{
  project: ProjectMeta;
  isActive: boolean;
  disabled: boolean;
  compact?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ project, isActive, disabled, compact, onSelect, onDelete }) => {
  const [hovering, setHovering] = useState(false);

  return (
    <button
      onClick={onSelect}
      disabled={disabled && !isActive}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-full text-left px-3 ${compact ? 'py-1.5' : 'py-2'} rounded-lg transition-colors group relative ${
        isActive
          ? 'bg-white shadow-sm'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-white/60'
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-xs font-medium truncate ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
          {project.title}
        </span>
        {!compact && (
          <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
            {formatRelativeTime(project.updatedAt)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${
          project.status === 'completed' ? 'bg-green-500' : 'bg-slate-400'
        }`} />
        <span className={`text-[10px] font-semibold uppercase tracking-tight ${
          project.status === 'completed' ? 'text-green-600' : 'text-slate-400'
        }`}>
          {project.documentType} · {project.status === 'completed' ? 'Done' : 'Draft'}
        </span>
      </div>
      {hovering && !isActive && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete document"
        >
          <Trash2 size={12} />
        </button>
      )}
    </button>
  );
};

const FooterLink: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-slate-700 text-sm rounded-md transition-colors">
    {icon}
    <span>{label}</span>
  </button>
);

export default Sidebar;
