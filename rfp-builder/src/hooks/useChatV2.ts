import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  ChatMessage,
  ChatRole,
  V2Phase,
  BriefData,
  NarrationMessage,
  NarrationAgent,
  QualityReview,
  UploadedDocument,
  DocumentAnalysis,
  CompetitiveIntelligence,
  ModelOption,
  GenerationStage,
} from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

interface UseChatV2Options {
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
  onMetaUpdate?: (updates: Record<string, string>) => void;
  onStageChange?: (stage: GenerationStage) => void;
  projectId?: string | null;
}

const WELCOME_MESSAGES: Record<string, string> = {
  default: `Hi, I'm Priya, your RFP analyst. Let's brainstorm what you need for this procurement document. Once I have the details, I'll hand everything over to our writing team to generate a polished draft.

Think of this as your first prep meeting — tell me about your project in your own words, and I'll ask the right follow-up questions. **What are you working on?**`,

  RFP: `Hi, I'm Priya, your RFP analyst. Let's build out your **Request for Proposal**. Tell me about the project — what are you procuring, who's it for, and what does success look like?

I'll ask follow-up questions to make sure we cover everything before handing off to the writing team.`,

  RFI: `Hi, I'm Priya, your RFP analyst. Let's put together your **Request for Information**. Tell me about what you're exploring — what market or capability are you trying to understand?

I'll help you frame the right questions before we generate the document.`,
};

