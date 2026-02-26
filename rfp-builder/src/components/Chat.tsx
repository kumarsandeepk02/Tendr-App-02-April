import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, UnifiedFlowPhase, GuidedStep, OutlineSection, SectionProgress, UploadedDocument } from '../types';
import MessageBubble from './MessageBubble';
import TextareaAutosize from 'react-textarea-autosize';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import {
  Send,
  Paperclip,
  Loader2,
  Upload,
  SkipForward,
  FastForward,
  FileText,
  RefreshCw,
  CheckSquare,
  Square,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface ChatProps {
  messages: ChatMessage[];
  isTyping: boolean;
  isGenerating: boolean;
  phase: UnifiedFlowPhase;
  guidedStep: GuidedStep | null;
  outlineSections: OutlineSection[];
  isOutlineLoading: boolean;
  currentSection: SectionProgress | null;
  onSendMessage: (content: string) => void;
  onRetry: () => void;
  onFileUpload: () => void;
  onSkipStep: () => void;
  onSkipToGenerate: () => void;
  onScopeUpload: (fileText: string, fileName?: string) => void;
  onSkipScopeUpload: () => void;
  uploadedDocuments?: UploadedDocument[];
  onRemoveDocument?: (docId: string) => void;
  onTriggerGenerate: (fileText?: string) => void;
  onToggleOutlineSection: (sectionId: string) => void;
  onApproveOutline: () => void;
  onRegenerateOutline: () => void;
}

const TypingIndicator: React.FC = () => (
  <div className="flex gap-3 mb-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
      <Loader2 size={16} className="text-gray-500 animate-spin" />
    </div>
    <div className="bg-gray-100 rounded-2xl px-4 py-3">
      <div className="flex gap-1.5">
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  </div>
);

// Inline upload zone shown before generation
const InlineUploadZone: React.FC<{
  onUploadAndGenerate: (fileText: string) => void;
  onSkipAndGenerate: () => void;
  uploadedDocumentsCount?: number;
}> = ({ onUploadAndGenerate, onSkipAndGenerate, uploadedDocumentsCount = 0 }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);
      setUploadedFileName(file.name);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const extractedText = res.data.text || '';
        onUploadAndGenerate(extractedText);
      } catch (err) {
        setUploadedFileName(null);
        alert('Failed to upload file. Please try again or skip.');
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadAndGenerate]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: isUploading,
  });

  return (
    <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        {isUploading ? (
          <div className="flex items-center gap-3 justify-center py-3">
            <Loader2 size={20} className="text-indigo-600 animate-spin" />
            <span className="text-sm text-indigo-700">
              Uploading {uploadedFileName}...
            </span>
          </div>
        ) : (
          <>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3 ${
                isDragActive
                  ? 'border-indigo-500 bg-indigo-100'
                  : 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-100/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className="mx-auto mb-2 text-indigo-400" />
              <p className="text-sm font-medium text-indigo-700">
                {isDragActive ? 'Drop your file here' : 'Upload a reference document (optional)'}
              </p>
              <p className="text-xs text-indigo-500 mt-1">PDF, DOCX, or TXT (max 10MB)</p>
            </div>

            <button
              onClick={onSkipAndGenerate}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <FileText size={14} />
              Generate Document{uploadedDocumentsCount > 0 ? ` (${uploadedDocumentsCount} ref docs)` : ''}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Inline upload zone for scope documents (mid-flow) — supports multiple uploads
const ScopeUploadZone: React.FC<{
  onUploadScope: (fileText: string, fileName?: string) => void;
  onSkip: () => void;
  uploadedDocuments?: UploadedDocument[];
  onRemoveDocument?: (docId: string) => void;
}> = ({ onUploadScope, onSkip, uploadedDocuments = [], onRemoveDocument }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setIsUploading(true);
      setUploadingFileName(file.name);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const extractedText = res.data.text || '';
        onUploadScope(extractedText, file.name);
      } catch (err) {
        alert('Failed to upload file. Please try again or skip.');
      } finally {
        setIsUploading(false);
        setUploadingFileName(null);
      }
    },
    [onUploadScope]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: isUploading,
  });

  return (
    <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        {isUploading ? (
          <div className="flex items-center gap-3 justify-center py-3">
            <Loader2 size={20} className="text-amber-600 animate-spin" />
            <span className="text-sm text-amber-700">
              Reading {uploadingFileName}...
            </span>
          </div>
        ) : (
          <>
            {/* Already-uploaded documents */}
            {uploadedDocuments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {uploadedDocuments.map((doc) => (
                  <span
                    key={doc.id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-200 rounded-full"
                  >
                    <FileText size={10} />
                    {doc.name}
                    {onRemoveDocument && (
                      <button
                        onClick={() => onRemoveDocument(doc.id)}
                        className="ml-0.5 text-amber-500 hover:text-amber-700"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3 ${
                isDragActive
                  ? 'border-amber-500 bg-amber-100'
                  : 'border-amber-300 hover:border-amber-400 hover:bg-amber-100/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className="mx-auto mb-2 text-amber-500" />
              <p className="text-sm font-medium text-amber-800">
                {isDragActive
                  ? 'Drop your file here'
                  : uploadedDocuments.length > 0
                  ? 'Upload another reference document'
                  : 'Drop a scope document, SOW, or project brief'}
              </p>
              <p className="text-xs text-amber-600 mt-1">PDF, DOCX, or TXT (max 10MB)</p>
            </div>

            <button
              onClick={onSkip}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <SkipForward size={14} />
              {uploadedDocuments.length > 0 ? 'Continue with these documents' : "Skip — I'll answer the questions instead"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Outline review checklist shown before generation
const OutlineReview: React.FC<{
  sections: OutlineSection[];
  isLoading: boolean;
  onToggle: (id: string) => void;
  onApprove: () => void;
  onRegenerate: () => void;
}> = ({ sections, isLoading, onToggle, onApprove, onRegenerate }) => {
  const includedCount = sections.filter((s) => s.included).length;

  if (isLoading) {
    return (
      <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center gap-3 justify-center py-4">
            <Loader2 size={20} className="text-indigo-600 animate-spin" />
            <span className="text-sm text-indigo-700 font-medium">
              Generating document outline...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (sections.length === 0) return null;

  return (
    <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4">
      <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-200">
          <h4 className="text-sm font-semibold text-indigo-900">
            Proposed Document Outline
          </h4>
          <p className="text-xs text-indigo-600 mt-0.5">
            Toggle sections on or off before generating
          </p>
        </div>

        {/* Section checklist */}
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onToggle(section.id)}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="flex-shrink-0 mt-0.5">
                {section.included ? (
                  <CheckSquare size={16} className="text-indigo-600" />
                ) : (
                  <Square size={16} className="text-gray-300" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    section.included ? 'text-gray-900' : 'text-gray-400 line-through'
                  }`}
                >
                  {section.title}
                </p>
                {section.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {section.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="border-t border-indigo-200 px-4 py-3 bg-gray-50 flex items-center gap-2">
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={12} />
            Regenerate
          </button>
          <button
            onClick={onApprove}
            disabled={includedCount === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileText size={14} />
            Generate Document ({includedCount} sections)
          </button>
        </div>
      </div>
    </div>
  );
};

const Chat: React.FC<ChatProps> = ({
  messages,
  isTyping,
  isGenerating,
  phase,
  guidedStep,
  outlineSections,
  isOutlineLoading,
  currentSection,
  onSendMessage,
  onRetry,
  onFileUpload,
  onSkipStep,
  onSkipToGenerate,
  onScopeUpload,
  onSkipScopeUpload,
  uploadedDocuments,
  onRemoveDocument,
  onTriggerGenerate,
  onToggleOutlineSection,
  onApproveOutline,
  onRegenerateOutline,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, phase]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping || isGenerating) return;
    onSendMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isInputDisabled = isTyping || isGenerating || phase === 'upload_prompt' || phase === 'outline_review' || phase === 'generating';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-4xl mb-3">📋</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                RFP Builder
              </h3>
              <p className="text-sm text-gray-500">
                Starting up...
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onRetry={msg.isError ? onRetry : undefined}
          />
        ))}

        {isTyping && <TypingIndicator />}

        {/* Generating indicator */}
        {isGenerating && (
          <div className="flex gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <Loader2 size={16} className="text-indigo-600 animate-spin" />
            </div>
            <div className="bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-100">
              {currentSection ? (
                <>
                  <p className="text-sm text-indigo-700 font-medium">
                    Generating section {currentSection.index + 1} of {currentSection.total}: {currentSection.title}
                  </p>
                  <div className="mt-2 w-full bg-indigo-200 rounded-full h-1.5">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${((currentSection.index + 1) / currentSection.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-indigo-500 mt-1">
                    Watch sections appear in the document panel →
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-indigo-700 font-medium">
                    Generating your document...
                  </p>
                  <p className="text-xs text-indigo-500 mt-1">
                    Watch it appear in the document panel →
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scope upload zone — shown during upload_scope step */}
      {phase === 'questions' && guidedStep === 'upload_scope' && (
        <ScopeUploadZone
          onUploadScope={onScopeUpload}
          onSkip={onSkipScopeUpload}
          uploadedDocuments={uploadedDocuments}
          onRemoveDocument={onRemoveDocument}
        />
      )}

      {/* Inline upload zone for upload_prompt phase (pre-generation) */}
      {phase === 'upload_prompt' && (
        <InlineUploadZone
          onUploadAndGenerate={(fileText) => onTriggerGenerate(fileText)}
          onSkipAndGenerate={() => onTriggerGenerate()}
          uploadedDocumentsCount={uploadedDocuments?.length || 0}
        />
      )}

      {/* Outline review — shown during outline_review phase */}
      {(phase === 'outline_review' || isOutlineLoading) && (
        <OutlineReview
          sections={outlineSections}
          isLoading={isOutlineLoading}
          onToggle={onToggleOutlineSection}
          onApprove={onApproveOutline}
          onRegenerate={onRegenerateOutline}
        />
      )}

      {/* Skip to Generate bar — shown during questions phase (not on upload_scope) */}
      {phase === 'questions' && guidedStep !== 'upload_scope' && !isTyping && messages.length > 2 && (
        <div className="px-4 pb-2">
          <button
            onClick={onSkipToGenerate}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <FastForward size={12} />
            Skip remaining questions & generate
          </button>
        </div>
      )}

      {/* Input bar — shown during questions phase (not on upload_scope) */}
      {phase === 'questions' && guidedStep !== 'upload_scope' && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white">
          <div className="flex items-end gap-2">
            <button
              onClick={onFileUpload}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Attach file"
              disabled={isGenerating}
            >
              <Paperclip size={18} />
            </button>

            <TextareaAutosize
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isGenerating ? 'Generating document...' : 'Type your answer...'}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-h-32"
              minRows={1}
              maxRows={4}
              disabled={isInputDisabled}
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() || isInputDisabled}
              className="flex-shrink-0 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>

            {/* Skip button */}
            <button
              onClick={onSkipStep}
              disabled={isTyping || isGenerating}
              className="flex-shrink-0 p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Skip this question"
            >
              <SkipForward size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Done phase — show message */}
      {phase === 'done' && (
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 text-center">
          <p className="text-sm text-gray-500">
            ✅ Document generated! Edit sections in the document panel or export using the toolbar.
          </p>
        </div>
      )}
    </div>
  );
};

export default Chat;
