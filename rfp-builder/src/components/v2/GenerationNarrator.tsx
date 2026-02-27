import React, { useEffect, useRef } from 'react';
import { NarrationMessage, SectionProgress } from '../../types';
import { Loader2, CheckCircle2, Sparkles, Brain } from 'lucide-react';

interface GenerationNarratorProps {
  narrations: NarrationMessage[];
  currentSection: SectionProgress | null;
  completedSections: number;
  totalSections: number;
  isGenerating: boolean;
}

const GenerationNarrator: React.FC<GenerationNarratorProps> = ({
  narrations,
  currentSection,
  completedSections,
  totalSections,
  isGenerating,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [narrations, currentSection]);

  const progress = totalSections > 0 ? (completedSections / totalSections) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with progress */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <Brain size={18} className="text-indigo-600 animate-pulse" />
            ) : (
              <Sparkles size={18} className="text-indigo-600" />
            )}
            <h3 className="text-sm font-semibold text-gray-900">
              {isGenerating ? 'Writing your document...' : 'Generation complete'}
            </h3>
          </div>
          {totalSections > 0 && (
            <span className="text-xs text-gray-500">
              {completedSections} / {totalSections} sections
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalSections > 0 && (
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Narration feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-3">
          {narrations.map((msg) => (
            <NarrationItem key={msg.id} message={msg} />
          ))}

          {/* Current section indicator */}
          {isGenerating && currentSection && (
            <div className="flex items-start gap-3 animate-pulse">
              <div className="flex-shrink-0 mt-0.5">
                <Loader2 size={14} className="text-indigo-500 animate-spin" />
              </div>
              <div>
                <p className="text-sm text-indigo-700 font-medium">
                  Writing: {currentSection.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Section {currentSection.index + 1} of {currentSection.total}
                </p>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Thinking animation at bottom */}
      {isGenerating && (
        <div className="px-6 py-3 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            <span>AI is thinking and writing...</span>
          </div>
        </div>
      )}
    </div>
  );
};

const NarrationItem: React.FC<{ message: NarrationMessage }> = ({ message }) => {
  const isComplete = message.type === 'done' || message.content.startsWith('✓') || message.content.startsWith('✅');

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        {isComplete ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : message.type === 'thinking' ? (
          <Brain size={14} className="text-gray-400" />
        ) : (
          <Sparkles size={14} className="text-indigo-400" />
        )}
      </div>
      <p
        className={`text-sm ${
          isComplete
            ? 'text-green-700 font-medium'
            : message.type === 'thinking'
            ? 'text-gray-500 italic'
            : 'text-gray-700'
        }`}
        dangerouslySetInnerHTML={{
          __html: message.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>'),
        }}
      />
    </div>
  );
};

export default GenerationNarrator;