export function useChatV2(options?: UseChatV2Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<V2Phase>('landing');
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  const [narrations, setNarrations] = useState<NarrationMessage[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [uploadedFileText, setUploadedFileText] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('rfp_selected_model') || '';
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const pipelineResultsRef = useRef({ competitiveIntel: false, documentAnalysis: false });

  // Fetch available models on mount
  useEffect(() => {
    axios
      .get(`${API_URL}/api/chat/models`)
      .then((res) => {
        const data = res.data;
        setAvailableModels(data.models || []);
        if (!selectedModel && data.default) {
          setSelectedModel(data.default);
        }
      })
      .catch(() => {
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

  const addNarration = useCallback(
    (content: string, type: NarrationMessage['type'] = 'thinking', agent?: NarrationAgent) => {
      const msg: NarrationMessage = {
        id: generateId(),
        content,
        timestamp: Date.now(),
        type,
        agent,
      };
      setNarrations((prev) => [...prev, msg]);
      return msg;
    },
    []
  );

  // Start the V2 flow from a landing action card
  const startPlanning = useCallback(
    (docType?: 'RFP' | 'RFI') => {
      setPhase('planning');
      setMessages([]);

      const welcomeContent = docType
        ? WELCOME_MESSAGES[docType]
        : WELCOME_MESSAGES.default;

      setTimeout(() => {
        addMessage('assistant', welcomeContent);
      }, 200);
    },
    [addMessage]
  );

  // Send a message during the planning phase
  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg = addMessage('user', content);
      setIsTyping(true);

      try {
        // Build API messages (skip loading/error messages)
        const apiMessages = [
          ...messages,
          { id: userMsg.id, role: 'user' as ChatRole, content, timestamp: Date.now() },
        ]
          .filter((m) => !m.isLoading && !m.isError)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await axios.post(`${API_URL}/api/chat/v2/planning`, {
          messages: apiMessages,
          fileContext: uploadedFileText || undefined,
          model: selectedModel || undefined,
        });

        const assistantContent = res.data.content;
        addMessage('assistant', assistantContent);
      } catch (err: any) {
        const errorMsg = err?.response?.data?.error || 'Sorry, something went wrong. Please try again.';
        addMessage('assistant', errorMsg, { isError: true });
      } finally {
        setIsTyping(false);
      }
    },
    [messages, addMessage, uploadedFileText, selectedModel]
  );

  // Handle file upload during planning
  const handleUpload = useCallback(
    (fileText: string, fileName?: string) => {
      const newDoc: UploadedDocument = {
        id: generateId(),
        name: fileName || `Document ${uploadedDocuments.length + 1}`,
        text: fileText,
        uploadedAt: Date.now(),
      };
      setUploadedDocuments((prev) => [...prev, newDoc]);
      setUploadedFileText((prev) => {
        const separator = prev ? '\n\n---\n\n' : '';
        return prev + separator + fileText;
      });

      addMessage('user', `📄 *(Uploaded: ${newDoc.name})*`);
      setTimeout(() => {
        addMessage(
          'assistant',
          `Got it! I've read **${newDoc.name}**. I'll use it as context for the document. What else should I know about your project?`
        );
      }, 300);
    },
    [addMessage, uploadedDocuments]
  );

  // Remove an uploaded document
  const removeUploadedDocument = useCallback((docId: string) => {
    setUploadedDocuments((prev) => {
      const updated = prev.filter((d) => d.id !== docId);
      setUploadedFileText(updated.map((d) => d.text).join('\n\n---\n\n'));
      return updated;
    });
  }, []);

  // Generate the brief from the planning conversation
  const generateBrief = useCallback(async () => {
    setIsBriefLoading(true);

    try {
      const apiMessages = messages
        .filter((m) => !m.isLoading && !m.isError)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await axios.post(`${API_URL}/api/chat/v2/brief`, {
        messages: apiMessages,
        fileContext: uploadedFileText || undefined,
        model: selectedModel || undefined,
      });

      const briefData: BriefData = {
        ...res.data,
        suggestedSections: (res.data.suggestedSections || []).map((s: any) => ({
          ...s,
          included: true,
        })),
      };

      setBrief(briefData);
      setPhase('brief');

      // Update document meta
      optionsRef.current?.onMetaUpdate?.({
        type: briefData.docType,
        projectTitle: briefData.projectTitle,
        projectDescription: briefData.projectDescription,
        industry: briefData.industry,
      });
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Failed to generate brief. Please try again.';
      addMessage('assistant', errorMsg, { isError: true });
    } finally {
      setIsBriefLoading(false);
    }
  }, [messages, uploadedFileText, selectedModel, addMessage]);

  // Edit the brief
  const updateBrief = useCallback((updates: Partial<BriefData>) => {
    setBrief((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // Update a section's title/description in the brief
  const updateBriefSection = useCallback((index: number, updates: Partial<{ title: string; description: string; priority: string }>) => {
    setBrief((prev) => {
      if (!prev) return prev;
      const sections = [...prev.suggestedSections];
      sections[index] = { ...sections[index], ...updates } as any;
      return { ...prev, suggestedSections: sections };
    });
  }, []);

  // Toggle a section in the brief
  const toggleBriefSection = useCallback((index: number) => {
    setBrief((prev) => {
      if (!prev) return prev;
      const sections = [...prev.suggestedSections];
      sections[index] = { ...sections[index], included: !sections[index].included };
      return { ...prev, suggestedSections: sections };
    });
  }, []);

  // Helper: read SSE stream and dispatch events
  const readSSEStream = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';

    pipelineResultsRef.current = { competitiveIntel: false, documentAnalysis: false };

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
            } else if (parsed.type === 'section_start') {
              optionsRef.current?.onSectionStart?.(parsed.title, parsed.index, parsed.total);
            } else if (parsed.type === 'section_done') {
              optionsRef.current?.onSectionDone?.(parsed.title, parsed.content);
            } else if (parsed.type === 'review') {
              optionsRef.current?.onReviewResult?.(parsed.content);
            } else if (parsed.type === 'document_analysis') {
              pipelineResultsRef.current.documentAnalysis = true;
              optionsRef.current?.onDocumentAnalysis?.(parsed.content);
            } else if (parsed.type === 'competitive_intel') {
              pipelineResultsRef.current.competitiveIntel = true;
              optionsRef.current?.onCompetitiveIntel?.(parsed.content);
            } else if (parsed.type === 'stage') {
              optionsRef.current?.onStageChange?.(parsed.stage);
            } else if (parsed.type === 'narration') {
              // V2-specific: narration events for "thinking out loud"
              const narrationStyle = parsed.narrationStyle === 'handover' ? 'handover' : 'progress';
              addNarration(parsed.content, narrationStyle as NarrationMessage['type'], parsed.agent);
            }
          } catch (parseErr: any) {
            if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              if (parseErr.message.includes('failed') || parseErr.message.includes('Failed')) {
                throw parseErr;
              }
            }
          }
        }
      }
    }
  }, [addNarration]);

  // Approve brief and start generation
  const approveAndGenerate = useCallback(async () => {
    if (!brief) return;

    setIsGenerating(true);
    setPhase('generating');
    setNarrations([]);

    // Notify that streaming is starting
    optionsRef.current?.onStreamStart?.();
    addNarration('Analyzing your brief and planning the document structure...', 'thinking', 'planning');

    const confirmedSections = brief.suggestedSections
      .filter((s) => s.included !== false)
      .map((s) => ({ title: s.title, description: s.description }));

    // Build planning messages for contextual narration generation
    const planningMessages = messages
      .filter((m) => !m.isLoading && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch(`${API_URL}/api/chat/v2/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          fileContext: uploadedFileText || undefined,
          confirmedSections,
          uploadedDocuments: uploadedDocuments.map((d) => ({ name: d.name, text: d.text })),
          planningMessages,
          model: selectedModel || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Pipeline request failed');
      }

      await readSSEStream(response);

      // Backup fetch for competitive intel
      if (!pipelineResultsRef.current.competitiveIntel) {
        try {
          const intelRes = await fetch(`${API_URL}/api/chat/competitive-intel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docType: brief.docType,
              answers: {
                doc_type: brief.docType,
                project_title: brief.projectTitle,
                project_description: brief.projectDescription,
                requirements: brief.requirements.join('\n'),
                evaluation_criteria: brief.evaluationCriteria.join('\n'),
                deadline: brief.timeline,
              },
              model: selectedModel || undefined,
            }),
          });
          if (intelRes.ok) {
            const intel = await intelRes.json();
            if (intel && (intel.industryBenchmarks?.length > 0 || intel.marketStandards?.length > 0)) {
              optionsRef.current?.onCompetitiveIntel?.(intel);
            }
          }
        } catch (err) {
          console.warn('Backup competitive intel fetch failed:', err);
        }
      }

      addNarration('Document generation complete!', 'done');
      setPhase('done');
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to generate document. Please try again.';
      addNarration(`Error: ${errorMsg}`, 'done');
      setPhase('brief'); // Allow retry
    } finally {
      setIsGenerating(false);
    }
  }, [brief, messages, uploadedFileText, uploadedDocuments, selectedModel, readSSEStream, addNarration]);

  // Go back to planning from brief
  const backToPlanning = useCallback(() => {
    setPhase('planning');
    setBrief(null);
  }, []);

  // Section regeneration (same as V1)
  const regenerateSection = useCallback(
    async (sectionId: string, sectionTitle: string, currentContent: string, instruction: string) => {
      const docType = brief?.docType || 'RFP';
      optionsRef.current?.onSectionRegenerationStart?.(sectionId);

      try {
        const response = await fetch(`${API_URL}/api/chat/regenerate-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionTitle,
            currentContent,
            instruction,
            docType,
            answers: brief
              ? {
                  doc_type: brief.docType,
                  project_title: brief.projectTitle,
                  project_description: brief.projectDescription,
                  requirements: brief.requirements.join('\n'),
                }
              : {},
            fileContext: uploadedFileText || undefined,
            model: selectedModel || undefined,
          }),
        });

        if (!response.ok) throw new Error('Regeneration request failed');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buf = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'text') fullText += parsed.content;
                else if (parsed.type === 'done') fullText = parsed.content;
                else if (parsed.type === 'error') throw new Error(parsed.content);
              } catch (pe: any) {
                if (pe.message && !pe.message.includes('Unexpected end of JSON input')) throw pe;
              }
            }
          }
        }

        optionsRef.current?.onSectionRegenerationDone?.(sectionId, fullText);
        return fullText;
      } catch (err: any) {
        console.error('Section regeneration failed:', err);
        optionsRef.current?.onSectionRegenerationDone?.(sectionId, currentContent);
        return null;
      }
    },
    [brief, uploadedFileText, selectedModel]
  );

  // Copilot edit (same as V1)
  const copilotEdit = useCallback(
    async (sectionId: string, sectionTitle: string, currentContent: string, instruction: string): Promise<string | null> => {
      const docType = brief?.docType || 'RFP';

      try {
        const response = await fetch(`${API_URL}/api/chat/regenerate-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionTitle,
            currentContent,
            instruction,
            docType,
            answers: brief
              ? {
                  doc_type: brief.docType,
                  project_title: brief.projectTitle,
                  requirements: brief.requirements.join('\n'),
                }
              : {},
            fileContext: uploadedFileText || undefined,
            model: selectedModel || undefined,
          }),
        });

        if (!response.ok) throw new Error('Copilot edit request failed');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buf = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'text') fullText += parsed.content;
                else if (parsed.type === 'done') fullText = parsed.content;
                else if (parsed.type === 'error') throw new Error(parsed.content);
              } catch (pe: any) {
                if (pe.message && !pe.message.includes('Unexpected end of JSON input')) throw pe;
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
    [brief, uploadedFileText, selectedModel]
  );

  // Fix quality review issue
  const fixIssue = useCallback(
    async (sectionTitle: string, issueMessage: string, sectionId: string, currentContent: string) => {
      const instruction = `Fix this issue: ${issueMessage}`;
      return regenerateSection(sectionId, sectionTitle, currentContent, instruction);
    },
    [regenerateSection]
  );

  // Fix all errors
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

  // --- Freeform / Persistent Chat ---
  const sendFreeformMessage = useCallback(
    async (content: string): Promise<string> => {
      const docType = brief?.docType || 'RFP';
      const projectTitle = brief?.projectTitle || 'Untitled';
      const systemPrompt = `You are Priya, an expert procurement document assistant. The user is working on a ${docType} document titled "${projectTitle}". Help them with any questions or editing instructions. Be concise and helpful.`;

      try {
        const res = await axios.post(`${API_URL}/api/chat`, {
          messages: [{ role: 'user', content }],
          systemPrompt,
          model: selectedModel || undefined,
        });
        return res.data.content || 'Sorry, I could not generate a response.';
      } catch (err) {
        console.error('Freeform message error:', err);
        return 'Sorry, something went wrong. Please try again.';
      }
    },
    [brief, selectedModel]
  );

  // Reset everything
  const resetChat = useCallback(() => {
    setMessages([]);
    setPhase('landing');
    setBrief(null);
    setNarrations([]);
    setUploadedDocuments([]);
    setUploadedFileText('');
    setIsGenerating(false);
    setIsBriefLoading(false);
  }, []);

  // Restore from saved state
  const restoreChat = useCallback(
    (state: {
      messages: ChatMessage[];
      phase: V2Phase;
      brief?: BriefData | null;
      uploadedDocuments?: UploadedDocument[];
      uploadedFileText?: string;
    }) => {
      setMessages(state.messages || []);
      setPhase(state.phase || 'landing');
      setBrief(state.brief || null);
      setUploadedDocuments(state.uploadedDocuments || []);
      setUploadedFileText(state.uploadedFileText || '');
    },
    []
  );

  return {
    // State
    messages,
    phase,
    isTyping,
    isGenerating,
    brief,
    isBriefLoading,
    narrations,
    uploadedDocuments,
    uploadedFileText,
    // Actions
    startPlanning,
    sendMessage,
    handleUpload,
    removeUploadedDocument,
    generateBrief,
    updateBrief,
    updateBriefSection,
    toggleBriefSection,
    approveAndGenerate,
    backToPlanning,
    resetChat,
    restoreChat,
    // Freeform / persistent chat
    sendFreeformMessage,
    // Section operations (same as V1)
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
