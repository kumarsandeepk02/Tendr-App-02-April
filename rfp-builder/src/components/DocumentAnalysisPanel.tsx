import React, { useState } from 'react';
import { DocumentAnalysis } from '../types';
import {
  FileSearch,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  GitCompare,
  Sparkles,
  Zap,
  Loader2,
} from 'lucide-react';

interface DocumentAnalysisPanelProps {
  analysis: DocumentAnalysis;
  onDismiss: () => void;
  onApplySuggestion?: (
    sectionId: string,
    sectionTitle: string,
    currentContent: string,
    instruction: string
  ) => void;
  findSectionByTitle?: (title: string) => { id: string; content: string; title: string } | undefined;
}

const DocumentAnalysisPanel: React.FC<DocumentAnalysisPanelProps> = ({
  analysis,
  onDismiss,
  onApplySuggestion,
  findSectionByTitle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<string | null>(null);

  const gapCount = analysis.gaps?.length || 0;
  const conflictCount = analysis.conflicts?.length || 0;
  const enrichmentCount = analysis.enrichments?.length || 0;
  const totalItems = gapCount + conflictCount + enrichmentCount;

  const handleApplyEnrichment = (section: string, suggestion: string, sourceDoc: string, key: string) => {
    if (!onApplySuggestion || !findSectionByTitle) return;
    const found = findSectionByTitle(section);
    if (!found) return;
    setApplyingIndex(key);
    onApplySuggestion(
      found.id,
      found.title,
      found.content,
      `Incorporate this detail from the reference document "${sourceDoc}": ${suggestion}`
    );
    setTimeout(() => setApplyingIndex(null), 3000);
  };

  if (totalItems === 0) return null;

  return (
    <div className="mx-4 mb-4 border border-gray-200 rounded-lg overflow-hidden animate-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center">
            <FileSearch size={14} />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-700">
              Document Cross-Reference
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {gapCount > 0 && <span className="text-red-600">{gapCount} gap{gapCount !== 1 ? 's' : ''}</span>}
              {conflictCount > 0 && <span className="text-yellow-600">{conflictCount} conflict{conflictCount !== 1 ? 's' : ''}</span>}
              {enrichmentCount > 0 && <span className="text-blue-600">{enrichmentCount} enrichment{enrichmentCount !== 1 ? 's' : ''}</span>}
            </div>
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
        <div className="bg-white divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {/* Gaps */}
          {gapCount > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={12} className="text-red-500" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Coverage Gaps
                </p>
              </div>
              <div className="space-y-2">
                {analysis.gaps.map((gap, i) => (
                  <div key={i} className="p-2 bg-red-50/50 rounded-md">
                    <p className="text-xs font-medium text-gray-800">{gap.requirement}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">From: {gap.source}</span>
                      {gap.suggestedSection && (
                        <span className="text-[10px] text-gray-400">Suggested: {gap.suggestedSection}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflictCount > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <GitCompare size={12} className="text-yellow-500" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Conflicts
                </p>
              </div>
              <div className="space-y-2">
                {analysis.conflicts.map((conflict, i) => (
                  <div key={i} className="p-2 bg-yellow-50/50 rounded-md">
                    <p className="text-xs text-gray-800">{conflict.description}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Between: {conflict.doc1} & {conflict.doc2}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enrichments */}
          {enrichmentCount > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} className="text-blue-500" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Enrichment Suggestions
                </p>
              </div>
              <div className="space-y-2">
                {analysis.enrichments.map((enrichment, i) => (
                  <div key={i} className="p-2 bg-blue-50/50 rounded-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800">{enrichment.section}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{enrichment.suggestion}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">From: {enrichment.sourceDoc}</p>
                      </div>
                      {onApplySuggestion && findSectionByTitle && findSectionByTitle(enrichment.section) && (
                        <button
                          onClick={() => handleApplyEnrichment(enrichment.section, enrichment.suggestion, enrichment.sourceDoc, `enrich-${i}`)}
                          disabled={applyingIndex === `enrich-${i}`}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-50 rounded transition-colors flex-shrink-0 disabled:opacity-50"
                        >
                          {applyingIndex === `enrich-${i}` ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentAnalysisPanel;
