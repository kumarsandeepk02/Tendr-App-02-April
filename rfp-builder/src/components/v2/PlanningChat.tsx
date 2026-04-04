import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, UploadedDocument } from '../../types';
import MessageBubble from '../MessageBubble';
import TextareaAutosize from 'react-textarea-autosize';
import { useDropzone } from 'react-dropzone';
import { api } from '../../utils/api';
import {
  Send,
  Loader2,
  Upload,
  ArrowRight,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';


interface PlanningChatProps {
  messages: ChatMessage[];
  isTyping: boolean;
  uploadedDocuments: UploadedDocument[];
  onSendMessage: (content: string) => void;
  onUpload: (fileText: string, fileName?: string) => void;
  onRemoveDocument: (docId: string) => void;
  onGenerateBrief: () => void;
  isBriefLoading: boolean;
}

const PlanningChat: React.FC<PlanningChatProps> = ({
  messages,
  isTyping,
  uploadedDocuments,
  onSendMessage,
  onUpload,
  onRemoveDocument,
  onGenerateBrief,
  isBriefLoading,
}) => {
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isTyping || isBriefLoading) return;
    onSendMessage(trimmed);
    setInput('');
  }, [input, isTyping, isBriefLoading, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // File upload handler
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
        onUpload(res.data.text || '', file.name);
      } catch {
        alert('Failed to upload file. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  });

  const canGenerateBrief = messages.filter((m) => m.role === 'user' && !m.isError).length >= 1;

  return (
    <div className="flex flex-col h-full" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-indigo-50/80 backdrop-blur-sm flex items-center justify-center rounded-xl border-2 border-dashed border-indigo-300">
          <div className="text-center">
            <Upload size={32} className="text-indigo-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-indigo-700">Drop your file here</p>
            <p className="text-xs text-indigo-500">PDF, DOCX, or TXT</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-1">
          {messages.filter((msg) => msg.role !== 'system' && !msg.hidden).map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isTyping && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Uploaded documents pills */}
      {uploadedDocuments.length > 0 && (
        <div className="px-4 pb-2">
          <div className="max-w-2xl mx-auto flex flex-wrap gap-2">
            {uploadedDocuments.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
              >
                <FileText size={12} />
                {doc.name}
                <button
                  onClick={() => onRemoveDocument(doc.id)}
                  className="hover:text-indigo-900 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {/* Generate Brief CTA */}
          {canGenerateBrief && (
            <div className="mb-3 flex justify-center">
              <button
                onClick={onGenerateBrief}
                disabled={isBriefLoading || isTyping}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
              >
                {isBriefLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Creating brief...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Ready? Generate Brief
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2">
            {/* Upload button */}
            <label className="flex-shrink-0 p-2 text-gray-400 hover:text-indigo-600 cursor-pointer transition-colors rounded-lg hover:bg-indigo-50">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploading(true);
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await api.post('/api/upload', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    onUpload(res.data.text || '', file.name);
                  } catch {
                    alert('Failed to upload file.');
                  } finally {
                    setIsUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              {isUploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Upload size={18} />
              )}
            </label>

            {/* Text input */}
            <TextareaAutosize
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your project..."
              minRows={1}
              maxRows={6}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              disabled={isTyping || isBriefLoading}
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || isBriefLoading}
              className="flex-shrink-0 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="flex gap-3 mb-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
      <Loader2 size={16} className="text-gray-500 animate-spin" />
    </div>
    <div className="bg-gray-100 rounded-2xl px-4 py-3">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

export default PlanningChat;
