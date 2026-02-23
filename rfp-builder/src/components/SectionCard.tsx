import React, { useState } from 'react';
import { DocumentSection } from '../types';
import { Pencil, Trash2, GripVertical, Check, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface SectionCardProps {
  section: DocumentSection;
  isStreaming?: boolean;
  isLastSection?: boolean;
  onUpdate: (id: string, updates: Partial<DocumentSection>) => void;
  onRemove: (id: string) => void;
  dragHandleProps?: any;
}

const SectionCard: React.FC<SectionCardProps> = ({
  section,
  isStreaming = false,
  isLastSection = false,
  onUpdate,
  onRemove,
  dragHandleProps,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);

  const handleSave = () => {
    onUpdate(section.id, { content: editContent });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(section.content);
    setIsEditing(false);
  };

  // Show blinking cursor on the last section during streaming
  const showCursor = isStreaming && isLastSection;

  return (
    <div
      className="border border-gray-200 bg-white rounded-lg mb-3 transition-all section-enter"
    >
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
          {!isEditing && !isStreaming && (
            <>
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
            <div className="flex items-center gap-2 mt-2 justify-end">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors"
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
    </div>
  );
};

export default SectionCard;
