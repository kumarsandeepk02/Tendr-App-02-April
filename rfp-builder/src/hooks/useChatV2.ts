import { useState, useCallback, useEffect, useRef } from 'react';
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
  ReadinessReview,
  ToolChatResponse,
} from '../types';
import { api, authFetch, API_URL } from '../utils/api';

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
  // Document state for enriching agent context
  sections?: Array<{ id: string; title: string; content: string; order: number }>;
  qualityReview?: QualityReview | null;
  // Tool mutation callback (from useDocument)
  onToolMutations?: (mutations: import('../types').ToolMutation[]) => void;
}

const WELCOME_MESSAGES: Record<string, string> = {
  default: `Hey, I'm Zia. I'm here to help you think through what you need before we jump into building anything formal. No pressure, no structure yet — just a good conversation.

Tell me what's on your mind. What problem are you trying to solve?`,

  RFP: `Hey, I'm Nova — your RFP co-author. Let's build out your **Request for Proposal** together. Tell me about the project — what are you procuring, who's it for, and what does a great outcome look like?

I'll push you to be specific, flag anything vague, and make sure this thing is airtight before it goes out.`,

  RFI: `Hey, I'm Zuno — your market research partner. Let's put together an **RFI** that actually gets you useful answers from vendors.

Tell me what you're trying to learn. What category or capability are you exploring, and what's driving this?`,
};

