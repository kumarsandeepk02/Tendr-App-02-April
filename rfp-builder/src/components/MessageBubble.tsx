import React from 'react';
import { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, RotateCcw, Bot, User } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRetry }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-gray-600" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-indigo-600 text-white'
            : isError
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {isError && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertCircle size={14} className="text-red-500" />
            <span className="text-xs font-medium text-red-600">Error</span>
          </div>
        )}

        <div
          className={`prose prose-sm max-w-none ${
            isUser
              ? 'prose-invert'
              : isError
              ? 'prose-red'
              : ''
          }`}
        >
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        <div
          className={`flex items-center gap-2 mt-1 ${
            isUser ? 'justify-start' : 'justify-end'
          }`}
        >
          <span
            className={`text-[10px] ${
              isUser
                ? 'text-indigo-200'
                : isError
                ? 'text-red-400'
                : 'text-gray-400'
            }`}
          >
            {time}
          </span>
        </div>

        {isError && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
          >
            <RotateCcw size={12} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
