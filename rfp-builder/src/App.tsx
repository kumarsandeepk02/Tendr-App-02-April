import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SectionSuggestion, UploadedDocument } from './types';
import { useChat } from './hooks/useChat';
import { useDocument } from './hooks/useDocument';
import { useProjects } from './hooks/useProjects';
import Chat from './components/Chat';
import DocumentPreview from './components/DocumentPreview';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Onboarding from './components/Onboarding';
import FileUploader from './components/FileUploader';
import FeedbackToast from './components/FeedbackToast';
import './index.css';

function App() {
  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('rfp_onboarded');
  });

  // File uploader
  const [showUploader, setShowUploader] = useState(false);

  // Feedback
  const [showFeedback, setShowFeedback] = useState(false);

  // Track if flow has been started (use ref to survive StrictMode double-render)
  const flowStartedRef = useRef(false);
  const [resetCounter, setResetCounter] = useState(0);

  // Ref to capture uploadedDocuments for save callbacks without causing re-render loops
  const uploadedDocumentsRef = useRef<UploadedDocument[]>([]);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('rfp_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('rfp_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Projects
  const {
    projects,
    activeProjectId,
    createProject,
    switchProject,
    deleteProject,
    saveProject,
    loadProject,
    syncProjectMeta,
  } = useProjects();

  // Document state
  const {
    documentState,
    updateMeta,
    updateSection,
    addSection,
    removeSection,
    reorderSections,
    parseSectionsFromMarkdown,
    resetDocument,
    restoreDocument,
    completedSections,
    totalSections,
    // Streaming
    isStreaming,
    showPlaceholder,
    handleStreamStart,
    handleStreamChunk,
    handleStreamDone,
    // Pipeline
    currentSection,
    qualityReview,
    documentAnalysis,
    competitiveIntel,
    handleSectionStart,
    handleSectionDone,
    handleReviewResult,
    handleDocumentAnalysis,
    handleCompetitiveIntel,
    // Section regeneration
    regeneratingSectionId,
    previousSectionContent,
    handleSectionRegenerationStart,
    handleSectionRegenerationDone,
    undoRegeneration,
    // Quality review fix
    fixingIssue,
    fixedIssues,
    handleFixStart,
    handleFixDone,
    // Helpers
    findSectionByTitle,
  } = useDocument(activeProjectId);

  // Chat options (memoized to prevent infinite re-renders)
  const chatOptions = useMemo(
    () => ({
      onSectionsUpdate: (markdown: string) => {
        parseSectionsFromMarkdown(markdown);
      },
      onMetaUpdate: (updates: Record<string, string>) => {
        updateMeta(updates as any);
      },
      onStreamStart: handleStreamStart,
      onStreamChunk: handleStreamChunk,
      onStreamDone: handleStreamDone,
      onSectionStart: handleSectionStart,
      onSectionDone: handleSectionDone,
      onReviewResult: handleReviewResult,
      onSectionRegenerationStart: handleSectionRegenerationStart,
      onSectionRegenerationDone: handleSectionRegenerationDone,
      onDocumentAnalysis: handleDocumentAnalysis,
      onCompetitiveIntel: handleCompetitiveIntel,
      projectId: activeProjectId,
    }),
    [parseSectionsFromMarkdown, updateMeta, handleStreamStart, handleStreamChunk, handleStreamDone, handleSectionStart, handleSectionDone, handleReviewResult, handleSectionRegenerationStart, handleSectionRegenerationDone, handleDocumentAnalysis, handleCompetitiveIntel, activeProjectId]
  );

  // Chat state
  const {
    messages,
    guidedStep,
    phase,
    isTyping,
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
  } = useChat(chatOptions);

  // Keep ref in sync with uploadedDocuments to avoid infinite re-render loops in save callbacks
  useEffect(() => {
    uploadedDocumentsRef.current = uploadedDocuments;
  }, [uploadedDocuments]);

  // Restore active project on initial mount
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current || !activeProjectId || showOnboarding) return;
    initialLoadRef.current = true;

    const draft = loadProject(activeProjectId);
    if (
      draft &&
      (draft.chatState?.messages?.length > 0 ||
        draft.documentState?.sections?.some((s) => s.content.trim()))
    ) {
      if (draft.chatState) restoreChat(draft.chatState);
      if (draft.documentState) restoreDocument(draft.documentState);
      flowStartedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, showOnboarding]);

  // Auto-start the flow on mount (after onboarding and initial load)
  useEffect(() => {
    if (!flowStartedRef.current && !showOnboarding) {
      flowStartedRef.current = true;
      startFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnboarding, startFlow, resetCounter]);

  // Sync project metadata on state changes
  useEffect(() => {
    if (activeProjectId && phase) {
      syncProjectMeta(phase, documentState.meta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, phase, documentState.meta.projectTitle, documentState.meta.type]);

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('rfp_onboarded', 'true');
    setShowOnboarding(false);
  }, []);

  const handleNewProject = useCallback(() => {
    // Save current project
    if (activeProjectId) {
      saveProject(activeProjectId, {
        chatState: { messages, guidedStep, phase, gatheredAnswers, uploadedFileText, uploadedDocuments: uploadedDocumentsRef.current, outlineSections },
        documentState,
        savedAt: Date.now(),
      });
    }
    createProject();
    resetChat();
    resetDocument();
    flowStartedRef.current = false;
    setResetCounter((c) => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, messages, guidedStep, phase, gatheredAnswers, uploadedFileText, outlineSections, documentState, saveProject, createProject, resetChat, resetDocument]);

  const handleSelectProject = useCallback(
    (targetId: string) => {
      if (targetId === activeProjectId) return;

      const currentDraft = {
        chatState: { messages, guidedStep, phase, gatheredAnswers, uploadedFileText, uploadedDocuments: uploadedDocumentsRef.current, outlineSections },
        documentState,
        savedAt: Date.now(),
      };

      const targetDraft = switchProject(targetId, currentDraft);

      if (
        targetDraft &&
        (targetDraft.chatState?.messages?.length > 0 ||
          targetDraft.documentState?.sections?.some((s) => s.content.trim()))
      ) {
        restoreChat(targetDraft.chatState);
        restoreDocument(targetDraft.documentState);
        flowStartedRef.current = true;
      } else {
        resetChat();
        resetDocument();
        flowStartedRef.current = false;
        setResetCounter((c) => c + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProjectId, messages, guidedStep, phase, gatheredAnswers, uploadedFileText, outlineSections, documentState, switchProject, restoreChat, restoreDocument, resetChat, resetDocument]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      if (!window.confirm('Delete this project? This cannot be undone.')) return;

      const wasActive = projectId === activeProjectId;
      deleteProject(projectId);

      if (wasActive) {
        // deleteProject already updates activeProjectId in the index.
        // We need to load that new active project or start fresh.
        // The projects state will update on next render, so we reset and let the effect handle it.
        resetChat();
        resetDocument();
        flowStartedRef.current = false;
        setResetCounter((c) => c + 1);
      }
    },
    [activeProjectId, deleteProject, resetChat, resetDocument]
  );

  const handleSuggestionsReceived = useCallback(
    (suggestions: SectionSuggestion[]) => {
      suggestions.forEach((s) => {
        addSection(s.title, s.content);
      });
    },
    [addSection]
  );

  const handleUploadError = useCallback((msg: string) => {
    alert(msg);
  }, []);

  const handleExportComplete = useCallback(() => {
    setShowFeedback(true);
  }, []);

  // Determine if document panel should be visible
  const showDocumentPanel =
    phase === 'generating' ||
    phase === 'done' ||
    isStreaming ||
    documentState.sections.some((s) => s.content.trim());

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Onboarding */}
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}

      {/* File Uploader Modal */}
      <FileUploader
        isOpen={showUploader}
        onClose={() => setShowUploader(false)}
        onSuggestionsReceived={handleSuggestionsReceived}
        onError={handleUploadError}
      />

      {/* Feedback Toast */}
      <FeedbackToast
        isVisible={showFeedback}
        onDismiss={() => setShowFeedback(false)}
      />

      {/* Toolbar */}
      <Toolbar
        documentState={documentState}
        isGenerating={isGenerating}
        onReset={handleNewProject}
        onExportComplete={handleExportComplete}
      />

      {/* Main Content: Sidebar + Adaptive Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          isCollapsed={sidebarCollapsed}
          isGenerating={isGenerating || isStreaming}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
        />

        {/* Chat Panel */}
        <div
          className={`flex flex-col transition-all duration-500 ease-in-out ${
            showDocumentPanel
              ? 'w-2/5 min-w-[320px] border-r border-gray-200'
              : 'w-full max-w-2xl mx-auto'
          }`}
        >
          <Chat
            messages={messages}
            isTyping={isTyping}
            isGenerating={isGenerating}
            phase={phase}
            guidedStep={guidedStep}
            outlineSections={outlineSections}
            isOutlineLoading={isOutlineLoading}
            currentSection={currentSection}
            onSendMessage={sendMessage}
            onRetry={retryLast}
            onFileUpload={() => setShowUploader(true)}
            onSkipStep={skipCurrentStep}
            onSkipToGenerate={skipToGenerate}
            onScopeUpload={handleScopeUpload}
            onSkipScopeUpload={skipScopeUpload}
            uploadedDocuments={uploadedDocuments}
            onRemoveDocument={removeUploadedDocument}
            onTriggerGenerate={triggerGenerate}
            onToggleOutlineSection={toggleOutlineSection}
            onApproveOutline={approveOutline}
            onRegenerateOutline={regenerateOutline}
          />
        </div>

        {/* Document Panel — slides in from right when document is ready */}
        {showDocumentPanel && (
          <div className="flex-1 flex flex-col doc-panel-enter">
            <DocumentPreview
              documentState={documentState}
              completedSections={completedSections}
              totalSections={totalSections}
              isStreaming={isStreaming}
              showPlaceholder={showPlaceholder}
              currentSection={currentSection}
              qualityReview={qualityReview}
              onUpdateSection={updateSection}
              onRemoveSection={removeSection}
              onAddSection={addSection}
              onReorderSections={reorderSections}
              // Section regeneration
              regeneratingSectionId={regeneratingSectionId}
              onRegenerateSection={regenerateSection}
              previousSectionContent={previousSectionContent}
              onUndoRegeneration={undoRegeneration}
              // Copilot
              onCopilotEdit={copilotEdit}
              // Document analysis & competitive intel
              documentAnalysis={documentAnalysis}
              competitiveIntel={competitiveIntel}
              onApplySuggestion={regenerateSection}
              // Quality review fix
              onFixIssue={fixIssue}
              fixingIssue={fixingIssue}
              fixedIssues={fixedIssues}
              findSectionByTitle={findSectionByTitle}
              onFixAllErrors={fixAllErrors}
              onFixStart={handleFixStart}
              onFixDone={handleFixDone}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
