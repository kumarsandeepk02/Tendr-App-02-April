import React, { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';

interface FeedbackToastProps {
  isVisible: boolean;
  onDismiss: () => void;
}

const FeedbackToast: React.FC<FeedbackToastProps> = ({
  isVisible,
  onDismiss,
}) => {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setSubmitted(false);
    }
  }, [isVisible]);

  const handleFeedback = (rating: 'positive' | 'negative') => {
    try {
      const key = `rfp_feedback_${Date.now()}`;
      localStorage.setItem(
        key,
        JSON.stringify({ timestamp: Date.now(), rating })
      );
    } catch (e) {
      // ignore
    }
    setSubmitted(true);
    setTimeout(onDismiss, 2000);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-5 py-4 flex items-center gap-4">
        {submitted ? (
          <p className="text-sm text-emerald-600 font-medium">
            Thanks for your feedback!
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-700">Was this helpful?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleFeedback('positive')}
                className="p-2 hover:bg-emerald-50 rounded-lg transition-colors group"
                title="Yes"
              >
                <ThumbsUp
                  size={18}
                  className="text-gray-400 group-hover:text-emerald-600"
                />
              </button>
              <button
                onClick={() => handleFeedback('negative')}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                title="No"
              >
                <ThumbsDown
                  size={18}
                  className="text-gray-400 group-hover:text-red-500"
                />
              </button>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 text-gray-300 hover:text-gray-500"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackToast;
