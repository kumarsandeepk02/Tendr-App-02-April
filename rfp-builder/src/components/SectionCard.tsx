import React, { useState, useRef, useEffect } from 'react';
import { DocumentSection } from '../types';
import { Pencil, Trash2, GripVertical, Check, X, RefreshCw, Target, Scissors, MessageSquare, Loader2, ChevronDown, Undo2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import CopilotBar from './CopilotBar';

interface SectionCardProps {
  section: DocumentSection;
  isStreaming?: boolean;
  isLastSection?: boolean;
  isRegenerating?: boolean;
  showUndo?: boolean;
  onUpdate: (id: string, updates: Partial<DocumentSection>) => void;
  onRemove: (id: string) => void;
  onRegenerate?: (sectionId: string, sectionTitle: string, currentContent: string, instruction: string) => void;
  onUndo?: () => void;
  onCopilotEdit?: (sectionId: string, sectionTitle: string, currentContent: string, instruction: string) => Promise<string | null>;
  dragHandleProps?: any;
}

const SectionCard: React.FC<SectionCardProps> = ({
  section,
  isStreaming = false,
  isLastSection = false,
  isRegenerating = false,
  showUndo = false,
  onUpdate,
  onRemove,
  onRegenerate,
  onUndo,
  onCopilotEdit,
  dragHandleProps,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);

  // Sync edit content when section content changes externally (e.g., after regeneration)
  useEffect(() => {
    if (!isEditing) {
      setEditContent(section.content);
    }
  }, [section.content, isEditing]);

  // Show undo toast briefly after regeneration
  useEffect(() => {
    if (showUndo) {
      setUndoVisible(true);
      undoTimerRef.current = setTimeout(() => setUndoVisible(false), 5000);
      return () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      };
    } else {
      setUndoVisible(false);
    }
  }, [showUndo]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAIMenu(false);
        setShowCustomInput(false);
      }
    };
    if (showAIMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAIMenu]);

  const handleSave = () => {
    onUpdate(section.id, { content: editContent });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(section.content);
    setIsEditing(false);
  };

  const handleRegenerate = (instruction: string) => {
    setShowAIMenu(false);
    setShowCustomInput(false);
    setCustomInstruction('');
    onRegenerate?.(section.id, section.title, section.content, instruction);
  };

  const handleCustomSubmit = () => {
    if (customInstruction.trim()) {
      handleRegenerate(customInstruction.trim());
    }
  };

  const handleCopilotAction = async (instruction: string) => {
    if (!onCopilotEdit || isCopilotLoading) return;
    setIsCopilotLoading(true);
    try {
      const result = await onCopilotEdit(section.id, section.title, editContent, instruction);
      if (result) {
        setEditContent(result);
      }
    } finally {
      setIsCopilotLoading(false);
    }
  };

  // Show blinking cursor on the last section during streaming
  const showCursor = isStreaming && isLastSection;
  const isDisabled = isStreaming || isRegenerating;

  return (
    <div
      className={`border rounded-lg mb-3 transition-all section-enter ${
        isRegenerating
          ? 'border-indigo-300 bg-indigo-50/30 relative'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Regeneration overlay */}
      {isRegenerating && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-md border border-indigo-200">
            <Loader2 size={16} className="text-indigo-600 animate-spin" />
            <span className="text-sm font-medium text-indigo-700">Rewriting section...</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span
            {...(dragHandleProps || {})}
            className="cursor-grab text-gray-400 hover:text-gray-600"
          >
            <GripVertical size={16} />
          </span>
          <h3 className="font-semibold text-sm text-gray-900">
            {section.title}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && !isDisabled && (
            <>
              {/* AI Action Menu */}
              {onRegenerate && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowAIMenu(!showAIMenu)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    title="AI actions"
                  >
                    <RefreshCw size={12} />
                    AI
                    <ChevronDown size={10} />
                  </button>
                  {showAIMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      <button
                        onClick={() => handleRegenerate('Regenerate this section with improved quality and more thorough coverage')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <RefreshCw size={14} className="text-indigo-500 flex-shrink-0" />
                        <div>
                          <div className="font-medium">Regenerate</div>
                          <div className="text-xs text-gray-400">Rewrite with improved quality</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleRegenerate('Make more specific with concrete metrics, SLAs, and quantifiable requirements')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Target size={14} className="text-green-500 flex-shrink-0" />
                        <div>
                          <div className="font-medium">More Specific</div>
                          <div className="text-xs text-gray-400">Add metrics & quantifiable criteria</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleRegenerate('Make more concise while preserving all critical requirements and mandatory items')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Scissors size={14} className="text-orange-500 flex-shrink-0" />
                        <div>
                          <div className="font-medium">More Concise</div>
                          <div className="text-xs text-gray-400">Cut redundancy, keep essentials</div>
                        </div>
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      {!showCustomInput ? (
                        <button
                          onClick={() => setShowCustomInput(true)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                        >
                          <MessageSquare size={14} className="text-purple-500 flex-shrink-0" />
                          <div>
                            <div className="font-medium">Custom Instruction...</div>
                            <div className="text-xs text-gray-400">Tell AI exactly what to change</div>
                          </div>
                        </button>
                      ) : (
                        <div className="px-3 py-2">
                          <textarea
                            value={customInstruction}
                            onChange={(e) => setCustomInstruction(e.target.value)}
                            placeholder="e.g., Add HIPAA compliance requirements..."
                            className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                            rows={2}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleCustomSubmit();
                              }
                            }}
                          />
                          <div className="flex justify-end gap-1 mt-1">
                            <button
                              onClick={() => { setShowCustomInput(false); setCustomInstruction(''); }}
                              className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleCustomSubmit}
                              disabled={!customInstruction.trim()}
                              className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setEditContent(section.content);
                  setIsEditing(true);
                }}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                title="Edit section"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onRemove(section.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete section"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[120px] p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
              placeholder="Enter section content..."
              autoFocus
            />
            {onCopilotEdit && (
              <CopilotBar
                sectionTitle={section.title}
                currentContent={editContent}
                onApply={(newContent) => setEditContent(newContent)}
                isLoading={isCopilotLoading}
                onAction={handleCopilotAction}
              />
            )}
            <div className="flex items-center gap-2 mt-2 justify-end">
              <button
                onClick={handleCancel}
                disabled={isCopilotLoading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isCopilotLoading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
              >
                <Check size={12} /> Save
              </button>
            </div>
          </div>
        ) : (
          <div className={`prose prose-sm max-w-none text-gray-600 ${showCursor ? 'streaming-cursor' : ''}`}>
            <ReactMarkdown>{section.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Undo Toast */}
      {undoVisible && onUndo && (
        <div className="px-4 pb-3">
          <button
            onClick={() => {
              onUndo();
              setUndoVisible(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
          >
            <Undo2 size={12} />
            Undo regeneration
          </button>
        </div>
      )}
    </div>
  );
};

export default SectionCard;
