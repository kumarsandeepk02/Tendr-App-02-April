import React, { useState } from 'react';
import { Loader2, Sparkles, Send, Type, ListPlus, CheckCheck, Table2, BookOpen } from 'lucide-react';

interface CopilotBarProps {
  sectionTitle: string;
  currentContent: string;
  onApply: (newContent: string) => void;
  isLoading: boolean;
  onAction: (instruction: string) => void;
}

const QUICK_ACTIONS = [
  { label: 'Improve Writing', icon: BookOpen, instruction: 'Improve the writing quality, clarity, and professionalism while preserving all factual content' },
  { label: 'Add Detail', icon: ListPlus, instruction: 'Add more specific details, examples, and quantifiable metrics' },
  { label: 'Fix Grammar', icon: CheckCheck, instruction: 'Fix any grammar, spelling, punctuation, and formatting issues' },
  { label: 'Add Table', icon: Table2, instruction: 'Where appropriate, convert or add information in a well-formatted markdown table' },
  { label: 'Formalize', icon: Type, instruction: 'Formalize the tone using proper procurement language (shall/should/may)' },
];

const CopilotBar: React.FC<CopilotBarProps> = ({
  sectionTitle,
  currentContent,
  onApply,
  isLoading,
  onAction,
}) => {
  const [customInstruction, setCustomInstruction] = useState('');

  const handleCustomSubmit = () => {
    const trimmed = customInstruction.trim();
    if (trimmed) {
      onAction(trimmed);
      setCustomInstruction('');
    }
  };

  return (
    <div className="mt-2 border border-indigo-200 rounded-lg bg-indigo-50/50 p-2.5">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={12} className="text-indigo-500" />
        <span className="text-xs font-medium text-indigo-700">AI Copilot</span>
        {isLoading && (
          <span className="flex items-center gap-1 text-xs text-indigo-500 ml-auto">
            <Loader2 size={10} className="animate-spin" />
            Applying...
          </span>
        )}
      </div>

      {/* Quick action chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => onAction(action.instruction)}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-100 hover:border-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon size={11} />
              {action.label}
            </button>
          );
        })}
      </div>

      {/* Custom instruction input */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleCustomSubmit();
            }
          }}
          placeholder="Custom instruction... e.g., Add HIPAA compliance details"
          className="flex-1 px-2.5 py-1.5 text-xs border border-indigo-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
          disabled={isLoading}
        />
        <button
          onClick={handleCustomSubmit}
          disabled={!customInstruction.trim() || isLoading}
          className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
};

export default CopilotBar;
