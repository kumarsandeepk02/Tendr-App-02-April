import { useState, useCallback, useEffect, useRef } from 'react';
import { DocumentState, DocumentSection, QualityReview, SectionProgress } from '../types';
import { v4 as uuidv4 } from 'uuid';

function createInitialState(): DocumentState {
  return {
    meta: {
      type: 'RFP',
      projectTitle: '',
      projectDescription: '',
      industry: '',
      issuingOrganization: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    sections: [], // Start empty — sections are created during generation
  };
}

export function useDocument(projectId?: string | null) {
  const [documentState, setDocumentState] = useState<DocumentState>(
    createInitialState
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const [currentSection, setCurrentSection] = useState<SectionProgress | null>(null);
  const [qualityReview, setQualityReview] = useState<QualityReview | null>(null);
  const streamBufferRef = useRef('');

  // Autosave on every change (skip during streaming to avoid thrashing)
  useEffect(() => {
    if (isStreaming) return;
    const storageKey = projectId
      ? `rfp_project_${projectId}`
      : 'rfp_draft_current';
    const timeout = setTimeout(() => {
      try {
        const existing = window.localStorage.getItem(storageKey);
        const draft = existing ? JSON.parse(existing) : {};
        draft.documentState = documentState;
        draft.savedAt = Date.now();
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Autosave failed:', e);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [documentState, isStreaming, projectId]);

  const updateMeta = useCallback(
    (updates: Partial<DocumentState['meta']>) => {
      setDocumentState((prev) => ({
        ...prev,
        meta: { ...prev.meta, ...updates, updatedAt: Date.now() },
      }));
    },
    []
  );

  const updateSection = useCallback(
    (sectionId: string, updates: Partial<DocumentSection>) => {
      setDocumentState((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: Date.now() },
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        ),
      }));
    },
    []
  );

  const addSection = useCallback((title: string, content: string = '') => {
    setDocumentState((prev) => ({
      ...prev,
      meta: { ...prev.meta, updatedAt: Date.now() },
      sections: [
        ...prev.sections,
        {
          id: uuidv4(),
          title,
          content,
          order: prev.sections.length,
        },
      ],
    }));
  }, []);

  const removeSection = useCallback((sectionId: string) => {
    setDocumentState((prev) => ({
      ...prev,
      meta: { ...prev.meta, updatedAt: Date.now() },
      sections: prev.sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, order: i })),
    }));
  }, []);

  const reorderSections = useCallback((sections: DocumentSection[]) => {
    setDocumentState((prev) => ({
      ...prev,
      meta: { ...prev.meta, updatedAt: Date.now() },
      sections: sections.map((s, i) => ({ ...s, order: i })),
    }));
  }, []);

  const parseSectionsFromMarkdown = useCallback((markdown: string) => {
    const sectionRegex = /^##\s+(.+)$/gm;
    const parts: { title: string; content: string }[] = [];
    let match;
    const indices: { title: string; start: number; end: number }[] = [];

    while ((match = sectionRegex.exec(markdown)) !== null) {
      indices.push({
        title: match[1].trim(),
        start: match.index + match[0].length,
        end: 0,
      });
    }

    for (let i = 0; i < indices.length; i++) {
      indices[i].end =
        i < indices.length - 1 ? indices[i + 1].start - indices[i + 1].title.length - 3 : markdown.length;
      parts.push({
        title: indices[i].title,
        content: markdown.substring(indices[i].start, indices[i].end).trim(),
      });
    }

    if (parts.length > 0) {
      setDocumentState((prev) => {
        const updatedSections = [...prev.sections];

        parts.forEach((part) => {
          const existingIdx = updatedSections.findIndex(
            (s) => s.title.toLowerCase() === part.title.toLowerCase()
          );
          if (existingIdx >= 0) {
            updatedSections[existingIdx] = {
              ...updatedSections[existingIdx],
              content: part.content,
            };
          } else {
            updatedSections.push({
              id: uuidv4(),
              title: part.title,
              content: part.content,
              order: updatedSections.length,
            });
          }
        });

        return {
          ...prev,
          meta: { ...prev.meta, updatedAt: Date.now() },
          sections: updatedSections.map((s, i) => ({ ...s, order: i })),
        };
      });
    }
  }, []);

  // --- Streaming methods ---

  // Called when streaming starts: clear document, show placeholder
  const handleStreamStart = useCallback(() => {
    setIsStreaming(true);
    setShowPlaceholder(true);
    setCurrentSection(null);
    setQualityReview(null);
    streamBufferRef.current = '';
    // Clear all sections for fresh streamed content
    setDocumentState((prev) => ({
      ...prev,
      meta: { ...prev.meta, updatedAt: Date.now() },
      sections: [],
    }));
  }, []);

  // Called on each text chunk: accumulate buffer, progressively parse sections
  const handleStreamChunk = useCallback((chunk: string) => {
    streamBufferRef.current += chunk;
    const currentText = streamBufferRef.current;
    // Progressive section parsing
    const sectionRegex = /^##\s+(.+)$/gm;
    const parts: { title: string; content: string }[] = [];
    let match;
    const indices: { title: string; start: number; end: number }[] = [];

    while ((match = sectionRegex.exec(currentText)) !== null) {
      indices.push({
        title: match[1].trim(),
        start: match.index + match[0].length,
        end: 0,
      });
    }

    for (let i = 0; i < indices.length; i++) {
      indices[i].end =
        i < indices.length - 1
          ? indices[i + 1].start - indices[i + 1].title.length - 3
          : currentText.length;
      parts.push({
        title: indices[i].title,
        content: currentText.substring(indices[i].start, indices[i].end).trim(),
      });
    }

    if (parts.length > 0) {
      setShowPlaceholder(false);
      setDocumentState((prev) => {
        const newSections: DocumentSection[] = parts.map((part, i) => {
          // Reuse existing section id if title matches
          const existing = prev.sections.find(
            (s) => s.title.toLowerCase() === part.title.toLowerCase()
          );
          return {
            id: existing?.id || uuidv4(),
            title: part.title,
            content: part.content,
            order: i,
          };
        });

        return {
          ...prev,
          meta: { ...prev.meta, updatedAt: Date.now() },
          sections: newSections,
        };
      });
    }
  }, []);

  // Called when a new section starts generating (pipeline mode)
  const handleSectionStart = useCallback((title: string, index: number, total: number) => {
    setCurrentSection({ title, index, total });
    setShowPlaceholder(false);
  }, []);

  // Called when a section finishes generating (pipeline mode)
  const handleSectionDone = useCallback((title: string, content: string) => {
    // Update or add the section with its final content
    setDocumentState((prev) => {
      const existingIdx = prev.sections.findIndex(
        (s) => s.title.toLowerCase() === title.toLowerCase()
      );
      if (existingIdx >= 0) {
        // Update existing section
        const updated = [...prev.sections];
        updated[existingIdx] = { ...updated[existingIdx], content };
        return { ...prev, meta: { ...prev.meta, updatedAt: Date.now() }, sections: updated };
      }
      // This shouldn't normally happen since handleStreamChunk creates sections,
      // but handle it gracefully
      return {
        ...prev,
        meta: { ...prev.meta, updatedAt: Date.now() },
        sections: [
          ...prev.sections,
          { id: uuidv4(), title, content, order: prev.sections.length },
        ],
      };
    });
  }, []);

  // Called when quality review completes (pipeline mode, async)
  const handleReviewResult = useCallback((review: QualityReview) => {
    setQualityReview(review);
  }, []);

  // Called when streaming is done
  const handleStreamDone = useCallback((fullText: string) => {
    setIsStreaming(false);
    setShowPlaceholder(false);
    setCurrentSection(null);
    // Final parse to ensure we have the complete document
    streamBufferRef.current = fullText;
    const sectionRegex = /^##\s+(.+)$/gm;
    const parts: { title: string; content: string }[] = [];
    let match;
    const indices: { title: string; start: number; end: number }[] = [];

    while ((match = sectionRegex.exec(fullText)) !== null) {
      indices.push({
        title: match[1].trim(),
        start: match.index + match[0].length,
        end: 0,
      });
    }

    for (let i = 0; i < indices.length; i++) {
      indices[i].end =
        i < indices.length - 1
          ? indices[i + 1].start - indices[i + 1].title.length - 3
          : fullText.length;
      parts.push({
        title: indices[i].title,
        content: fullText.substring(indices[i].start, indices[i].end).trim(),
      });
    }

    if (parts.length > 0) {
      setDocumentState((prev) => ({
        ...prev,
        meta: { ...prev.meta, updatedAt: Date.now() },
        sections: parts.map((part, i) => ({
          id: prev.sections.find(
            (s) => s.title.toLowerCase() === part.title.toLowerCase()
          )?.id || uuidv4(),
          title: part.title,
          content: part.content,
          order: i,
        })),
      }));
    }
  }, []);

  const resetDocument = useCallback(() => {
    setDocumentState(createInitialState());
    setIsStreaming(false);
    setShowPlaceholder(false);
    setCurrentSection(null);
    setQualityReview(null);
    streamBufferRef.current = '';
  }, []);

  const restoreDocument = useCallback((state: DocumentState) => {
    setDocumentState(state);
  }, []);

  // Only count sections that have content
  const nonEmptySections = documentState.sections.filter(
    (s) => s.content.trim().length > 0
  );

  return {
    documentState,
    updateMeta,
    updateSection,
    addSection,
    removeSection,
    reorderSections,
    parseSectionsFromMarkdown,
    resetDocument,
    restoreDocument,
    completedSections: nonEmptySections.length,
    totalSections: documentState.sections.length,
    // Streaming
    isStreaming,
    showPlaceholder,
    handleStreamStart,
    handleStreamChunk,
    handleStreamDone,
    // Pipeline
    currentSection,
    qualityReview,
    handleSectionStart,
    handleSectionDone,
    handleReviewResult,
  };
}
