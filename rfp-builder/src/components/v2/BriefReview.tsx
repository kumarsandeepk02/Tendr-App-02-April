import React, { useState } from 'react';
import { BriefData, BriefSection } from '../../types';
import {
  CheckSquare,
  Square,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
  Edit3,
  ChevronDown,
  ChevronUp,
  Zap,
  PenLine,
  Check,
  X,
} from 'lucide-react';

interface BriefReviewProps {
  brief: BriefData;
  onToggleSection: (index: number) => void;
  onUpdateSection: (index: number, updates: Partial<BriefSection>) => void;
  onUpdateBrief: (updates: Partial<BriefData>) => void;
  onApproveAndGenerate: () => void;
  onBackToPlanning: () => void;
  isGenerating: boolean;
}

const BriefReview: React.FC<BriefReviewProps> = ({
  brief,
  onToggleSection,
  onUpdateSection,
  onUpdateBrief,
  onApproveAndGenerate,
  onBackToPlanning,
  isGenerating,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const includedCount = brief.suggestedSections.filter((s) => s.included !== false).length;
  const totalCount = brief.suggestedSections.length;

  const confidenceColor =
    brief.confidence.overall >= 0.7
      ? 'text-green-600 bg-green-50'
      : brief.confidence.overall >= 0.4
      ? 'text-yellow-600 bg-yellow-50'
      : 'text-red-600 bg-red-50';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-4">
            <Sparkles size={12} />
            Brief Generated
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Review Your Project Brief
          </h2>
          <p className="text-sm text-gray-500">
            Here&apos;s what I gathered from our conversation. Edit anything that needs updating,
            then approve to start document generation.
          </p>
        </div>

        {/* Brief Summary Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          {/* Project Title */}
          <div className="px-6 py-4 border-b border-gray-100">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Project Title
            </label>
            {isEditingTitle ? (
              <input
                autoFocus
                value={brief.projectTitle}
                onChange={(e) => onUpdateBrief({ projectTitle: e.target.value })}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                className="w-full mt-1 text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-indigo-300 focus:outline-none"
              />
            ) : (
              <div
                className="mt-1 text-lg font-semibold text-gray-900 cursor-pointer hover:text-indigo-700 flex items-center gap-2 group"
                onClick={() => setIsEditingTitle(true)}
              >
                {brief.projectTitle || 'Untitled Project'}
                <Edit3 size={14} className="text-gray-300 group-hover:text-indigo-500" />
              </div>
            )}
          </div>

          {/* Type + Industry */}
          <div className="px-6 py-3 flex items-center gap-4 border-b border-gray-100 bg-gray-50/50">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold">
              {brief.docType}
            </span>
            <span className="text-xs text-gray-500">
              Industry: <strong className="text-gray-700">{brief.industry || 'General'}</strong>
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>
              {Math.round(brief.confidence.overall * 100)}% confidence
            </span>
          </div>

          {/* Description */}
          <div className="px-6 py-4 border-b border-gray-100">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Description
            </label>
            {isEditingDesc ? (
              <textarea
                autoFocus
                value={brief.projectDescription}
                onChange={(e) => onUpdateBrief({ projectDescription: e.target.value })}
                onBlur={() => setIsEditingDesc(false)}
                rows={3}
                className="w-full mt-1 text-sm text-gray-700 bg-transparent border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <p
                className="mt-1 text-sm text-gray-700 cursor-pointer hover:text-indigo-700 group"
                onClick={() => setIsEditingDesc(true)}
              >
                {brief.projectDescription || 'No description extracted.'}
                <Edit3 size={12} className="inline ml-2 text-gray-300 group-hover:text-indigo-500" />
              </p>
            )}
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-6 py-3 flex items-center justify-between text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>
              {brief.requirements.length} requirements, {brief.evaluationCriteria.length} criteria
              {brief.timeline !== 'Not specified' ? `, timeline: ${brief.timeline}` : ''}
            </span>
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showDetails && (
            <div className="px-6 pb-4 space-y-4">
              {brief.requirements.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-400">Requirements</label>
                  <ul className="mt-1 space-y-1">
                    {brief.requirements.map((r, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.evaluationCriteria.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-400">Evaluation Criteria</label>
                  <ul className="mt-1 space-y-1">
                    {brief.evaluationCriteria.map((c, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Missing Info Warning */}
        {brief.confidence.missingInfo.length > 0 && brief.confidence.overall < 0.7 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
            <AlertCircle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-yellow-800 mb-1">Some info may be missing</p>
              <p className="text-xs text-yellow-700">
                {brief.confidence.missingInfo.join('. ')}
              </p>
              <button
                onClick={onBackToPlanning}
                className="mt-2 text-xs font-medium text-yellow-800 underline hover:no-underline"
              >
                Go back and add more details
              </button>
            </div>
          </div>
        )}

        {/* Section Outline */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">
              Document Sections
            </h3>
            <span className="text-xs text-gray-500">
              {includedCount} of {totalCount} included
            </span>
          </div>

          <div className="space-y-2">
            {brief.suggestedSections.map((section, index) => (
              <SectionRow
                key={index}
                section={section}
                index={index}
                onToggle={() => onToggleSection(index)}
                onUpdate={(updates) => onUpdateSection(index, updates)}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={onBackToPlanning}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
          >
            <ArrowLeft size={16} />
            Back to chat
          </button>

          <button
            onClick={onApproveAndGenerate}
            disabled={isGenerating || includedCount === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap size={16} />
                Generate Document ({includedCount} sections)
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionRow: React.FC<{
  section: BriefSection;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<BriefSection>) => void;
}> = ({ section, index, onToggle, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);
  const [editDesc, setEditDesc] = useState(section.description);

  const included = section.included !== false;
  const priorityColor: Record<string, string> = {
    high: 'bg-red-50 text-red-600',
    medium: 'bg-yellow-50 text-yellow-600',
    low: 'bg-gray-100 text-gray-500',
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(section.title);
    setEditDesc(section.description);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (editTitle.trim()) {
      onUpdate({ title: editTitle.trim(), description: editDesc.trim() });
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="w-full px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50/30">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full text-sm font-medium text-gray-900 border border-indigo-300 rounded-lg px-3 py-1.5 mb-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          placeholder="Section title"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          rows={2}
          className="w-full text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 mb-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          placeholder="Section description"
          onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={saveEdit}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
          >
            <Check size={12} />
            Save
          </button>
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all group ${
        included
          ? 'border-gray-200 bg-white hover:border-indigo-200'
          : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-80'
      }`}
    >
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0">
        {included ? (
          <CheckSquare size={18} className="text-indigo-600" />
        ) : (
          <Square size={18} className="text-gray-300" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${included ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
            {section.title}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColor[section.priority] || priorityColor.medium}`}>
            {section.priority}
          </span>
        </div>
        <p className={`text-xs mt-0.5 leading-relaxed ${included ? 'text-gray-500' : 'text-gray-400'}`}>
          {section.description}
        </p>
      </div>
      <button
        onClick={startEdit}
        className="flex-shrink-0 p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
        title="Edit section"
      >
        <PenLine size={14} />
      </button>
    </div>
  );
};

export default BriefReview;
