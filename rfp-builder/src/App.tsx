import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { V2Phase } from './types';
import { useChatV2 } from './hooks/useChatV2';
import { useDocument } from './hooks/useDocument';
import { useProjects } from './hooks/useProjects';
import DocumentPreview from './components/DocumentPreview';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import FeedbackToast from './components/FeedbackToast';
import LandingPage from './components/v2/LandingPage';
import PlanningChat from './components/v2/PlanningChat';
import BriefReview from './components/v2/BriefReview';
import GenerationNarrator from './components/v2/GenerationNarrator';
import './index.css';

function App() {
  // Feedback
  const [showFeedback, setShowFeedback] = useState(false);

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

  // V2 Chat options
  const chatOptions = useMemo(
    () => ({
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
    [updateMeta, handleStreamStart, handleStreamChunk, handleStreamDone, handleSectionStart, handleSectionDone, handleReviewResult, handleSectionRegenerationStart, handleSectionRegenerationDone, handleDocumentAnalysis, handleCompetitiveIntel, activeProjectId]
  );

  // V2 Chat state
  const {
    messages,
    phase,
    isTyping,
    isGenerating,
    brief,
    isBriefLoading,
    narrations,
    uploadedDocuments,
    removeUploadedDocument,
    startPlanning,
    sendMessage,
    handleUpload,
    generateBrief,
    updateBrief,
    toggleBriefSection,
    approveAndGenerate,
    backToPlanning,
    resetChat,
    restoreChat,
    // Section operations
    regenerateSection,
    copilotEdit,
    fixIssue,
    fixAllErrors,
    // Model selection
    availableModels,
    selectedModel,
    setSelectedModel,
  } = useChatV2(chatOptions);

  // Sync project metadata
  useEffect(() => {
    if (activeProjectId && phase) {
      // Map V2Phase to something the project meta can understand
      const phaseMapping: Record<V2Phase, string> = {
        landing: 'questions',
        planning: 'questions',
        brief: 'outline_review',
        generating: 'generating',
        done: 'done',
      };
      syncProjectMeta(phaseMapping[phase] as any, documentState.meta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, phase, documentState.meta.projectTitle, documentState.meta.type]);

  const handleNewProject = useCallback(() => {
    createProject();
    resetChat();
    resetDocument();
  }, [createProject, resetChat, resetDocument]);

  const handleSelectProject = useCallback(
    (targetId: string) => {
      if (targetId === activeProjectId) return;

      const currentDraft = {
        chatState: { messages, phase, brief, uploadedDocuments },
        documentState,
        savedAt: Date.now(),
      };

      const targetDraft = switchProject(targetId, currentDraft as any);

      if (
        targetDraft &&
        (targetDraft.chatState?.messages?.length > 0 ||
          targetDraft.documentState?.sections?.some((s: any) => s.content.trim()))
      ) {
        restoreChat(targetDraft.chatState as any);
        restoreDocument(targetDraft.documentState);
      } else {
        resetChat();
        resetDocument();
      }
    },
    [activeProjectId, messages, phase, brief, uploadedDocuments, documentState, switchProject, restoreChat, restoreDocument, resetChat, resetDocument]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      if (!window.confirm('Delete this project? This cannot be undone.')) return;

      const wasActive = projectId === activeProjectId;
      deleteProject(projectId);

      if (wasActive) {
        resetChat();
        resetDocument();
      }
    },
    [activeProjectId, deleteProject, resetChat, resetDocument]
  );

  const handleExportComplete = useCallback(() => {
    setShowFeedback(true);
  }, []);

  // Determine if document panel should be visible
  const showDocumentPanel =
    phase === 'generating' ||
    phase === 'done' ||
    isStreaming ||
    documentState.sections.some((s) => s.content.trim());

  // Determine what to show in the left panel
  const renderLeftPanel = () => {
    switch (phase) {
      case 'landing':
        return (
          <LandingPage
            onStartRFP={() => startPlanning('RFP')}
            onStartRFI={() => startPlanning('RFI')}
            onStartFreeform={() => startPlanning()}
          />
        );
      case 'planning':
        return (
          <PlanningChat
            messages={messages}
            isTyping={isTyping}
            uploadedDocuments={uploadedDocuments}
            onSendMessage={sendMessage}
            onUpload={handleUpload}
            onRemoveDocument={removeUploadedDocument}
            onGenerateBrief={generateBrief}
            isBriefLoading={isBriefLoading}
          />
        );
      case 'brief':
        return brief ? (
          <BriefReview
            brief={brief}
            onToggleSection={toggleBriefSection}
            onUpdateBrief={updateBrief}
            onApproveAndGenerate={approveAndGenerate}
            onBackToPlanning={backToPlanning}
            isGenerating={isGenerating}
          />
        ) : null;
      case 'generating':
        return (
          <GenerationNarrator
            narrations={narrations}
            currentSection={currentSection}
            completedSections={completedSections}
            totalSections={totalSections}
            isGenerating={isGenerating}
          />
        );
      case 'done':
        // After generation, show a completion message in the narrator
        return (
          <GenerationNarrator
            narrations={narrations}
            currentSection={null}
            completedSections={completedSections}
            totalSections={totalSections}
            isGenerating={false}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
        availableModels={availableModels}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
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

        {/* Left Panel: Landing / Planning Chat / Brief Review / Generation Narrator */}
        <div
          className={`flex flex-col transition-all duration-500 ease-in-out ${
            showDocumentPanel
              ? 'w-2/5 min-w-[320px] border-r border-gray-200'
              : 'w-full'
          }`}
        >
          {renderLeftPanel()}
        </div>

        {/* Document Panel — slides in when document is ready */}
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
