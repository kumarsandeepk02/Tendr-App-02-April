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
  currentDocType?: string;
  onHandoff?: (targetDocType: 'RFP' | 'RFI') => void;
}

const BriefReview: React.FC<BriefReviewProps> = ({
  brief,
  onToggleSection,
  onUpdateSection,
  onUpdateBrief,
  onApproveAndGenerate,
  onBackToPlanning,
  isGenerating,
  currentDocType,
  onHandoff,
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
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-4">
            <Sparkles size={12} />
            Brief Generated
          </div>
          <h2 className="text-2xl font-[Manrope] font-bold text-slate-900 mb-2">
            Review Your Project Brief
          </h2>
          <p className="text-sm text-slate-500">
            Here&apos;s what I gathered from our conversation. Edit anything that needs updating,
            then approve to start document generation.
          </p>
        </div>

        {/* Brief Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm mb-8 overflow-hidden">
          {/* Project Title */}
          <div className="px-6 py-4 border-b border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Project Title
            </label>
            {isEditingTitle ? (
              <input
                autoFocus
                value={brief.projectTitle}
                onChange={(e) => onUpdateBrief({ projectTitle: e.target.value })}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                className="w-full mt-1 text-lg font-[Manrope] font-bold text-slate-900 bg-transparent border-b-2 border-indigo-300 focus:outline-none"
              />
            ) : (
              <div
                className="mt-1 text-lg font-[Manrope] font-bold text-slate-900 cursor-pointer hover:text-indigo-600 flex items-center gap-2 group transition-colors"
                onClick={() => setIsEditingTitle(true)}
              >
                {brief.projectTitle || 'Untitled Project'}
                <Edit3 size={14} className="text-slate-300 group-hover:text-indigo-500" />
              </div>
            )}
          </div>

          {/* Type + Industry */}
          <div className="px-6 py-3 flex items-center gap-4 border-b border-slate-100 bg-slate-50/50">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold">
              {brief.docType}
            </span>
            <span className="text-xs text-slate-500">
              Industry: <strong className="text-slate-700">{brief.industry || 'General'}</strong>
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>
              {Math.round(brief.confidence.overall * 100)}% confidence
            </span>
          </div>

          {/* Description */}
          <div className="px-6 py-4 border-b border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Description
            </label>
            {isEditingDesc ? (
              <textarea
                autoFocus
                value={brief.projectDescription}
                onChange={(e) => onUpdateBrief({ projectDescription: e.target.value })}
                onBlur={() => setIsEditingDesc(false)}
                rows={3}
                className="w-full mt-1 text-sm text-slate-700 bg-transparent border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <p
                className="mt-1 text-sm text-slate-700 cursor-pointer hover:text-indigo-700 group transition-colors"
                onClick={() => setIsEditingDesc(true)}
              >
                {brief.projectDescription || 'No description extracted.'}
                <Edit3 size={12} className="inline ml-2 text-slate-300 group-hover:text-indigo-500" />
              </p>
            )}
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-6 py-3 flex items-center justify-between text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
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
                  <label className="text-xs font-medium text-slate-400">Requirements</label>
                  <ul className="mt-1 space-y-1">
                    {brief.requirements.map((r, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.evaluationCriteria.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-400">Evaluation Criteria</label>
                  <ul className="mt-1 space-y-1">
                    {brief.evaluationCriteria.map((c, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
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
          <div className={`${brief.confidence.overall < 0.5 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'} border rounded-xl px-4 py-3 mb-6 flex items-start gap-3`}>
            <AlertCircle size={16} className={`${brief.confidence.overall < 0.5 ? 'text-red-600' : 'text-yellow-600'} mt-0.5 flex-shrink-0`} />
            <div>
              <p className={`text-xs font-medium ${brief.confidence.overall < 0.5 ? 'text-red-800' : 'text-yellow-800'} mb-1`}>
                {brief.confidence.overall < 0.5 ? 'Key details missing — document quality will be limited' : 'Some details could improve the output'}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {brief.confidence.missingInfo.map((info: string, i: number) => (
                  <span key={i} className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${brief.confidence.overall < 0.5 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {info}
                  </span>
                ))}
              </div>
              <button
                onClick={onBackToPlanning}
                className={`text-xs font-medium ${brief.confidence.overall < 0.5 ? 'text-red-800' : 'text-yellow-800'} underline hover:no-underline`}
              >
                Go back and add these details
              </button>
            </div>
          </div>
        )}

        {/* Document Sections — 2-column grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-[Manrope] font-bold text-slate-900">
              Document Sections
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              {includedCount} of {totalCount} included
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brief.suggestedSections.map((section, index) => (
              <SectionCard
                key={index}
                section={section}
                index={index}
                onToggle={() => onToggleSection(index)}
                onUpdate={(updates) => onUpdateSection(index, updates)}
              />
            ))}
          </div>
        </div>

        {/* Brainstorm handoff */}
        {currentDocType?.toLowerCase() === 'brainstorm' && onHandoff && (
          <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-sm text-amber-800 mb-3">
              I think you have a solid handle on this. Want me to hand you off to one of my colleagues to build the actual document?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onHandoff('RFP')}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <ArrowRight size={14} />
                Continue with Nova (RFP)
              </button>
              <button
                onClick={() => onHandoff('RFI')}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-40"
              >
                <ArrowRight size={14} />
                Continue with Zuno (RFI)
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={onBackToPlanning}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-colors disabled:opacity-40"
          >
            <ArrowLeft size={16} />
            Back to chat
          </button>

          <button
            onClick={onApproveAndGenerate}
            disabled={isGenerating || includedCount === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
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

/** Section card — 2-column grid card matching screenshot design */
const SectionCard: React.FC<{
  section: BriefSection;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<BriefSection>) => void;
}> = ({ section, index, onToggle, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);
  const [editDesc, setEditDesc] = useState(section.description);

  const included = section.included !== false;
  const priorityColor: Record<string, string> = {
    high: 'bg-sky-100 text-sky-700',
    medium: 'bg-slate-100 text-slate-500',
    low: 'bg-slate-50 text-slate-400',
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
      <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5 shadow-sm">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full text-sm font-semibold text-slate-900 border border-indigo-300 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          placeholder="Section title"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          rows={4}
          className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y leading-relaxed"
          placeholder="Describe what this section should cover — include specific details from your project"
          onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={saveEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Check size={12} />
            Save
          </button>
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
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
      className={`relative bg-white rounded-2xl border p-5 transition-all group ${
        included
          ? 'border-slate-200/60 shadow-sm hover:shadow-md hover:border-indigo-200'
          : 'border-slate-100 opacity-50 hover:opacity-70'
      }`}
    >
      {/* Checkbox — top right */}
      <button
        onClick={onToggle}
        className="absolute top-4 right-4 flex-shrink-0"
        title={included ? 'Exclude section' : 'Include section'}
      >
        {included ? (
          <CheckSquare size={18} className="text-indigo-600" />
        ) : (
          <Square size={18} className="text-slate-300" />
        )}
      </button>

      {/* Title + badges */}
      <h4 className={`text-sm font-semibold pr-8 mb-2 ${included ? 'text-slate-900' : 'text-slate-500 line-through'}`}>
        {section.title}
      </h4>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${priorityColor[section.priority] || priorityColor.medium}`}>
          {section.priority}
        </span>
        {section.responseType === 'vendor_response' ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-600">
            vendor response
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-50 text-slate-400">
            context
          </span>
        )}
      </div>

      {/* Description — collapsed/expanded */}
      {!isExpanded ? (
        <p className={`text-sm leading-relaxed mb-2 ${included ? 'text-slate-500' : 'text-slate-400'}`}>
          {section.description.split(/\.\s/)[0]}.
        </p>
      ) : (
        <div className="mb-2">
          <p
            onClick={startEdit}
            className={`text-sm leading-relaxed cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 transition-colors ${included ? 'text-slate-600' : 'text-slate-400'}`}
            title="Click to edit"
          >
            {section.description}
          </p>
        </div>
      )}

      {/* See details / collapse link */}
      <div className="flex items-center gap-3">
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors flex items-center gap-0.5"
          >
            See details & edit
            <ChevronDown size={12} />
          </button>
        ) : (
          <>
            <button
              onClick={startEdit}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors flex items-center gap-0.5"
            >
              <PenLine size={11} />
              Edit
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors flex items-center gap-0.5"
            >
              Collapse
              <ChevronUp size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BriefReview;
