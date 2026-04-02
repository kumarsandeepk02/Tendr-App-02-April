import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { UnifiedFlowPhase } from '../types';

interface PersistentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface PersistentChatProps {
  phase: UnifiedFlowPhase;
  isGenerating: boolean;
  onSendMessage: (content: string) => Promise<string>;
  /** Section titles for context hints */
  sectionTitles?: string[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const PersistentChat: React.FC<PersistentChatProps> = ({
  phase,
  isGenerating,
  onSendMessage,
  sectionTitles = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<PersistentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Show welcome message when first opened in done phase
  const welcomeShownRef = useRef(false);
  useEffect(() => {
    if (isOpen && phase === 'done' && !welcomeShownRef.current && messages.length === 0) {
      welcomeShownRef.current = true;
      setMessages([
        {
          id: generateId(),
          role: 'assistant',
          content: "Your document is ready! I can help you refine it. Try things like:\n- \"Make the Scope of Work more detailed\"\n- \"Add compliance language to Terms & Conditions\"\n- \"What's missing from this RFP?\"",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isOpen, phase, messages.length]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isTyping) return;

    // Add user message
    const userMsg: PersistentMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const reply = await onSendMessage(content);
      const assistantMsg: PersistentMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If panel is minimized, mark unread
      if (isMinimized) {
        setHasUnread(true);
      }
    } catch (err) {
      const errorMsg: PersistentMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, isMinimized, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsMinimized(false);
      setHasUnread(false);
    } else {
      setIsOpen(false);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized((prev) => {
      if (prev) setHasUnread(false);
      return !prev;
    });
  };

  // Don't show during questions or outline_review phase (main chat is visible)
  if (phase === 'questions' || phase === 'upload_prompt' || phase === 'outline_review') {
    return null;
  }

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={toggleOpen}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          title="Open AI assistant"
        >
          <MessageSquare size={24} className="group-hover:scale-110 transition-transform" />
          {hasUnread && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all duration-300 ${
            isMinimized ? 'w-72 h-14' : 'w-96 h-[32rem]'
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl cursor-pointer"
            onClick={isMinimized ? toggleMinimize : undefined}
          >
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-indigo-200" />
              <span className="text-sm font-semibold text-white">
                AI Assistant
              </span>
              {isTyping && (
                <span className="text-xs text-indigo-200 animate-pulse">typing...</span>
              )}
              {hasUnread && isMinimized && (
                <span className="w-2 h-2 bg-red-400 rounded-full" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
                className="p-1 text-indigo-200 hover:text-white rounded transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                <Minimize2 size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                className="p-1 text-indigo-200 hover:text-white rounded transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && !isTyping && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Bot size={40} className="text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">
                      {isGenerating
                        ? 'Document is being generated... Ask me anything in the meantime!'
                        : "Ask me anything about your document. I'm here to help!"}
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User size={12} className="text-white" />
                      ) : (
                        <Bot size={12} className="text-gray-600" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-gray-200">
                      <Bot size={12} className="text-gray-600" />
                    </div>
                    <div className="bg-gray-100 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin text-indigo-600" />
                        <span className="text-xs text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-gray-100 px-3 py-2">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isGenerating
                        ? 'Ask a question while generating...'
                        : 'Ask anything or give editing instructions...'
                    }
                    rows={1}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none max-h-20"
                    style={{ minHeight: '36px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default PersistentChat;
