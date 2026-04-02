import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { SectionSuggestion } from '../types';
import { Upload, FileText, Loader2, X, Check, XCircle } from 'lucide-react';
import { api } from '../utils/api';

interface FileUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onSuggestionsReceived: (suggestions: SectionSuggestion[]) => void;
  onError: (message: string) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  isOpen,
  onClose,
  onSuggestionsReceived,
  onError,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<SectionSuggestion[]>([]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await api.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const suggs = res.data.suggestions.map((s: any) => ({
          ...s,
          accepted: undefined,
        }));
        setSuggestions(suggs);
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          "We couldn't read this file. Please try a different format or paste your content directly.";
        onError(msg);
        onClose();
      } finally {
        setIsUploading(false);
      }
    },
    [onError, onClose]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  const toggleSuggestion = (id: string, accepted: boolean) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, accepted } : s))
    );
  };

  const handleApply = () => {
    const accepted = suggestions.filter((s) => s.accepted === true);
    onSuggestionsReceived(accepted);
    setSuggestions([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Upload Document</h3>
          <button
            onClick={() => {
              setSuggestions([]);
              onClose();
            }}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {suggestions.length === 0 ? (
            <>
              {isUploading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2
                    size={32}
                    className="text-indigo-600 animate-spin mb-3"
                  />
                  <p className="text-sm text-gray-600">
                    Analyzing your document...
                  </p>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload
                    size={32}
                    className="mx-auto mb-3 text-gray-400"
                  />
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {isDragActive
                      ? 'Drop your file here'
                      : 'Drag & drop a file, or click to browse'}
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF, DOCX, or TXT (max 10MB)
                  </p>
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                We found these relevant sections from your document. Select
                which ones to add:
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      s.accepted === true
                        ? 'border-emerald-300 bg-emerald-50'
                        : s.accepted === false
                        ? 'border-gray-200 bg-gray-50 opacity-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <FileText size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {s.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {s.content.substring(0, 80)}...
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleSuggestion(s.id, true)}
                        className={`p-1.5 rounded-md transition-colors ${
                          s.accepted === true
                            ? 'bg-emerald-200 text-emerald-700'
                            : 'hover:bg-emerald-100 text-gray-400 hover:text-emerald-600'
                        }`}
                        title="Add section"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => toggleSuggestion(s.id, false)}
                        className={`p-1.5 rounded-md transition-colors ${
                          s.accepted === false
                            ? 'bg-red-100 text-red-600'
                            : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                        }`}
                        title="Skip section"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => {
                setSuggestions([]);
                onClose();
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!suggestions.some((s) => s.accepted === true)}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add Selected Sections
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
