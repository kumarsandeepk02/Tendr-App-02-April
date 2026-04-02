import { useState, useCallback, useEffect, useRef } from 'react';
import { api, authFetch, API_URL } from '../utils/api';
import { ChatMessage, GuidedStep, ChatRole, UnifiedFlowPhase, OutlineSection, QualityReview, UploadedDocument, DocumentAnalysis, CompetitiveIntelligence, ModelOption } from '../types';
import {
  GUIDED_QUESTIONS,
  WELCOME_MESSAGE,
  getNextGuidedStep,
  buildQuestionSystemAddendum,
  buildGenerationSystemPrompt,
  buildGenerationPrompt,
  buildOutlinePrompt,
  buildAdaptiveQuestionPrompt,
  ADAPTIVE_STEPS,
} from '../utils/prompts';

// API_URL imported from ../utils/api

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const USE_PIPELINE = process.env.REACT_APP_USE_PIPELINE === 'true';

interface UseChatOptions {
  onSectionsUpdate?: (markdown: string) => void;
  onMetaUpdate?: (updates: Record<string, string>) => void;
  onStreamStart?: () => void;
  onStreamChunk?: (chunk: string) => void;
  onStreamDone?: (fullText: string) => void;
  onSectionStart?: (title: string, index: number, total: number) => void;
  onSectionDone?: (title: string, content: string) => void;
  onReviewResult?: (review: QualityReview) => void;
  onDocumentAnalysis?: (analysis: DocumentAnalysis) => void;
  onCompetitiveIntel?: (intel: CompetitiveIntelligence) => void;
  onSectionRegenerationStart?: (sectionId: string) => void;
  onSectionRegenerationDone?: (sectionId: string, content: string) => void;
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
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  const [isOutlineLoading, setIsOutlineLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('rfp_selected_model') || '';
  });
  const fileContextRef = useRef<string | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Fetch available models on mount
  useEffect(() => {
    api.get('/api/chat/models')
      .then((res) => {
        const data = res.data;
        setAvailableModels(data.models || []);
        // If no model selected yet, use the default
        if (!selectedModel && data.default) {
          setSelectedModel(data.default);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch models:', err);
        // Fallback: provide a default model list
        setAvailableModels([
          { key: 'sonnet', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Balanced speed & quality', tier: 'default', isDefault: true },
          { key: 'haiku', id: 'claude-haiku-4-5-20250414', label: 'Claude Haiku 4.5', description: 'Fastest, most affordable', tier: 'fast', isDefault: false },
          { key: 'opus', id: 'claude-opus-4-2025-04-16', label: 'Claude Opus 4', description: 'Highest quality output', tier: 'premium', isDefault: false },
        ]);
        if (!selectedModel) setSelectedModel('sonnet');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist model selection
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('rfp_selected_model', selectedModel);
    }
  }, [selectedModel]);

  // Autosave chat state (including gatheredAnswers and uploadedFileText)
  useEffect(() => {
    const projectId = optionsRef.current?.projectId;
    const storageKey = projectId
      ? `rfp_project_${projectId}`
      : 'rfp_draft_current';
    const timeout = setTimeout(() => {
      try {
        const existing = window.localStorage.getItem(storageKey);
        const draft = existing ? JSON.parse(existing) : {};
        // Truncate uploadedFileText to avoid localStorage quota issues
        const truncatedFileText = uploadedFileText.length > 10000
          ? uploadedFileText.substring(0, 10000)
          : uploadedFileText;
        // Truncate each uploaded document text to save space
        const truncatedDocs = uploadedDocuments.map((d) => ({
          ...d,
          text: d.text.length > 10000 ? d.text.substring(0, 10000) : d.text,
        }));
        draft.chatState = { messages, guidedStep, phase, gatheredAnswers, uploadedFileText: truncatedFileText, uploadedDocuments: truncatedDocs, outlineSections };
        draft.savedAt = Date.now();
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Chat autosave failed:', e);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [messages, guidedStep, phase, gatheredAnswers, uploadedFileText, uploadedDocuments, outlineSections]);

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

        const res = await api.post('/api/chat', {
          messages: apiMessages,
          systemPrompt: systemAddendum || undefined,
          model: selectedModel || undefined,
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
    [guidedStep, selectedModel]
  );

  // Generate a contextual follow-up question using Claude (for adaptive Q&A)
  const generateAdaptiveQuestion = useCallback(
    async (nextStep: GuidedStep): Promise<string | null> => {
      try {
        const prompt = buildAdaptiveQuestionPrompt(nextStep, gatheredAnswers);
        const res = await api.post('/api/chat', {
          messages: [{ role: 'user', content: prompt }],
          systemPrompt: 'You are helping a user build a procurement document. Generate exactly ONE contextual follow-up question. Output ONLY the question text, nothing else. Use **bold** for key terms. Max 2 sentences.',
          model: selectedModel || undefined,
        });
        const question = res.data.content?.trim();
        return question && question.length > 10 ? question : null;
      } catch {
        return null;
      }
    },
    [gatheredAnswers, selectedModel]
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

          // Use adaptive questions for context-sensitive steps
          if (ADAPTIVE_STEPS.has(nextStep)) {
            setIsTyping(true);
            generateAdaptiveQuestion(nextStep).then((adaptiveQ) => {
              setIsTyping(false);
              const questionText = adaptiveQ || GUIDED_QUESTIONS[nextStep];
              addMessage('assistant', questionText);
            });
          } else {
            setTimeout(() => {
              addMessage('assistant', GUIDED_QUESTIONS[nextStep]);
            }, 400);
          }
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
    [addMessage, generateAdaptiveQuestion]
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

  // Handle scope document upload at upload_scope step (supports multiple uploads)
  const handleScopeUpload = useCallback(
    (fileText: string, fileName?: string) => {
      // Append to uploadedDocuments array
      const newDoc: UploadedDocument = {
        id: generateId(),
        name: fileName || `Document ${uploadedDocuments.length + 1}`,
        text: fileText,
        uploadedAt: Date.now(),
      };
      setUploadedDocuments((prev) => [...prev, newDoc]);

      // Also update combined uploadedFileText for backward compatibility
      setUploadedFileText((prev) => {
        const separator = prev ? '\n\n---\n\n' : '';
        return prev + separator + fileText;
      });

      addMessage('user', `📄 *(Uploaded: ${newDoc.name})*`);

      // Only advance from upload_scope on the first upload
      if (uploadedDocuments.length === 0) {
        setTimeout(() => {
          addMessage(
            'assistant',
            "Great, I've read your document! I'll use it to generate more relevant sections and questions. You can upload more documents, or let's continue."
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
      } else {
        setTimeout(() => {
          addMessage('assistant', `Got it! I've added "${newDoc.name}" to your reference documents (${uploadedDocuments.length + 1} total).`);
        }, 300);
      }
    },
    [addMessage, uploadedDocuments]
  );

  // Remove a specific uploaded document
  const removeUploadedDocument = useCallback(
    (docId: string) => {
      setUploadedDocuments((prev) => {
        const updated = prev.filter((d) => d.id !== docId);
        // Rebuild combined file text
        setUploadedFileText(updated.map((d) => d.text).join('\n\n---\n\n'));
        return updated;
      });
    },
    []
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

  // Track which async pipeline results were received via SSE
  const pipelineResultsRef = useRef({ competitiveIntel: false, documentAnalysis: false });

  // Helper: read SSE stream and dispatch events to callbacks
  const readSSEStream = useCallback(async (response: Response, usePipeline: boolean) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';

    // Reset tracking for this stream
    if (usePipeline) {
      pipelineResultsRef.current = { competitiveIntel: false, documentAnalysis: false };
    }

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
            } else if (usePipeline && parsed.type === 'section_start') {
              optionsRef.current?.onSectionStart?.(parsed.title, parsed.index, parsed.total);
            } else if (usePipeline && parsed.type === 'section_done') {
              optionsRef.current?.onSectionDone?.(parsed.title, parsed.content);
            } else if (usePipeline && parsed.type === 'review') {
              optionsRef.current?.onReviewResult?.(parsed.content);
            } else if (usePipeline && parsed.type === 'document_analysis') {
              pipelineResultsRef.current.documentAnalysis = true;
              optionsRef.current?.onDocumentAnalysis?.(parsed.content);
            } else if (usePipeline && parsed.type === 'competitive_intel') {
              pipelineResultsRef.current.competitiveIntel = true;
              optionsRef.current?.onCompetitiveIntel?.(parsed.content);
            }
          } catch (parseErr: any) {
            if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              if (parseErr.message === 'Stream failed. Please try again.' || parseErr.message === 'Pipeline failed. Please try again.') {
                throw parseErr;
              }
              // swallow partial parse errors
            }
          }
        }
      }
    }
  }, []);

  // Stream-based generation (monolithic fallback)
  const streamGenerateMonolithic = useCallback(
    async (fileContext?: string, confirmedSections?: string[]) => {
      const docType = (gatheredAnswers.doc_type?.toUpperCase().includes('RFI') ? 'RFI' : 'RFP') as 'RFI' | 'RFP';
      const systemPrompt = buildGenerationSystemPrompt(docType, gatheredAnswers, confirmedSections);
      const userPrompt = buildGenerationPrompt(gatheredAnswers, fileContext);

      const MAX_HISTORY_MESSAGES = 20;
      const recentMessages = messages
        .filter((m) => !m.isLoading && !m.isError)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const apiMessages = [
        ...recentMessages,
        { role: 'user' as const, content: userPrompt },
      ];

      const response = await authFetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          systemPrompt,
          model: selectedModel || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      await readSSEStream(response, false);
    },
    [gatheredAnswers, messages, readSSEStream, selectedModel]
  );

  // Pipeline-based generation (multi-agent)
  const streamGeneratePipeline = useCallback(
    async (fileContext?: string, confirmedSections?: string[]) => {
      const docType = (gatheredAnswers.doc_type?.toUpperCase().includes('RFI') ? 'RFI' : 'RFP') as 'RFI' | 'RFP';

      const response = await authFetch(`${API_URL}/api/chat/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: gatheredAnswers,
          fileContext,
          docType,
          confirmedSections,
          uploadedDocuments: uploadedDocuments.map((d) => ({ name: d.name, text: d.text })),
          model: selectedModel || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Pipeline request failed');
      }

      await readSSEStream(response, true);

      // Backup fetch: if competitive intel was not received via SSE (proxy buffering
      // can drop late events), fetch it via a dedicated API call.
      if (!pipelineResultsRef.current.competitiveIntel) {
        try {
          const intelRes = await authFetch(`${API_URL}/api/chat/competitive-intel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docType, answers: gatheredAnswers, model: selectedModel || undefined }),
          });
          if (intelRes.ok) {
            const intel = await intelRes.json();
            if (intel && (intel.industryBenchmarks?.length > 0 || intel.marketStandards?.length > 0 || intel.riskFactors?.length > 0)) {
              optionsRef.current?.onCompetitiveIntel?.(intel);
            }
          }
        } catch (intelErr) {
          console.warn('Backup competitive intel fetch failed:', intelErr);
        }
      }

      // Note: Document analysis backup fetch is skipped here because it requires
      // generatedSections which aren't available in this scope. The SSE delivery
      // for document_analysis is more reliable since it arrives with the stream.
    },
    [gatheredAnswers, uploadedDocuments, readSSEStream, selectedModel]
  );

  // Stream-based generation — uses pipeline or monolithic based on feature flag
  const streamGenerate = useCallback(
    async (fileContext?: string, confirmedSections?: string[]) => {
      setIsGenerating(true);
      setPhase('generating');
      setError(null);

      // Notify that streaming is starting
      optionsRef.current?.onStreamStart?.();

      try {
        if (USE_PIPELINE) {
          try {
            await streamGeneratePipeline(fileContext, confirmedSections);
          } catch (pipelineErr) {
            console.warn('Pipeline failed, falling back to monolithic:', pipelineErr);
            // Reset stream state for fallback
            optionsRef.current?.onStreamStart?.();
            await streamGenerateMonolithic(fileContext, confirmedSections);
          }
        } else {
          await streamGenerateMonolithic(fileContext, confirmedSections);
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
    [streamGeneratePipeline, streamGenerateMonolithic]
  );

  // Generate an outline (lightweight non-streaming call) before full generation
  const generateOutline = useCallback(
    async (fileContext?: string) => {
      setIsOutlineLoading(true);
      setError(null);

      try {
        const outlinePrompt = buildOutlinePrompt(gatheredAnswers, fileContext);

        const res = await api.post('/api/chat', {
          messages: [{ role: 'user', content: outlinePrompt }],
          systemPrompt: 'You are an expert procurement consultant. Return ONLY a valid JSON array as requested. No other text.',
          model: selectedModel || undefined,
        });

        const content = res.data.content || '';

        // Extract JSON from the response (handle markdown code fences)
        let jsonStr = content;
        const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          jsonStr = fenceMatch[1].trim();
        }

        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) {
          throw new Error('Invalid outline format');
        }

        const sections: OutlineSection[] = parsed.map(
          (item: { title: string; description: string }, idx: number) => ({
            id: generateId(),
            title: item.title,
            description: item.description || '',
            included: true,
            order: idx,
          })
        );

        setOutlineSections(sections);
        setPhase('outline_review');

        addMessage(
          'assistant',
          "Here's a proposed outline for your document. Toggle sections on or off, then click **Generate Document** to proceed.",
          { isOutline: true }
        );
      } catch (err: any) {
        console.warn('Outline generation failed, proceeding with default sections:', err);
        // Fall back to direct generation without outline
        setOutlineSections([]);
        streamGenerate(fileContext);
        return;
      } finally {
        setIsOutlineLoading(false);
      }
    },
    [gatheredAnswers, addMessage, streamGenerate, selectedModel]
  );

  // Trigger generation — now goes through outline step first
  const triggerGenerate = useCallback(
    (fileText?: string) => {
      // Combine scope document (uploaded earlier) with any final upload
      const combinedContext = [uploadedFileText, fileText || '']
        .filter(Boolean)
        .join('\n\n---\n\n');
      fileContextRef.current = combinedContext || undefined;
      generateOutline(combinedContext || undefined);
    },
    [uploadedFileText, generateOutline]
  );

  // Toggle a section in the outline
  const toggleOutlineSection = useCallback((sectionId: string) => {
    setOutlineSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, included: !s.included } : s
      )
    );
  }, []);

  // Approve the outline and proceed to full generation
  const approveOutline = useCallback(() => {
    const confirmedTitles = outlineSections
      .filter((s) => s.included)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.title);

    addMessage('user', `Generate document with ${confirmedTitles.length} sections`);
    streamGenerate(fileContextRef.current, confirmedTitles);
  }, [outlineSections, addMessage, streamGenerate]);

  // Regenerate the outline (re-call Claude for a new proposal)
  const regenerateOutline = useCallback(() => {
    setOutlineSections([]);
    generateOutline(fileContextRef.current);
  }, [generateOutline]);

  // --- Section Regeneration ---

  /**
   * Regenerate a single document section by streaming from the backend.
   * Shared by both section-level regen (Feature 1) and quality review fix (Feature 3).
   */
  const regenerateSection = useCallback(
    async (
      sectionId: string,
      sectionTitle: string,
      currentContent: string,
      instruction: string
    ) => {
      const docType = gatheredAnswers.doc_type?.toUpperCase().includes('RFI') ? 'RFI' : 'RFP';

      // Notify start
      optionsRef.current?.onSectionRegenerationStart?.(sectionId);

      try {
        const response = await authFetch(`${API_URL}/api/chat/regenerate-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionTitle,
            currentContent,
            instruction,
            docType,
            answers: gatheredAnswers,
            fileContext: uploadedFileText || undefined,
            model: selectedModel || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error('Regeneration request failed');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

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
                  fullText += parsed.content;
                } else if (parsed.type === 'done') {
                  fullText = parsed.content;
                } else if (parsed.type === 'error') {
                  throw new Error(parsed.content);
                }
              } catch (parseErr: any) {
                if (parseErr.message && !parseErr.message.includes('Unexpected end of JSON input')) {
                  throw parseErr;
                }
              }
            }
          }
        }

        // Notify done with the full regenerated text
        optionsRef.current?.onSectionRegenerationDone?.(sectionId, fullText);
        return fullText;
      } catch (err: any) {
        console.error('Section regeneration failed:', err);
        setError(err.message || 'Section regeneration failed');
        // Clear regeneration state on error
        optionsRef.current?.onSectionRegenerationDone?.(sectionId, currentContent);
        return null;
      }
    },
    [gatheredAnswers, uploadedFileText, selectedModel]
  );

  /**
   * Copilot edit: same backend as regenerateSection, but does NOT trigger
   * the regeneration overlay. Returns the new content string directly
   * so the caller can put it into the textarea buffer.
   */
  const copilotEdit = useCallback(
    async (
      sectionId: string,
      sectionTitle: string,
      currentContent: string,
      instruction: string
    ): Promise<string | null> => {
      const docType = gatheredAnswers.doc_type?.toUpperCase().includes('RFI') ? 'RFI' : 'RFP';

      try {
        const response = await authFetch(`${API_URL}/api/chat/regenerate-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionTitle,
            currentContent,
            instruction,
            docType,
            answers: gatheredAnswers,
            fileContext: uploadedFileText || undefined,
            model: selectedModel || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error('Copilot edit request failed');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

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
                  fullText += parsed.content;
                } else if (parsed.type === 'done') {
                  fullText = parsed.content;
                } else if (parsed.type === 'error') {
                  throw new Error(parsed.content);
                }
              } catch (parseErr: any) {
                if (parseErr.message && !parseErr.message.includes('Unexpected end of JSON input')) {
                  throw parseErr;
                }
              }
            }
          }
        }

        return fullText;
      } catch (err: any) {
        console.error('Copilot edit failed:', err);
        return null;
      }
    },
    [gatheredAnswers, uploadedFileText, selectedModel]
  );

  /**
   * Fix a specific quality review issue by regenerating the target section.
   */
  const fixIssue = useCallback(
    async (
      sectionTitle: string,
      issueMessage: string,
      sectionId: string,
      currentContent: string
    ) => {
      const instruction = `Fix this issue: ${issueMessage}`;
      return regenerateSection(sectionId, sectionTitle, currentContent, instruction);
    },
    [regenerateSection]
  );

  /**
   * Fix all error-severity issues sequentially.
   */
  const fixAllErrors = useCallback(
    async (
      issues: Array<{ section: string; message: string; sectionId: string; currentContent: string }>,
      onFixStart?: (section: string, index: number) => void,
      onFixDone?: () => void
    ) => {
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        onFixStart?.(issue.section, i);
        await fixIssue(issue.section, issue.message, issue.sectionId, issue.currentContent);
        onFixDone?.();
      }
    },
    [fixIssue]
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
      gatheredAnswers?: Record<string, string>;
      uploadedFileText?: string;
      uploadedDocuments?: UploadedDocument[];
      outlineSections?: OutlineSection[];
    }) => {
      setMessages(state.messages);
      setGuidedStep(state.guidedStep);
      setPhase(state.phase || 'questions');
      setGatheredAnswers(state.gatheredAnswers || {});
      setUploadedFileText(state.uploadedFileText || '');
      setUploadedDocuments(state.uploadedDocuments || []);
      setOutlineSections(state.outlineSections || []);
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
    setUploadedDocuments([]);
    setOutlineSections([]);
    setIsGenerating(false);
    setIsOutlineLoading(false);
    fileContextRef.current = undefined;
  }, []);

  return {
    messages,
    guidedStep,
    phase,
    isTyping,
    error,
    isGenerating,
    gatheredAnswers,
    uploadedFileText,
    uploadedDocuments,
    removeUploadedDocument,
    outlineSections,
    isOutlineLoading,
    startFlow,
    sendMessage,
    skipCurrentStep,
    skipToGenerate,
    handleScopeUpload,
    skipScopeUpload,
    triggerGenerate,
    toggleOutlineSection,
    approveOutline,
    regenerateOutline,
    retryLast,
    restoreChat,
    resetChat,
    // Section regeneration & quality fix
    regenerateSection,
    copilotEdit,
    fixIssue,
    fixAllErrors,
    // Model selection
    availableModels,
    selectedModel,
    setSelectedModel,
  };
}
