import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DocumentSection } from '../types';
import { ArrowLeft, PenLine, Save } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';

interface MasterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  sections: DocumentSection[];
  onSaveAll: (updates: { id: string; content: string }[]) => void;
  projectTitle: string;
  documentType: string;
}

const MasterEditor: React.FC<MasterEditorProps> = ({
  isOpen,
  onClose,
  sections,
  onSaveAll,
  projectTitle,
  documentType,
}) => {
  const [draftContents, setDraftContents] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Initialize drafts when opening
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      sections.forEach((s) => {
        initial[s.id] = s.content;
      });
      setDraftContents(initial);
      setIsDirty(false);
    }
  }, [isOpen, sections]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleContentChange = (id: string, content: string) => {
    setDraftContents((prev) => ({ ...prev, [id]: content }));
    setIsDirty(true);
  };

  const handleSaveAll = useCallback(() => {
    const updates = Object.entries(draftContents).map(([id, content]) => ({
      id,
      content,
    }));
    onSaveAll(updates);
    onClose();
  }, [draftContents, onSaveAll, onClose]);

  const handleCancel = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Keyboard shortcuts: Escape to close, Cmd/Ctrl+S to save
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveAll();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleCancel, handleSaveAll]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Editor panel */}
      <div className="relative bg-white w-full h-full flex flex-col master-editor-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <PenLine size={18} className="text-indigo-600" />
                Edit All Sections
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {projectTitle} &middot; {documentType}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!isDirty}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} />
              Save All Changes
            </button>
          </div>
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="max-w-3xl mx-auto space-y-6">
            {sections.map((section, index) => (
              <div
                key={section.id}
                className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-900">
                    {section.title}
                  </h3>
                  <span className="text-xs text-gray-400">
                    Section {index + 1} of {sections.length}
                  </span>
                </div>
                <TextareaAutosize
                  value={draftContents[section.id] ?? section.content}
                  onChange={(e) =>
                    handleContentChange(section.id, e.target.value)
                  }
                  minRows={6}
                  maxRows={30}
                  className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y font-mono leading-relaxed"
                  placeholder="Enter section content (Markdown supported)..."
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white shrink-0">
          <span className="text-xs text-gray-500">
            Editing {sections.length} section{sections.length !== 1 ? 's' : ''}
            {isDirty && (
              <span className="ml-2 text-amber-600 font-medium">
                &bull; Unsaved changes
              </span>
            )}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden sm:inline">
              ⌘S to save &middot; Esc to cancel
            </span>
            <button
              onClick={handleSaveAll}
              disabled={!isDirty}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} />
              Save All
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MasterEditor;
