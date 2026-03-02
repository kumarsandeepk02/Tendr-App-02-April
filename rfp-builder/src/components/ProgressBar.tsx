import React from 'react';
import { GenerationStage } from '../types';
import { Brain, ListChecks, PenTool, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ProgressBarProps {
  completed: number;
  total: number;
  isPulsing?: boolean;
  stage?: GenerationStage | null;
}

const STAGES: { key: GenerationStage; label: string; icon: React.ReactNode }[] = [
  { key: 'brainstorming', label: 'Brainstorming', icon: <Brain size={14} /> },
  { key: 'planning', label: 'Planning', icon: <ListChecks size={14} /> },
  { key: 'writing', label: 'Writing', icon: <PenTool size={14} /> },
  { key: 'checking', label: 'Checking', icon: <ShieldCheck size={14} /> },
  { key: 'complete', label: 'Complete', icon: <CheckCircle2 size={14} /> },
];

const ProgressBar: React.FC<ProgressBarProps> = ({ completed, total, isPulsing = false, stage }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // If we have stage data, render the multi-stage stepper
  if (stage) {
    const activeIndex = STAGES.findIndex((s) => s.key === stage);

    return (
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-1">
          {STAGES.map((s, i) => {
            const isCompleted = i < activeIndex;
            const isActive = i === activeIndex;
            const isPending = i > activeIndex;

            return (
              <React.Fragment key={s.key}>
                {i > 0 && (
                  <div
                    className={`flex-1 h-0.5 mx-0.5 rounded-full transition-colors duration-500 ${
                      isCompleted ? 'bg-indigo-500' : 'bg-gray-200'
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isCompleted
                        ? 'bg-indigo-600 text-white'
                        : isActive
                        ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400 stage-pulse'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {s.icon}
                  </div>
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap ${
                      isCompleted
                        ? 'text-indigo-600'
                        : isActive
                        ? 'text-indigo-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Section progress sub-bar during writing */}
        {stage === 'writing' && total > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-gray-500">
                {completed} of {total} sections
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-indigo-500 h-1 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback: simple progress bar when no stage data
  return (
    <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">
          {isPulsing ? 'Generating sections...' : `${completed} of ${total} sections complete`}
        </span>
        <span className="text-xs font-medium text-indigo-600">
          {isPulsing ? '' : `${percentage}%`}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={`bg-indigo-600 h-1.5 rounded-full transition-all duration-500 ease-out ${isPulsing ? 'progress-pulse' : ''}`}
          style={{ width: isPulsing ? '60%' : `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
