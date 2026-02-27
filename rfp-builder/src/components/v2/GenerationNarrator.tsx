import React, { useEffect, useRef } from 'react';
import { NarrationMessage, NarrationAgent, SectionProgress } from '../../types';
import { Loader2, CheckCircle2, Sparkles, Brain, PenTool, ShieldCheck, ArrowRight } from 'lucide-react';

interface GenerationNarratorProps {
  narrations: NarrationMessage[];
  currentSection: SectionProgress | null;
  completedSections: number;
  totalSections: number;
  isGenerating: boolean;
}

// Agent badge configuration
const AGENT_CONFIG: Record<NarrationAgent, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  planning: {
    label: 'Planning Agent',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: <Brain size={10} />,
  },
  research: {
    label: 'Research Agent',
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
    icon: <Sparkles size={10} />,
  },
  writer: {
    label: 'Section Writer',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50 border-indigo-200',
    icon: <PenTool size={10} />,
  },
  reviewer: {
    label: 'Quality Reviewer',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: <ShieldCheck size={10} />,
  },
};

// Determine the current phase label from narration state
function getPhaseLabel(
  isGenerating: boolean,
  completedSections: number,
  totalSections: number,
  narrations: NarrationMessage[]
): string {
  if (!isGenerating) return 'Generation complete';

  // Check if we've received any writer narrations
  const hasWriterNarration = narrations.some((n) => n.agent === 'writer');
  const hasReviewerNarration = narrations.some((n) => n.agent === 'reviewer');

  if (hasReviewerNarration) return 'Quality Reviewer checking your document...';
  if (hasWriterNarration && totalSections > 0) {
    return `Writing Team — section ${Math.min(completedSections + 1, totalSections)} of ${totalSections}`;
  }
  return 'Analyzing your brief...';
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
  const phaseLabel = getPhaseLabel(isGenerating, completedSections, totalSections, narrations);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with progress */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <Brain size={18} className="text-indigo-600 animate-pulse" />
            ) : (
              <CheckCircle2 size={18} className="text-green-600" />
            )}
            <h3 className="text-sm font-semibold text-gray-900">{phaseLabel}</h3>
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
          {narrations.map((msg) =>
            msg.type === 'handover' ? (
              <HandoverBanner key={msg.id} message={msg} />
            ) : (
              <NarrationItem key={msg.id} message={msg} />
            )
          )}

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
            <span>AI agents are working on your document...</span>
          </div>
        </div>
      )}
    </div>
  );
};

/** Handover banner — centered, distinct styling */
const HandoverBanner: React.FC<{ message: NarrationMessage }> = ({ message }) => {
  return (
    <div className="flex items-center justify-center gap-2 py-2.5 px-4 my-2 bg-indigo-50 border border-indigo-200 rounded-lg">
      <ArrowRight size={14} className="text-indigo-500 flex-shrink-0" />
      <p
        className="text-xs font-medium text-indigo-700 text-center"
        dangerouslySetInnerHTML={{
          __html: message.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>'),
        }}
      />
    </div>
  );
};

/** Agent badge — small label above narration text */
const AgentBadge: React.FC<{ agent: NarrationAgent }> = ({ agent }) => {
  const config = AGENT_CONFIG[agent];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${config.bg} ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

const NarrationItem: React.FC<{ message: NarrationMessage }> = ({ message }) => {
  const isComplete =
    message.type === 'done' || message.content.startsWith('\u2713') || message.content.startsWith('\u2705');

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
      <div className="min-w-0">
        {message.agent && (
          <div className="mb-0.5">
            <AgentBadge agent={message.agent} />
          </div>
        )}
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
    </div>
  );
};

export default GenerationNarrator;
