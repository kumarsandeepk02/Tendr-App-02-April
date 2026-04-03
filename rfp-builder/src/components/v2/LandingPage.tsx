import React from 'react';
import { FileText, Search, ArrowRight, Sparkles } from 'lucide-react';

interface LandingPageProps {
  onStartRFP: () => void;
  onStartRFI: () => void;
  onStartFreeform: () => void;
  onStartDocument?: (docType: 'RFP' | 'RFI' | 'brainstorm') => void;
}

// Dynamic market activity data — source TBD
const MARKET_ACTIVITY = [
  { category: 'Energy', time: '2h ago', title: 'Renewable Energy RFP Surge', summary: 'Increased demand for solar and wind projects across EMEA region drives record high procurement volume.' },
  { category: 'Tech', time: '5h ago', title: 'Semiconductor Lead Times Stabilize', summary: 'Global supply chains show recovery as lead times drop to an 18-week average for key industrial components.' },
  { category: 'Logistics', time: '8h ago', title: 'Logistics Infrastructure Pivot', summary: 'Major carriers shifting focus to automated port facilities and green last-mile delivery solutions globally.' },
];

const LandingPage: React.FC<LandingPageProps> = ({
  onStartRFP,
  onStartRFI,
  onStartFreeform,
  onStartDocument,
}) => {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 pb-16">
        {/* Hero */}
        <div className="mt-10 mb-14">
          <h1 className="text-4xl font-[Manrope] font-extrabold text-slate-900 tracking-tight mb-4 leading-[1.15]">
            Build RFX documents in{' '}
            <span className="text-indigo-600 italic">minutes</span>, not days
          </h1>
          <p className="text-base text-slate-500 font-light max-w-xl leading-relaxed">
            Harness AI-driven precision to streamline your procurement lifecycle. From initial market exploration to complex RFP drafting.
          </p>
        </div>

        {/* Agent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {/* Nova — RFP */}
          <AgentCard
            name="Nova"
            description="Your RFP Builder. Transform complex requirements into structured, vendor-ready documents instantly."
            cta="Build RFP"
            icon={<FileText size={24} />}
            iconBg="bg-indigo-600"
            iconColor="text-white"
            accentColor="indigo"
            onClick={onStartDocument ? () => onStartDocument('RFP') : onStartRFP}
          />

          {/* Zuno — RFI */}
          <AgentCard
            name="Zuno"
            description="Your RFI Explorer. Discover market capabilities and benchmark suppliers before committing resources."
            cta="Market Exploration"
            icon={<Search size={24} />}
            iconBg="bg-slate-700"
            iconColor="text-white"
            accentColor="indigo"
            onClick={onStartDocument ? () => onStartDocument('RFI') : onStartRFI}
          />

          {/* Zia — Brainstorm */}
          <AgentCard
            name="Zia"
            description="Collaborative Brainstorming. Define project scope, identify risks, and align stakeholders through AI ideation."
            cta="Start Session"
            icon={<Sparkles size={24} />}
            iconBg="bg-slate-200"
            iconColor="text-indigo-600"
            accentColor="indigo"
            onClick={onStartDocument ? () => onStartDocument('brainstorm') : onStartFreeform}
          />
        </div>

        {/* Market Activity */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse shadow-[0_0_8px_rgba(68,73,222,0.5)]" />
              <h2 className="text-2xl font-[Manrope] font-bold text-slate-900 tracking-tight">
                Global Market Activity
              </h2>
            </div>
            <span className="text-[10px] font-bold tracking-widest text-indigo-600 uppercase bg-indigo-50 px-3 py-1 rounded-full">
              Live Updates
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {MARKET_ACTIVITY.map((item, i) => (
              <div
                key={i}
                className="bg-white p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                    {item.category}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.time}</span>
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors leading-snug">
                  {item.title}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-200/60 flex flex-col md:flex-row justify-between items-center text-slate-400/60">
          <p className="text-[10px] font-medium uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Tendr. All rights reserved.
          </p>
          <div className="flex gap-6 mt-3 md:mt-0 text-[10px] font-bold uppercase tracking-widest">
            <button className="hover:text-indigo-600 transition-colors">Privacy Policy</button>
            <button className="hover:text-indigo-600 transition-colors">Terms of Service</button>
            <button className="hover:text-indigo-600 transition-colors">Compliance</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Agent card — matches screenshot bento style */
const AgentCard: React.FC<{
  name: string;
  description: string;
  cta: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  onClick: () => void;
}> = ({ name, description, cta, icon, iconBg, iconColor, accentColor, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-3xl bg-white border-none shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-500 text-left"
    >
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Glow orb */}
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all duration-500" />

      <div className="p-7 relative flex flex-col h-full min-h-[240px]">
        <div className={`w-12 h-12 ${iconBg} rounded-2xl flex items-center justify-center ${iconColor} mb-6 shadow-lg`}>
          {icon}
        </div>
        <h3 className="text-xl font-[Manrope] font-bold text-slate-900 mb-2">{name}</h3>
        <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6">
          {description}
        </p>
        <div className="mt-auto flex items-center gap-1.5 text-indigo-600 font-bold text-sm group-hover:gap-3 transition-all duration-300">
          <span>{cta}</span>
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
};

export default LandingPage;
