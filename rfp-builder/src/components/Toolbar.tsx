import React, { useState } from 'react';
import { DocumentState } from '../types';
import { exportToDocx } from '../utils/exportDocx';
import { exportToPdf } from '../utils/exportPdf';
import {
  FileDown,
  FileText,
  RotateCcw,
  Loader2,
} from 'lucide-react';

interface ToolbarProps {
  documentState: DocumentState;
  isGenerating: boolean;
  onReset: () => void;
  onExportComplete: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  documentState,
  isGenerating,
  onReset,
  onExportComplete,
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
      setExportError('Failed to export Word document. Please try again.');
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
      setExportError('Failed to export PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
      {/* Left: App title */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <FileText size={20} className="text-indigo-600" />
          RFP Builder
        </h1>
      </div>

      {/* Right: Export + Reset */}
      <div className="flex items-center gap-2">
        {exportError && (
          <span className="text-xs text-red-500 mr-2">{exportError}</span>
        )}

        {isGenerating && (
          <span className="text-xs text-indigo-600 font-medium mr-2 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Generating...
          </span>
        )}

        <button
          onClick={handleExportDocx}
          disabled={exportDisabled || exportingDocx}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={isGenerating ? 'Wait for generation to complete' : ''}
        >
          {exportingDocx ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
          Word
        </button>

        <button
          onClick={handleExportPdf}
          disabled={exportDisabled || exportingPdf}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={isGenerating ? 'Wait for generation to complete' : ''}
        >
          {exportingPdf ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileDown size={14} />
          )}
          PDF
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={onReset}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Start over"
        >
          <RotateCcw size={14} />
          New
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
