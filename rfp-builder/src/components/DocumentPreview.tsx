import React, { useState } from 'react';
import { DocumentState, DocumentSection, QualityReview, SectionProgress } from '../types';
import SectionCard from './SectionCard';
import ProgressBar from './ProgressBar';
import { Plus, FileText, Loader2, PenLine, ChevronDown, ChevronUp, X, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import MasterEditor from './MasterEditor';

interface DocumentPreviewProps {
  documentState: DocumentState;
  completedSections: number;
  totalSections: number;
  isStreaming: boolean;
  showPlaceholder: boolean;
  currentSection: SectionProgress | null;
  qualityReview: QualityReview | null;
  onUpdateSection: (id: string, updates: Partial<DocumentSection>) => void;
  onRemoveSection: (id: string) => void;
  onAddSection: (title: string, content?: string) => void;
  onReorderSections: (sections: DocumentSection[]) => void;
}

// Quality Review Panel
const QualityReviewPanel: React.FC<{ review: QualityReview; onDismiss: () => void }> = ({ review, onDismiss }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const scoreColor = review.score >= 80 ? 'bg-green-500' : review.score >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  const scoreTextColor = review.score >= 80 ? 'text-green-700' : review.score >= 60 ? 'text-yellow-700' : 'text-red-700';
  const scoreBgColor = review.score >= 80 ? 'bg-green-50' : review.score >= 60 ? 'bg-yellow-50' : 'bg-red-50';

  const errorCount = review.issues.filter(i => i.severity === 'error').length;
  const warningCount = review.issues.filter(i => i.severity === 'warning').length;
  const infoCount = review.issues.filter(i => i.severity === 'info').length;

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertCircle size={14} className="text-red-500 flex-shrink-0" />;
      case 'warning': return <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />;
      default: return <Info size={14} className="text-blue-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="mx-4 mb-4 border border-gray-200 rounded-lg overflow-hidden animate-in slide-in-from-top-4">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${scoreBgColor}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${scoreColor} text-white flex items-center justify-center text-xs font-bold`}>
            {review.score}
          </div>
          <div>
            <p className={`text-sm font-semibold ${scoreTextColor}`}>
              Quality Score
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {errorCount > 0 && <span className="text-red-600">{errorCount} errors</span>}
              {warningCount > 0 && <span className="text-yellow-600">{warningCount} warnings</span>}
              {infoCount > 0 && <span className="text-blue-600">{infoCount} suggestions</span>}
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
        <div className="bg-white divide-y divide-gray-100">
          {/* Issues */}
          {review.issues.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Issues</p>
              <div className="space-y-2">
                {review.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {severityIcon(issue.severity)}
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-gray-700">{issue.section}:</span>{' '}
                      <span className="text-xs text-gray-600">{issue.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consistency Notes */}
          {review.consistencyNotes.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Consistency</p>
              <ul className="space-y-1">
                {review.consistencyNotes.map((note, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                    <span className="text-gray-300 mt-0.5">-</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Elements */}
          {review.missingElements.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Missing Elements</p>
              <ul className="space-y-1">
                {review.missingElements.map((elem, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                    <span className="text-gray-300 mt-0.5">-</span>
                    {elem}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const GeneratingPlaceholder: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 animate-in slide-in-from-bottom-4">
    <div className="relative mb-6">
      <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-600 animate-spin" />
      </div>
      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
        <FileText size={12} className="text-white" />
      </div>
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">
      Your document is being created...
    </h3>
    <p className="text-sm text-gray-500 text-center max-w-xs">
      Sections will appear here as they're generated. This usually takes 15–30 seconds.
    </p>
    {/* Shimmer skeleton */}
    <div className="w-full max-w-md mt-8 space-y-4">
      <div className="h-4 rounded generating-shimmer" />
      <div className="h-4 rounded generating-shimmer w-4/5" />
      <div className="h-4 rounded generating-shimmer w-3/5" />
      <div className="h-4 rounded generating-shimmer w-4/5" />
    </div>
  </div>
);

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  documentState,
  completedSections,
  totalSections,
  isStreaming,
  showPlaceholder,
  currentSection,
  qualityReview,
  onUpdateSection,
  onRemoveSection,
  onAddSection,
  onReorderSections,
}) => {
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [showMasterEditor, setShowMasterEditor] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);

  const handleAddSection = () => {
    if (newSectionTitle.trim()) {
      onAddSection(newSectionTitle.trim());
      setNewSectionTitle('');
      setIsAddingSection(false);
    }
  };

  const { meta } = documentState;

  // Filter out empty sections for display (only show sections with content)
  const nonEmptySections = documentState.sections
    .filter((s) => s.title !== 'Cover Page' && s.content.trim().length > 0)
    .sort((a, b) => a.order - b.order);

  const hasAnySections = nonEmptySections.length > 0;

  const handleMasterSave = (updates: { id: string; content: string }[]) => {
    updates.forEach(({ id, content }) => {
      onUpdateSection(id, { content });
    });
  };

  return (
    <div
      id="document-preview"
      className="h-full flex flex-col bg-white"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-gray-900 text-base">
              {meta.projectTitle || 'Untitled Document'}
            </h2>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                <Loader2 size={10} className="animate-spin" />
                Generating
              </span>
            )}
          </div>
          {hasAnySections && !isStreaming && !showPlaceholder && (
            <button
              onClick={() => setShowMasterEditor(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
              title="Edit all sections at once"
            >
              <PenLine size={14} />
              Edit All
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
            {meta.type}
          </span>
          {meta.industry && <span>{meta.industry}</span>}
          {meta.updatedAt && (
            <span>
              Updated {new Date(meta.updatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {(hasAnySections || isStreaming) && (
        <ProgressBar
          completed={completedSections}
          total={totalSections}
          isPulsing={isStreaming}
        />
      )}

      {/* Quality Review Panel */}
      {qualityReview && !isStreaming && !reviewDismissed && (
        <QualityReviewPanel
          review={qualityReview}
          onDismiss={() => setReviewDismissed(true)}
        />
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Generating Placeholder */}
        {showPlaceholder && <GeneratingPlaceholder />}

        {/* Empty state — no document yet */}
        {!showPlaceholder && !hasAnySections && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No document yet
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Answer the questions in the chat to provide context, then generate your document. Sections will appear here.
            </p>
          </div>
        )}

        {/* Cover Page */}
        {!showPlaceholder && meta.projectTitle && hasAnySections && (
          <div className="mb-6 p-6 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-lg text-center">
            <p className="text-xs uppercase tracking-wider text-indigo-600 font-semibold mb-2">
              {meta.type === 'RFI'
                ? 'Request for Information'
                : 'Request for Proposal'}
            </p>
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {meta.projectTitle}
            </h1>
            {meta.issuingOrganization && (
              <p className="text-sm text-gray-600">
                {meta.issuingOrganization}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              {new Date(meta.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        )}

        {/* Section Cards — only non-empty */}
        {!showPlaceholder &&
          nonEmptySections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              isStreaming={isStreaming}
              isLastSection={index === nonEmptySections.length - 1}
              onUpdate={onUpdateSection}
              onRemove={onRemoveSection}
            />
          ))}

        {/* Add Section (hide during streaming, only show when there are sections) */}
        {!showPlaceholder && !isStreaming && hasAnySections && (
          <>
            {isAddingSection ? (
              <div className="border-2 border-dashed border-indigo-300 rounded-lg p-4 bg-indigo-50">
                <input
                  type="text"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                  placeholder="Section title..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddSection}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Add Section
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingSection(false);
                      setNewSectionTitle('');
                    }}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingSection(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-sm"
              >
                <Plus size={16} />
                Add Section
              </button>
            )}
          </>
        )}
      </div>

      {/* Master Editor Overlay */}
      <MasterEditor
        isOpen={showMasterEditor}
        onClose={() => setShowMasterEditor(false)}
        sections={nonEmptySections}
        onSaveAll={handleMasterSave}
        projectTitle={meta.projectTitle || 'Untitled Document'}
        documentType={meta.type}
      />
    </div>
  );
};

export default DocumentPreview;
