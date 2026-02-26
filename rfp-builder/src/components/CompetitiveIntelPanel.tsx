import React, { useState } from 'react';
import { CompetitiveIntelligence } from '../types';
import {
  TrendingUp,
  Shield,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  Loader2,
} from 'lucide-react';

type Tab = 'benchmarks' | 'standards' | 'risks' | 'requirements';

interface CompetitiveIntelPanelProps {
  intel: CompetitiveIntelligence;
  onDismiss: () => void;
  onApplySuggestion?: (
    sectionId: string,
    sectionTitle: string,
    currentContent: string,
    instruction: string
  ) => void;
  findSectionByTitle?: (title: string) => { id: string; content: string; title: string } | undefined;
}

const CompetitiveIntelPanel: React.FC<CompetitiveIntelPanelProps> = ({
  intel,
  onDismiss,
  onApplySuggestion,
  findSectionByTitle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('benchmarks');
  const [applyingIndex, setApplyingIndex] = useState<string | null>(null);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'benchmarks', label: 'Benchmarks', icon: <TrendingUp size={12} />, count: intel.industryBenchmarks?.length || 0 },
    { key: 'standards', label: 'Standards', icon: <Shield size={12} />, count: intel.marketStandards?.length || 0 },
    { key: 'risks', label: 'Risks', icon: <AlertTriangle size={12} />, count: intel.riskFactors?.length || 0 },
    { key: 'requirements', label: 'Suggested', icon: <Lightbulb size={12} />, count: intel.suggestedRequirements?.length || 0 },
  ];

  const totalItems = tabs.reduce((sum, t) => sum + t.count, 0);

  const handleApply = (targetSection: string, detail: string, key: string) => {
    if (!onApplySuggestion || !findSectionByTitle) return;
    const section = findSectionByTitle(targetSection);
    if (!section) return;
    setApplyingIndex(key);
    onApplySuggestion(
      section.id,
      section.title,
      section.content,
      `Incorporate this industry insight: ${detail}`
    );
    // Clear after a delay (the regeneration callback will handle the actual update)
    setTimeout(() => setApplyingIndex(null), 3000);
  };

  return (
    <div className="mx-4 mb-4 border border-gray-200 rounded-lg overflow-hidden animate-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center">
            <TrendingUp size={14} />
          </div>
          <div>
            <p className="text-sm font-semibold text-purple-700">
              Competitive Intelligence
            </p>
            <p className="text-xs text-gray-500">
              {totalItems} insight{totalItems !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="bg-white">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-purple-700 border-b-2 border-purple-500 bg-purple-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px]">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-4 py-3 max-h-60 overflow-y-auto">
            {/* Benchmarks */}
            {activeTab === 'benchmarks' && (
              <div className="space-y-2">
                {(intel.industryBenchmarks || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No benchmarks found</p>
                ) : (
                  intel.industryBenchmarks.map((b, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800">{b.metric}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{b.benchmark}</p>
                          {b.source && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Source: {b.source}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Standards */}
            {activeTab === 'standards' && (
              <div className="space-y-2">
                {(intel.marketStandards || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No standards found</p>
                ) : (
                  intel.marketStandards.map((s, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800">{s.standard}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{s.relevance}</p>
                          {s.applicableSection && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Section: {s.applicableSection}</p>
                          )}
                        </div>
                        {onApplySuggestion && findSectionByTitle && s.applicableSection && findSectionByTitle(s.applicableSection) && (
                          <button
                            onClick={() => handleApply(s.applicableSection, `Market standard: ${s.standard}. ${s.relevance}`, `std-${i}`)}
                            disabled={applyingIndex === `std-${i}`}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-purple-600 hover:bg-purple-50 rounded transition-colors flex-shrink-0 disabled:opacity-50"
                          >
                            {applyingIndex === `std-${i}` ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                            Apply
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Risks */}
            {activeTab === 'risks' && (
              <div className="space-y-2">
                {(intel.riskFactors || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No risk factors found</p>
                ) : (
                  intel.riskFactors.map((r, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded-md">
                      <p className="text-xs font-medium text-gray-800">{r.category}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{r.risk}</p>
                      {r.mitigation && (
                        <p className="text-xs text-green-700 mt-0.5">Mitigation: {r.mitigation}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Suggested Requirements */}
            {activeTab === 'requirements' && (
              <div className="space-y-2">
                {(intel.suggestedRequirements || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No suggested requirements</p>
                ) : (
                  intel.suggestedRequirements.map((r, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800">{r.requirement}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{r.rationale}</p>
                          {r.targetSection && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Target: {r.targetSection}</p>
                          )}
                        </div>
                        {onApplySuggestion && findSectionByTitle && r.targetSection && findSectionByTitle(r.targetSection) && (
                          <button
                            onClick={() => handleApply(r.targetSection, `Add this requirement: ${r.requirement}. Rationale: ${r.rationale}`, `req-${i}`)}
                            disabled={applyingIndex === `req-${i}`}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-purple-600 hover:bg-purple-50 rounded transition-colors flex-shrink-0 disabled:opacity-50"
                          >
                            {applyingIndex === `req-${i}` ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                            Apply
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompetitiveIntelPanel;
