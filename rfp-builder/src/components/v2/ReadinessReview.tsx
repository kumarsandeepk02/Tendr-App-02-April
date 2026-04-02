import React from 'react';
import { ReadinessReview as ReadinessReviewType } from '../../types';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface ReadinessReviewProps {
  review: ReadinessReviewType | null;
  isLoading: boolean;
  onGenerate: () => void;
  onBackToBrief: () => void;
  isGenerating: boolean;
  agentName: string;
}

const severityConfig = {
  red: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    iconColor: 'text-red-500',
    titleColor: 'text-red-800',
    descColor: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    label: 'Needs attention',
  },
  yellow: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    iconColor: 'text-amber-500',
    titleColor: 'text-amber-800',
    descColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Worth reviewing',
  },
  green: {
    icon: CheckCircle2,
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconColor: 'text-green-500',
    titleColor: 'text-green-800',
    descColor: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    label: 'Looks good',
  },
};

export default function ReadinessReview({
  review,
  isLoading,
  onGenerate,
  onBackToBrief,
  isGenerating,
  agentName,
}: ReadinessReviewProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{agentName} is reviewing your brief...</span>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const statusConfig = severityConfig[review.status];
  const StatusIcon = statusConfig.icon;
  const redCount = review.issues.filter((i) => i.severity === 'red').length;
  const yellowCount = review.issues.filter((i) => i.severity === 'yellow').length;
  const greenCount = review.issues.filter((i) => i.severity === 'green').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Readiness Check</h2>
        </div>
        <p className="text-sm text-gray-500">
          {agentName} reviewed your brief before generation
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Summary card */}
        <div className={`rounded-xl p-4 ${statusConfig.bg} ${statusConfig.border} border`}>
          <div className="flex items-start gap-3">
            <StatusIcon className={`w-5 h-5 mt-0.5 ${statusConfig.iconColor}`} />
            <div>
              <p className={`text-sm font-medium ${statusConfig.titleColor}`}>
                {review.status === 'green' ? 'Ready to go' : review.status === 'yellow' ? 'A few things to consider' : 'Some gaps to be aware of'}
              </p>
              <p className={`text-sm mt-1 ${statusConfig.descColor}`}>
                {review.summary}
              </p>
            </div>
          </div>
          {/* Counts */}
          <div className="flex gap-3 mt-3 ml-8">
            {redCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {redCount} critical
              </span>
            )}
            {yellowCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {yellowCount} advisory
              </span>
            )}
            {greenCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                {greenCount} good
              </span>
            )}
          </div>
        </div>

        {/* Issues list */}
        {review.issues.length > 0 && (
          <div className="space-y-3">
            {review.issues.map((issue, i) => {
              const config = severityConfig[issue.severity];
              const Icon = config.icon;
              return (
                <div
                  key={i}
                  className={`rounded-lg p-3 ${config.bg} ${config.border} border`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${config.titleColor}`}>
                        {issue.title}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {issue.description}
                      </p>
                      {issue.suggestion && (
                        <p className="text-xs text-gray-500 mt-1.5 italic">
                          Suggestion: {issue.suggestion}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions — generate button is ALWAYS available */}
      <div className="px-6 py-4 border-t border-gray-100 bg-white">
        {review.status === 'red' && (
          <p className="text-xs text-gray-500 mb-3 text-center">
            There are some gaps flagged above, but you can still generate — your call.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onBackToBrief}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            Back to Brief
          </button>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {isGenerating ? 'Generating...' : 'Generate Document'}
          </button>
        </div>
      </div>
    </div>
  );
}
