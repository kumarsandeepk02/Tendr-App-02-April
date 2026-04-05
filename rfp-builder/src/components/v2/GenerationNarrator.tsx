import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { NarrationMessage, NarrationAgent, SectionProgress, QualityReview } from '../../types';
import { Loader2, CheckCircle2, Sparkles, Brain, PenTool, ShieldCheck, ArrowRight, FileDown, MessageSquare } from 'lucide-react';

interface GenerationNarratorProps {
  narrations: NarrationMessage[];
  currentSection: SectionProgress | null;
  completedSections: number;
  totalSections: number;
  isGenerating: boolean;
  qualityReview?: QualityReview | null;
  agentName?: string;
  docType?: string;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onExportXlsx?: () => void;
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
  qualityReview,
  agentName = 'Nova',
  docType,
  onExportDocx,
  onExportPdf,
  onExportXlsx,
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

      {/* Completion card */}
      {!isGenerating && completedSections > 0 && (
        <CompletionCard
          qualityReview={qualityReview}
          agentName={agentName}
          docType={docType}
          sectionCount={completedSections}
          onExportDocx={onExportDocx}
          onExportPdf={onExportPdf}
          onExportXlsx={onExportXlsx}
        />
      )}

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

      {/* Working indicator with rotating quotes */}
      {isGenerating && <WorkingQuotes />}
    </div>
  );
};

/** Handover banner — centered, distinct styling */
const HandoverBanner: React.FC<{ message: NarrationMessage }> = ({ message }) => {
  return (
    <div className="flex items-center justify-center gap-2 py-2.5 px-4 my-2 bg-indigo-50 border border-indigo-200 rounded-lg">
      <ArrowRight size={14} className="text-indigo-500 flex-shrink-0" />
      <span className="text-xs font-medium text-indigo-700 text-center [&_strong]:font-bold [&_em]:italic">
        <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{message.content}</ReactMarkdown>
      </span>
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
        <span
          className={`text-sm [&_strong]:font-bold [&_em]:italic ${
            isComplete
              ? 'text-green-700 font-medium'
              : message.type === 'thinking'
              ? 'text-gray-500 italic'
              : 'text-gray-700'
          }`}
        >
          <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{message.content}</ReactMarkdown>
        </span>
      </div>
    </div>
  );
};

/** Completion card — shown when generation finishes */
const CompletionCard: React.FC<{
  qualityReview?: QualityReview | null;
  agentName: string;
  docType?: string;
  sectionCount: number;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onExportXlsx?: () => void;
}> = ({ qualityReview, agentName, docType, sectionCount, onExportDocx, onExportPdf, onExportXlsx }) => {
  const score = qualityReview?.score;
  const scoreColor = score ? (score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500') : 'bg-gray-400';
  const issueCount = qualityReview?.issues?.length || 0;

  // Procurement workflow: RFI → RFP → Contract (never backwards)
  const companion = docType?.toUpperCase() === 'RFI'
    ? 'Ready to build the full RFP based on what you learned?'
    : docType?.toUpperCase() === 'RFP'
    ? 'Need an evaluation matrix or SOW to go with this?'
    : docType?.toLowerCase() === 'brainstorm'
    ? 'Ready to formalize this into an RFP or RFI?'
    : null;

  return (
    <div className="mx-6 mt-4 p-5 bg-white rounded-xl border border-green-200 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle2 size={24} className="text-green-500" />
        <div>
          <h3 className="text-base font-bold text-gray-900">Your document is ready</h3>
          <p className="text-xs text-gray-500">{sectionCount} sections generated</p>
        </div>
        {score && (
          <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full ${scoreColor}`}>
            <span className="text-xs font-bold text-white">{score}/100</span>
          </div>
        )}
      </div>

      {issueCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
          {issueCount} quality {issueCount === 1 ? 'issue' : 'issues'} found — ask {agentName} to fix them
        </p>
      )}

      <div className="flex gap-2 mb-3">
        {onExportDocx && (
          <button onClick={onExportDocx} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <FileDown size={12} /> Word
          </button>
        )}
        {onExportPdf && (
          <button onClick={onExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <FileDown size={12} /> PDF
          </button>
        )}
        {onExportXlsx && (
          <button onClick={onExportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <FileDown size={12} /> Excel
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <MessageSquare size={12} />
        <span>Ask {agentName} to refine any section</span>
      </div>

      {companion && (
        <p className="text-xs text-indigo-600 mt-2 font-medium">{companion}</p>
      )}
    </div>
  );
};

/** Rotating motivational quotes shown during generation */
const WORKING_QUOTES = [
  { text: "A good RFP is the difference between getting proposals and getting the right proposal.", icon: "📋" },
  { text: "The time you invest in requirements now saves 10x in vendor negotiations later.", icon: "⏱️" },
  { text: "Clear scope today means fewer change orders tomorrow.", icon: "🎯" },
  { text: "The best procurement teams spend 80% of their time on the brief, 20% on evaluation.", icon: "💡" },
  { text: "Every vague requirement is an invitation for vendors to charge more.", icon: "🔍" },
  { text: "You're doing in minutes what used to take days. Your future self will thank you.", icon: "🚀" },
  { text: "Great RFPs don't just find vendors — they attract the right ones.", icon: "🧲" },
  { text: "Specificity is kindness. Vendors actually prefer detailed requirements.", icon: "🤝" },
  { text: "A structured evaluation framework is worth more than a hundred reference calls.", icon: "⚖️" },
  { text: "The procurement team that plans together, succeeds together.", icon: "👥" },
  { text: "Think of your RFP as a first impression — make it count.", icon: "✨" },
  { text: "Ambiguity in scope is the #1 cause of project overruns. You're fixing that right now.", icon: "🛡️" },
];

const WorkingQuotes: React.FC = () => {
  const [quoteIndex, setQuoteIndex] = useState(() =>
    Math.floor(Math.random() * WORKING_QUOTES.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % WORKING_QUOTES.length);
        setIsVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const quote = WORKING_QUOTES[quoteIndex];

  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 size={14} className="animate-spin text-indigo-500" />
        <span className="text-sm font-medium text-indigo-700">Your team is on it...</span>
      </div>
      <div
        className={`transition-all duration-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
      >
        <p className="text-sm text-gray-500 leading-relaxed">
          <span className="mr-1.5">{quote.icon}</span>
          {quote.text}
        </p>
      </div>
    </div>
  );
};

export default GenerationNarrator;