export function useChatV2(options?: UseChatV2Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<V2Phase>('landing');
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  const [readinessReview, setReadinessReview] = useState<ReadinessReview | null>(null);
  const [isReadinessLoading, setIsReadinessLoading] = useState(false);
  const [narrations, setNarrations] = useState<NarrationMessage[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [uploadedFileText, setUploadedFileText] = useState<string>('');
  const [currentDocType, setCurrentDocType] = useState<string | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('rfp_selected_model') || '';
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const pipelineResultsRef = useRef({ competitiveIntel: false, documentAnalysis: false });

  // Fetch available models on mount
  useEffect(() => {
    api
      .get('/api/chat/models')
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
      setCurrentDocType(docType || 'brainstorm');

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

        const res = await api.post('/api/chat/v2/planning', {
          messages: apiMessages,
          fileContext: uploadedFileText || undefined,
          model: selectedModel || undefined,
          docType: currentDocType || undefined,
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
    [messages, addMessage, uploadedFileText, selectedModel, currentDocType]
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

      const res = await api.post('/api/chat/v2/brief', {
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

  // Actually start generation (called from readiness screen or directly for brainstorm)
  const proceedToGenerate = useCallback(async () => {
    if (!brief) return;

    setIsGenerating(true);
    setPhase('generating');
    setNarrations([]);

    // Notify that streaming is starting
    optionsRef.current?.onStreamStart?.();
    addNarration('Analyzing your brief and planning the document structure...', 'thinking', 'planning');

    const confirmedSections = brief.suggestedSections
      .filter((s) => s.included !== false)
      .map((s) => ({ title: s.title, description: s.description, responseType: s.responseType || 'narrative' }));

    // Build planning messages for contextual narration generation
    const planningMessages = messages
      .filter((m) => !m.isLoading && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await authFetch(`${API_URL}/api/chat/v2/pipeline`, {
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

      // Ensure stage reaches 'complete' immediately after stream ends
      optionsRef.current?.onStageChange?.('complete');

      // Backup fetch for competitive intel
      if (!pipelineResultsRef.current.competitiveIntel) {
        try {
          const intelRes = await authFetch(`${API_URL}/api/chat/competitive-intel`, {
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

  // Approve brief → run readiness review (for RFP/RFI), then show readiness screen
  const approveAndGenerate = useCallback(async () => {
    if (!brief) return;

    const docType = currentDocType || brief.docType || 'rfp';
    const isBrainstorm = docType.toLowerCase() === 'brainstorm';

    if (isBrainstorm) {
      // Brainstorm skips readiness — go straight to generation
      proceedToGenerate();
      return;
    }

    // Fetch readiness review
    setIsReadinessLoading(true);
    setPhase('readiness');

    try {
      const res = await api.post('/api/chat/v2/readiness', {
        brief,
        docType,
        model: selectedModel || undefined,
      });
      setReadinessReview(res.data);
    } catch (err) {
      // If readiness fails, show green pass so user is never blocked
      setReadinessReview({
        status: 'green',
        issues: [],
        summary: 'Readiness check could not be completed. You can proceed with generation.',
      });
    } finally {
      setIsReadinessLoading(false);
    }
  }, [brief, currentDocType, selectedModel, proceedToGenerate]);

  // Go back from readiness to brief
  const backToBrief = useCallback(() => {
    setPhase('brief');
    setReadinessReview(null);
  }, []);

  // Go back to planning from brief
  const backToPlanning = useCallback(() => {
    setPhase('planning');
    setBrief(null);
  }, []);

  // Warm handoff from Zia (brainstorm) to Nova (RFP) or Zuno (RFI)
  const handleHandoff = useCallback((targetDocType: 'RFP' | 'RFI') => {
    // Add a warm handoff message from Zia
    const handoffMessages: Record<string, string> = {
      RFP: `I think you're ready for the next step. Let me hand this over to Nova — she's our RFP specialist and she's brilliant at turning ideas into structured documents. She'll have all the context from our conversation, so you can pick up right where we left off.`,
      RFI: `Sounds like you want to explore the market a bit more before committing. Let me bring in Zuno — he's our RFI expert and he'll help you ask the right questions to get real answers from vendors. He'll have everything from our conversation.`,
    };

    addMessage('assistant', handoffMessages[targetDocType]);

    // Switch the doc type and update brief
    setCurrentDocType(targetDocType);
    setBrief((prev) => prev ? { ...prev, docType: targetDocType as any } : prev);

    // Add a welcome message from the new agent
    setTimeout(() => {
      const welcomeMessages: Record<string, string> = {
        RFP: `Hey, Nova here. Zia caught me up on everything — nice groundwork. I've got your brief and I'm ready to turn this into a structured RFP. Let me take a look at what we're working with and we'll get this generated.`,
        RFI: `Hey, Zuno here. Zia filled me in on the context — good stuff. I've got your brief and I'm going to shape this into an RFI that gets you real answers from the market. Let's review what we have and then generate.`,
      };
      addMessage('assistant', welcomeMessages[targetDocType]);
    }, 500);
  }, [addMessage]);

  // Section regeneration (same as V1)
  const regenerateSection = useCallback(
    async (sectionId: string, sectionTitle: string, currentContent: string, instruction: string) => {
      const docType = brief?.docType || 'RFP';
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
        const response = await authFetch(`${API_URL}/api/chat/regenerate-section`, {
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

  // --- Freeform / Persistent Chat (with tool_use) ---
  const sendFreeformMessage = useCallback(
    async (content: string): Promise<ToolChatResponse> => {
      const docType = brief?.docType || 'RFP';
      const projectTitle = brief?.projectTitle || 'Untitled';
      const agentNames: Record<string, string> = { RFP: 'Nova', RFI: 'Zuno', brainstorm: 'Zia' };
      const agentName = agentNames[docType] || agentNames[currentDocType || ''] || 'Nova';

      const systemPrompt = `You are ${agentName}, an expert procurement document assistant. The user is working on a ${docType} document titled "${projectTitle}". Help them with any questions or editing instructions. Be conversational — you are a coworker, not a tool. Be concise and helpful.

You have tools to directly modify the document. Use them when the user asks to edit, add, remove, or rewrite sections.
- Use rewrite_section for content changes. Do NOT output rewritten content as text — use the tool.
- After using a tool, briefly confirm what you did. Don't repeat the full content.
- You may call multiple tools in sequence for complex requests.
- For read-only questions about the document, answer from the context you already have. Only use read_section if you need the full content of a specific section.`;

      // Build document state to send to the server
      const sections = optionsRef.current?.sections || [];
      const qr = optionsRef.current?.qualityReview;

      const documentState = {
        sections: sections.map(s => ({ id: s.id, title: s.title, content: s.content, order: (s as any).order ?? 0 })),
        brief: brief ? {
          docType: brief.docType,
          projectTitle: brief.projectTitle,
          projectDescription: brief.projectDescription,
          industry: brief.industry,
          requirements: brief.requirements,
          evaluationCriteria: brief.evaluationCriteria,
          timeline: brief.timeline,
        } : null,
        qualityReview: qr ? { score: qr.score, issues: qr.issues } : null,
        uploadedDocuments: uploadedDocuments.map(d => ({ name: d.name })),
      };

      try {
        const res = await api.post('/api/chat/tools', {
          messages: [{ role: 'user', content }],
          systemPrompt,
          documentState,
          model: selectedModel || undefined,
        });

        const response: ToolChatResponse = {
          content: res.data.content || 'Sorry, I could not generate a response.',
          toolResults: res.data.toolResults || [],
        };

        // Apply mutations to document state via callback
        const mutations = response.toolResults
          .filter(tr => tr.mutation)
          .map(tr => tr.mutation!);
        if (mutations.length > 0) {
          optionsRef.current?.onToolMutations?.(mutations);
        }

        return response;
      } catch (err) {
        console.error('Freeform message error:', err);
        return { content: 'Sorry, something went wrong. Please try again.', toolResults: [] };
      }
    },
    [brief, selectedModel, currentDocType, uploadedDocuments]
  );

  // Reset everything
  const resetChat = useCallback(() => {
    setMessages([]);
    setPhase('landing');
    setBrief(null);
    setNarrations([]);
    setUploadedDocuments([]);
    setUploadedFileText('');
    setCurrentDocType(undefined);
    setIsGenerating(false);
    setIsBriefLoading(false);
  }, []);

  // Restore from saved state, optionally injecting document context for the agent
  const restoreChat = useCallback(
    (state: {
      messages: ChatMessage[];
      phase: V2Phase;
      brief?: BriefData | null;
      uploadedDocuments?: UploadedDocument[];
      uploadedFileText?: string;
    }, documentContext?: {
      sections?: Array<{ title: string; content: string }>;
      docType?: string;
      projectTitle?: string;
      phase?: string;
    }) => {
      const restoredMessages = [...(state.messages || [])];

      // Inject a hidden context message so the agent knows the project state
      if (documentContext && restoredMessages.length > 0) {
        const sectionList = (documentContext.sections || [])
          .map(s => s.title)
          .join(', ');
        const contextMsg: ChatMessage = {
          id: 'context-resume-' + Date.now(),
          role: 'user' as ChatRole,
          hidden: true,
          timestamp: Date.now(),
          content: `[Project resumed. Current state: ${documentContext.docType || 'RFP'} document "${documentContext.projectTitle || 'Untitled'}". ` +
            `Phase: ${documentContext.phase || 'unknown'}. ` +
            (sectionList ? `Sections (${documentContext.sections?.length || 0}): ${sectionList}. ` : 'No sections yet. ') +
            `Brief: ${state.brief ? 'exists' : 'not started'}. ` +
            `Previous conversation had ${restoredMessages.length} messages.]`,
        };
        restoredMessages.unshift(contextMsg);
      }

      setMessages(restoredMessages);
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
    currentDocType,
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
    proceedToGenerate,
    readinessReview,
    isReadinessLoading,
    backToBrief,
    backToPlanning,
    handleHandoff,
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
