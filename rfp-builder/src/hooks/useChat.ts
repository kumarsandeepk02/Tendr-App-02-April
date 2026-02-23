import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { ChatMessage, GuidedStep, ChatRole, UnifiedFlowPhase } from '../types';
import {
  GUIDED_QUESTIONS,
  WELCOME_MESSAGE,
  getNextGuidedStep,
  buildQuestionSystemAddendum,
  buildGenerationSystemPrompt,
  buildGenerationPrompt,
} from '../utils/prompts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

interface UseChatOptions {
  onSectionsUpdate?: (markdown: string) => void;
  onMetaUpdate?: (updates: Record<string, string>) => void;
  onStreamStart?: () => void;
  onStreamChunk?: (chunk: string) => void;
  onStreamDone?: (fullText: string) => void;
  projectId?: string | null;
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [guidedStep, setGuidedStep] = useState<GuidedStep | null>(null);
  const [phase, setPhase] = useState<UnifiedFlowPhase>('questions');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [gatheredAnswers, setGatheredAnswers] = useState<Record<string, string>>({});
  const [uploadedFileText, setUploadedFileText] = useState<string>('');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Autosave chat state
  useEffect(() => {
    const projectId = optionsRef.current?.projectId;
    const storageKey = projectId
      ? `rfp_project_${projectId}`
      : 'rfp_draft_current';
    const timeout = setTimeout(() => {
      try {
        const existing = window.localStorage.getItem(storageKey);
        const draft = existing ? JSON.parse(existing) : {};
        draft.chatState = { messages, guidedStep, phase };
        draft.savedAt = Date.now();
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Chat autosave failed:', e);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [messages, guidedStep, phase]);

  const addMessage = useCallback(
    (role: ChatRole, content: string, extra?: Partial<ChatMessage>) => {
      const msg: ChatMessage = {
        id: generateId(),
        role,
        content,
        timestamp: Date.now(),
        ...extra,
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    []
  );

  // Start the unified flow — show welcome + first question
  const startFlow = useCallback(() => {
    const firstStep: GuidedStep = 'doc_type';
    setGuidedStep(firstStep);
    setPhase('questions');

    // Add welcome message
    addMessage('assistant', WELCOME_MESSAGE);

    // Add first question after a brief delay
    setTimeout(() => {
      addMessage('assistant', GUIDED_QUESTIONS[firstStep]);
    }, 400);
  }, [addMessage]);

  // Send message to API for Q&A (non-streaming, just acknowledgement)
  const sendToApi = useCallback(
    async (allMessages: ChatMessage[]) => {
      setIsTyping(true);
      setError(null);

      try {
        const apiMessages = allMessages
          .filter((m) => !m.isLoading && !m.isError)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const systemAddendum = buildQuestionSystemAddendum(guidedStep);

        const res = await axios.post(`${API_URL}/api/chat`, {
          messages: apiMessages,
          systemPrompt: systemAddendum || undefined,
        });

        const assistantContent = res.data.content;

        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        return assistantMsg;
      } catch (err: any) {
        const errorMsg =
          err?.response?.data?.error ||
          'Sorry, there was an issue generating content. Please try again.';
        setError(errorMsg);

        const errorBubble: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorBubble]);
        return null;
      } finally {
        setIsTyping(false);
      }
    },
    [guidedStep]
  );

  // Advance to the next guided step (or transition to upload_prompt if done)
  const advanceStep = useCallback(
    (currentStep: GuidedStep) => {
      const nextStep = getNextGuidedStep(currentStep);
      if (nextStep) {
        if (nextStep === 'review') {
          // 'review' is the last step — transition to upload_prompt
          setGuidedStep(null);
          setPhase('upload_prompt');
          setTimeout(() => {
            addMessage(
              'assistant',
              GUIDED_QUESTIONS['review']
            );
          }, 400);
        } else {
          setGuidedStep(nextStep);
          setTimeout(() => {
            addMessage('assistant', GUIDED_QUESTIONS[nextStep]);
          }, 400);
        }
      } else {
        // No more steps
        setGuidedStep(null);
        setPhase('upload_prompt');
        setTimeout(() => {
          addMessage(
            'assistant',
            "I have all the information I need. Click **Generate Document** below to create your complete procurement document, or upload a reference file first."
          );
        }, 400);
      }
    },
    [addMessage]
  );

  // Send user message (answer to a guided question)
  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg = addMessage('user', content);

      // Store the answer
      if (guidedStep) {
        setGatheredAnswers((prev) => ({ ...prev, [guidedStep]: content }));
      }

      // Handle meta updates based on step
      if (guidedStep) {
        switch (guidedStep) {
          case 'doc_type':
            optionsRef.current?.onMetaUpdate?.({
              type: content.toUpperCase().includes('RFI') ? 'RFI' : 'RFP',
            });
            break;
          case 'project_title':
            optionsRef.current?.onMetaUpdate?.({ projectTitle: content });
            break;
          case 'project_description':
            optionsRef.current?.onMetaUpdate?.({ projectDescription: content });
            break;
        }
      }

      const updatedMessages = [
        ...messages,
        {
          id: userMsg.id,
          role: 'user' as ChatRole,
          content,
          timestamp: Date.now(),
        },
      ];

      // Call API for acknowledgement
      const response = await sendToApi(updatedMessages);

      // Advance to next step
      if (guidedStep && response && !response.isError) {
        advanceStep(guidedStep);
      }
    },
    [messages, guidedStep, addMessage, sendToApi, advanceStep]
  );

  // Skip the current question
  const skipCurrentStep = useCallback(() => {
    if (!guidedStep) return;

    addMessage('user', '*(Skipped)*');

    // Show a brief skip acknowledgement
    setTimeout(() => {
      advanceStep(guidedStep);
    }, 200);
  }, [guidedStep, addMessage, advanceStep]);

  // Handle scope document upload at upload_scope step
  const handleScopeUpload = useCallback(
    (fileText: string) => {
      setUploadedFileText(fileText);
      addMessage('user', '📄 *(Uploaded a scope document)*');

      setTimeout(() => {
        addMessage(
          'assistant',
          "Great, I've read your document! I'll use it to generate more relevant sections and questions. Let's continue with a few more details."
        );
        // Advance past upload_scope to requirements
        const nextStep = getNextGuidedStep('upload_scope');
        if (nextStep) {
          setGuidedStep(nextStep);
          setTimeout(() => {
            addMessage('assistant', GUIDED_QUESTIONS[nextStep]);
          }, 400);
        }
      }, 300);
    },
    [addMessage]
  );

  // Skip scope upload step
  const skipScopeUpload = useCallback(() => {
    addMessage('user', '*(Skipped upload)*');
    const nextStep = getNextGuidedStep('upload_scope');
    if (nextStep) {
      setGuidedStep(nextStep);
      setTimeout(() => {
        addMessage('assistant', GUIDED_QUESTIONS[nextStep]);
      }, 200);
    }
  }, [addMessage]);

  // Skip all remaining questions and go to upload prompt
  const skipToGenerate = useCallback(() => {
    addMessage('user', '*(Skipping remaining questions)*');
    setGuidedStep(null);
    setPhase('upload_prompt');

    setTimeout(() => {
      addMessage(
        'assistant',
        "No problem! I'll work with what we have. You can upload a reference document below, or click **Generate Document** to proceed."
      );
    }, 300);
  }, [addMessage]);

  // Stream-based generation
  const streamGenerate = useCallback(
    async (fileContext?: string) => {
      setIsGenerating(true);
      setPhase('generating');
      setError(null);

      // Notify that streaming is starting
      optionsRef.current?.onStreamStart?.();

      try {
        const docType = (gatheredAnswers.doc_type?.toUpperCase().includes('RFI') ? 'RFI' : 'RFP') as 'RFI' | 'RFP';
        const systemPrompt = buildGenerationSystemPrompt(docType);
        const userPrompt = buildGenerationPrompt(gatheredAnswers, fileContext);

        const apiMessages = [
          { role: 'user' as const, content: userPrompt },
        ];

        const response = await fetch(`${API_URL}/api/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            systemPrompt,
          }),
        });

        if (!response.ok) {
          throw new Error('Stream request failed');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'text') {
                  optionsRef.current?.onStreamChunk?.(parsed.content);
                } else if (parsed.type === 'done') {
                  optionsRef.current?.onStreamDone?.(parsed.content);
                } else if (parsed.type === 'error') {
                  throw new Error(parsed.content);
                }
              } catch (parseErr: any) {
                if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
                  if (parseErr.message === 'Stream failed. Please try again.') {
                    throw parseErr;
                  }
                  // swallow partial parse errors
                }
              }
            }
          }
        }

        // Add completion message
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: '✅ Your document has been generated! You can review and edit each section in the document panel.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setPhase('done');
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to generate document. Please try again.';
        setError(errorMsg);
        const errorBubble: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorBubble]);
        setPhase('upload_prompt'); // Allow retry
      } finally {
        setIsGenerating(false);
      }
    },
    [gatheredAnswers]
  );

  // Trigger generation (with optional additional file context from final upload)
  const triggerGenerate = useCallback(
    (fileText?: string) => {
      // Combine scope document (uploaded earlier) with any final upload
      const combinedContext = [uploadedFileText, fileText || '']
        .filter(Boolean)
        .join('\n\n---\n\n');
      streamGenerate(combinedContext || undefined);
    },
    [uploadedFileText, streamGenerate]
  );

  const retryLast = useCallback(async () => {
    const nonErrorMessages = messages.filter((m) => !m.isError);
    setMessages(nonErrorMessages);
    await sendToApi(nonErrorMessages);
  }, [messages, sendToApi]);

  const restoreChat = useCallback(
    (state: {
      messages: ChatMessage[];
      guidedStep: GuidedStep | null;
      phase: UnifiedFlowPhase;
    }) => {
      setMessages(state.messages);
      setGuidedStep(state.guidedStep);
      setPhase(state.phase || 'questions');
    },
    []
  );

  const resetChat = useCallback(() => {
    setMessages([]);
    setGuidedStep(null);
    setPhase('questions');
    setError(null);
    setGatheredAnswers({});
    setUploadedFileText('');
    setIsGenerating(false);
  }, []);

  return {
    messages,
    guidedStep,
    phase,
    isTyping,
    error,
    isGenerating,
    gatheredAnswers,
    startFlow,
    sendMessage,
    skipCurrentStep,
    skipToGenerate,
    handleScopeUpload,
    skipScopeUpload,
    triggerGenerate,
    retryLast,
    restoreChat,
    resetChat,
  };
}
