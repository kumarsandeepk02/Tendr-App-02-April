import React, { useState } from 'react';
import { DocumentState, ModelOption } from '../types';
import { exportToDocx } from '../utils/exportDocx';
import { exportToPdf } from '../utils/exportPdf';
import ModelSelector from './ModelSelector';
import {
  FileDown,
  RotateCcw,
  Loader2,
  Search,
  Bell,
  Clock,
} from 'lucide-react';

interface ToolbarProps {
  documentState: DocumentState;
  isGenerating: boolean;
  onReset: () => void;
  onExportComplete: () => void;
  availableModels: ModelOption[];
  selectedModel: string;
  onSelectModel: (modelKey: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  documentState,
  isGenerating,
  onReset,
  onExportComplete,
  availableModels,
  selectedModel,
  onSelectModel,
}) => {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const hasContent = documentState.sections.some(
    (s) => s.content.trim().length > 0
  );

  const exportDisabled = !hasContent || isGenerating;

  const handleExportDocx = async () => {
    setExportingDocx(true);
    setExportError(null);
    try {
      await exportToDocx(documentState);
      onExportComplete();
    } catch (err: any) {
      setExportError('Failed to export Word document.');
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setExportError(null);
    try {
      await exportToPdf(documentState);
      onExportComplete();
    } catch (err: any) {
      setExportError('Failed to export PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <header className="flex items-center justify-between h-14 px-6 bg-slate-50/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40">
      {/* Left: Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects..."
            className="bg-slate-200/40 border-none rounded-full pl-9 pr-4 py-1.5 text-sm w-72 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <ModelSelector
          models={availableModels}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          disabled={isGenerating}
        />

        {exportError && (
          <span className="text-xs text-red-500 mr-1">{exportError}</span>
        )}

        {isGenerating && (
          <span className="text-xs text-indigo-600 font-medium mr-1 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Generating...
          </span>
        )}

        <button
          onClick={handleExportDocx}
          disabled={exportDisabled || exportingDocx}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {exportingDocx ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          Word
        </button>

        <button
          onClick={handleExportPdf}
          disabled={exportDisabled || exportingPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          PDF
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <button
          onClick={onReset}
          disabled={isGenerating}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-40"
          title="New project"
        >
          <RotateCcw size={15} />
        </button>

        <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
          <Bell size={16} />
        </button>
        <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
          <Clock size={16} />
        </button>

        <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300/40 ml-1 flex items-center justify-center text-xs font-semibold text-slate-600 cursor-pointer">
          S
        </div>
      </div>
    </header>
  );
};

export default Toolbar;
