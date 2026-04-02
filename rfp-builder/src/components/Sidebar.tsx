import React, { useState } from 'react';
import { ProjectMeta } from '../types';
import {
  Plus,
  Trash2,
  FolderKanban,
  Settings,
  HelpCircle,
  User,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  isCollapsed: boolean;
  isGenerating: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onDeleteProject: (projectId: string) => void;
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
  activeProjectId,
  isCollapsed,
  isGenerating,
  onToggleCollapse,
  onSelectProject,
  onNewProject,
  onDeleteProject,
}) => {
  // Always render expanded for the new design
  return (
    <aside className="flex flex-col h-full w-56 bg-slate-50 border-r border-slate-200/60 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-8">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
          <FileText size={16} />
        </div>
        <div>
          <h2 className="font-[Manrope] font-bold text-slate-900 text-sm leading-none">Tendr</h2>
          <p className="text-[9px] uppercase tracking-[0.15em] text-slate-400 mt-0.5">Procurement AI</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 mb-2">
        <button
          onClick={onNewProject}
          disabled={isGenerating}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-indigo-600 font-semibold text-sm bg-white rounded-lg shadow-sm border border-slate-200/60 hover:shadow-md transition-all disabled:opacity-40"
        >
          <FolderKanban size={16} />
          <span>Projects</span>
          <Plus size={14} className="ml-auto opacity-60" />
        </button>
      </nav>

      {/* Recent Projects */}
      <div className="flex-1 overflow-y-auto px-3 mt-4">
        <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 px-3 mb-3">
          Recent Projects
        </h3>
        <div className="space-y-1">
          {projects.length === 0 ? (
            <p className="text-xs text-slate-400 px-3 py-4 text-center">No projects yet</p>
          ) : (
            projects.slice(0, 8).map((project) => (
              <SidebarProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                disabled={isGenerating}
                onSelect={() => onSelectProject(project.id)}
                onDelete={() => onDeleteProject(project.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer links */}
      <div className="px-3 py-4 border-t border-slate-200/60 space-y-0.5">
        <FooterLink icon={<Settings size={16} />} label="Settings" />
        <FooterLink icon={<HelpCircle size={16} />} label="Support" />
        <FooterLink icon={<User size={16} />} label="Account" />
      </div>
    </aside>
  );
};

const FooterLink: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-slate-700 text-sm rounded-md transition-colors">
    {icon}
    <span>{label}</span>
  </button>
);

const SidebarProjectItem: React.FC<{
  project: ProjectMeta;
  isActive: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ project, isActive, disabled, onSelect, onDelete }) => {
  const [hovering, setHovering] = useState(false);

  return (
    <button
      onClick={onSelect}
      disabled={disabled && !isActive}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors group relative ${
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
        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${
          project.status === 'completed' ? 'bg-green-500' : 'bg-slate-400'
        }`} />
        <span className={`text-[10px] font-semibold uppercase tracking-tight ${
          project.status === 'completed' ? 'text-green-600' : 'text-slate-400'
        }`}>
          {project.status === 'completed' ? 'Complete' : 'Draft'}
        </span>
      </div>
      {hovering && !isActive && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete project"
        >
          <Trash2 size={12} />
        </button>
      )}
    </button>
  );
};

export default Sidebar;
