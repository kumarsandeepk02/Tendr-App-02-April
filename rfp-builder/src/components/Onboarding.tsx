import React, { useState } from 'react';
import { OnboardingStep } from '../types';
import { MessageSquare, ArrowRight, Download, Sparkles, X } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

const steps: {
  step: OnboardingStep;
  icon: React.ReactNode;
  title: string;
  description: string;
}[] = [
  {
    step: 1,
    icon: <Sparkles size={40} className="text-indigo-600" />,
    title: 'How it works',
    description:
      'Chat with our AI assistant to build professional RFI and RFP documents. Answer a few quick questions about your project, and we handle the formatting and structure.',
  },
  {
    step: 2,
    icon: <MessageSquare size={40} className="text-indigo-600" />,
    title: 'Answer or Skip',
    description:
      "We'll ask you a series of questions to gather the details we need. Answer what you know and skip the rest — you can also upload existing documents to seed your draft.",
  },
  {
    step: 3,
    icon: <Download size={40} className="text-indigo-600" />,
    title: 'Export & Share',
    description:
      'When your document is ready, export it as a Word or PDF file with one click. Your document is professionally formatted and ready to send to suppliers.',
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);

  const step = steps[currentStep - 1];

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as OnboardingStep);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Close button */}
        <div className="flex justify-end p-4 pb-0">
          <button
            onClick={onComplete}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 text-center">
          <div className="flex justify-center mb-6">{step.icon}</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            {step.title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-8">
            {step.description}
          </p>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === currentStep ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={onComplete}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {currentStep < 3 ? 'Next' : 'Get Started'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
