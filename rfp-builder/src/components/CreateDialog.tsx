import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { FolderMeta } from '../types';

interface CreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'folder' | 'document';
  folders?: FolderMeta[];
  preselectedDocType?: string;
  preselectedFolderId?: string;
  onCreateFolder?: (name: string, description?: string) => void;
  onCreateDocument?: (title: string, documentType: string, folderId?: string) => void;
}

const CreateDialog: React.FC<CreateDialogProps> = ({
  isOpen,
  onClose,
  mode,
  folders = [],
  preselectedDocType,
  preselectedFolderId,
  onCreateFolder,
  onCreateDocument,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [docType, setDocType] = useState(preselectedDocType || 'RFP');
  const [folderId, setFolderId] = useState(preselectedFolderId || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setDocType(preselectedDocType || 'RFP');
      setFolderId(preselectedFolderId || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, preselectedDocType, preselectedFolderId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (mode === 'folder') {
      onCreateFolder?.(name.trim(), description.trim() || undefined);
    } else {
      onCreateDocument?.(name.trim(), docType, folderId || undefined);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === 'folder' ? 'New Project' : 'New Document'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {mode === 'folder' ? 'Project Name' : 'Document Name'}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'folder' ? 'e.g. Q1 Procurement' : 'e.g. Cloud Migration RFP'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
            />
          </div>

          {mode === 'folder' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Description <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this project..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
              />
            </div>
          )}

          {mode === 'document' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Document Type
                </label>
                <div className="flex gap-2">
                  {['RFP', 'RFI', 'Brainstorm'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDocType(type)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                        docType === type
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {folders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Project <span className="text-slate-400">(optional)</span>
                  </label>
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white"
                  >
                    <option value="">Standalone (no project)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateDialog;
