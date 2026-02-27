import React, { useState, useRef, useEffect } from 'react';
import { ModelOption } from '../types';
import { ChevronDown, Zap, Sparkles, Crown } from 'lucide-react';

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModel: string;
  onSelectModel: (modelKey: string) => void;
  disabled?: boolean;
}

const TIER_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  fast: {
    icon: <Zap size={12} />,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  default: {
    icon: <Sparkles size={12} />,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  premium: {
    icon: <Crown size={12} />,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModel,
  onSelectModel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.key === selectedModel) || models[0];

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!models.length) return null;

  const tierConfig = TIER_CONFIG[selected?.tier || 'default'] || TIER_CONFIG.default;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          isOpen
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title="Select AI model"
      >
        <span className={tierConfig.color}>{tierConfig.icon}</span>
        <span className="max-w-[100px] truncate">{selected?.label || 'Model'}</span>
        <ChevronDown
          size={12}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {models.map((model) => {
            const config = TIER_CONFIG[model.tier] || TIER_CONFIG.default;
            const isSelected = model.key === selectedModel;

            return (
              <button
                key={model.key}
                onClick={() => {
                  onSelectModel(model.key);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-indigo-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div
                  className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-lg ${config.bg} ${config.color}`}
                >
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        isSelected ? 'text-indigo-700' : 'text-gray-800'
                      }`}
                    >
                      {model.label}
                    </span>
                    {model.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{model.description}</p>
                </div>
                {isSelected && (
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
