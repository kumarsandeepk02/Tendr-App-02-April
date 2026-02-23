import React, { useState } from 'react';
import { ProjectMeta } from '../types';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
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

const SidebarProjectItem: React.FC<{
  project: ProjectMeta;
  isActive: boolean;
  isCollapsed: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ project, isActive, isCollapsed, disabled, onSelect, onDelete }) => {
  const [hovering, setHovering] = useState(false);

  if (isCollapsed) {
    return (
      <button
        onClick={onSelect}
        disabled={disabled && !isActive}
        title={project.title}
        className={`w-full flex items-center justify-center py-2 mb-1 rounded-lg transition-colors ${
          isActive
            ? 'bg-indigo-50 text-indigo-700'
            : disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            isActive
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {project.title.charAt(0).toUpperCase()}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onSelect}
      disabled={disabled && !isActive}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-full text-left px-3 py-2.5 mb-1 rounded-lg transition-colors group relative ${
        isActive
          ? 'bg-indigo-50 border-l-2 border-indigo-600 pl-2.5'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-gray-50 border-l-2 border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium truncate ${
              isActive ? 'text-indigo-900' : 'text-gray-800'
            }`}
          >
            {project.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                project.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {project.status === 'completed' ? 'Completed' : 'Draft'}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </div>

        {hovering && !isActive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Delete project"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </button>
  );
};

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
  return (
    <aside
      className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } px-3 py-3 border-b border-gray-100`}
      >
        {!isCollapsed && (
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Projects
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
      </div>

      {/* New Project Button */}
      <div className="px-2 py-2">
        {isCollapsed ? (
          <button
            onClick={onNewProject}
            disabled={isGenerating}
            className="w-full flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="New Project"
          >
            <Plus size={16} />
          </button>
        ) : (
          <button
            onClick={onNewProject}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            New Project
          </button>
        )}
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {projects.length === 0 ? (
          <div className="text-center py-8">
            <FileText
              size={24}
              className="mx-auto mb-2 text-gray-300"
            />
            {!isCollapsed && (
              <p className="text-xs text-gray-400">No projects yet</p>
            )}
          </div>
        ) : (
          projects.map((project) => (
            <SidebarProjectItem
              key={project.id}
              project={project}
              isActive={project.id === activeProjectId}
              isCollapsed={isCollapsed}
              disabled={isGenerating}
              onSelect={() => onSelectProject(project.id)}
              onDelete={() => onDeleteProject(project.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
