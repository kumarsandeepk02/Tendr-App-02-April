import React from 'react';
import { FileText, FileSearch, Upload, Sparkles, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onStartRFP: () => void;
  onStartRFI: () => void;
  onStartFreeform: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({
  onStartRFP,
  onStartRFI,
  onStartFreeform,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-white to-gray-50">
      {/* Hero */}
      <div className="text-center mb-12 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-6">
          <Sparkles size={14} />
          Powered by AI
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
          Build RFX documents
          <br />
          <span className="text-indigo-600">in minutes, not days</span>
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          Tell us about your project in plain English. Our AI will draft a complete,
          professional procurement document tailored to your needs.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full mb-12">
        <ActionCard
          icon={<FileText size={24} />}
          title="Create RFP"
          description="Request for Proposal — for selecting vendors and awarding contracts"
          color="indigo"
          onClick={onStartRFP}
        />
        <ActionCard
          icon={<FileSearch size={24} />}
          title="Create RFI"
          description="Request for Information — for gathering market intelligence before an RFP"
          color="violet"
          onClick={onStartRFI}
        />
        <ActionCard
          icon={<Upload size={24} />}
          title="Just Chat"
          description="Describe your project freely and I'll figure out what you need"
          color="gray"
          onClick={onStartFreeform}
        />
      </div>

      {/* Trust indicators */}
      <div className="flex items-center gap-6 text-xs text-gray-400">
        <span>No sign-up required</span>
        <span className="w-1 h-1 bg-gray-300 rounded-full" />
        <span>Export to Word & PDF</span>
        <span className="w-1 h-1 bg-gray-300 rounded-full" />
        <span>Industry-tailored output</span>
      </div>
    </div>
  );
};

const ActionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
}> = ({ icon, title, description, color, onClick }) => {
  const colorMap: Record<string, { bg: string; iconBg: string; iconColor: string; hover: string; ring: string }> = {
    indigo: {
      bg: 'bg-white',
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
      hover: 'hover:border-indigo-300 hover:shadow-indigo-100',
      ring: 'group-hover:ring-indigo-100',
    },
    violet: {
      bg: 'bg-white',
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      hover: 'hover:border-violet-300 hover:shadow-violet-100',
      ring: 'group-hover:ring-violet-100',
    },
    gray: {
      bg: 'bg-white',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      hover: 'hover:border-gray-300 hover:shadow-gray-100',
      ring: 'group-hover:ring-gray-100',
    },
  };

  const c = colorMap[color] || colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={`group relative ${c.bg} border border-gray-200 rounded-2xl p-6 text-left transition-all duration-200 ${c.hover} hover:shadow-lg`}
    >
      <div className={`w-12 h-12 rounded-xl ${c.iconBg} ${c.iconColor} flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors">
        Get started
        <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
};

export default LandingPage;
