import React from 'react';

interface ProgressBarProps {
  completed: number;
  total: number;
  isPulsing?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ completed, total, isPulsing = false }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

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
