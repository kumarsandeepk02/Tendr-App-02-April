import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { V2Phase, ToolMutation, DocumentSection } from './types';
import { useChatV2 } from './hooks/useChatV2';
import { useDocument } from './hooks/useDocument';
import { useProjects } from './hooks/useProjects';
import { useFolders } from './hooks/useFolders';
import DocumentPreview from './components/DocumentPreview';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import CreateDialog from './components/CreateDialog';
import FeedbackToast from './components/FeedbackToast';
import LandingPage from './components/v2/LandingPage';
import PlanningChat from './components/v2/PlanningChat';
import BriefReview from './components/v2/BriefReview';
import GenerationNarrator from './components/v2/GenerationNarrator';
import ReadinessReviewComponent from './components/v2/ReadinessReview';
import PersistentChat from './components/PersistentChat';
import './index.css';

function App() {
  // Feedback
  const [showFeedback, setShowFeedback] = useState(false);

  // Full-page edit mode (hides left panel, expands document to full width)
  const [isFullPageEdit, setIsFullPageEdit] = useState(false);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('rfp_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('rfp_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Folders (what users call "Projects")
  const {
    folders,
    createFolder,
    updateFolder,
    deleteFolder: deleteFolderApi,
    refreshFolders,
  } = useFolders();

  // Documents (what the code calls "projects")
  const {
    projects,
    activeProjectId,
    createProject,
    switchProject,
    deleteProject,
    syncProjectMeta,
  } = useProjects();

  // Creation dialog state
  const [createDialogMode, setCreateDialogMode] = useState<'folder' | 'document' | null>(null);
  const [createDialogPresets, setCreateDialogPresets] = useState<{ docType?: string; folderId?: string }>({});

  // Document state
  const {
    documentState,
    updateMeta,
    updateSection,
    addSection,
    removeSection,
    reorderSections,
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
    generationStage,
    handleStageChange,
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

  // Handle tool mutations from the agent (tool_use results)
  const handleToolMutations = useCallback((mutations: ToolMutation[]) => {
    for (const mutation of mutations) {
      switch (mutation.type) {
        case 'update_section': {
          const section = findSectionByTitle(mutation.sectionTitle || '');
          if (section) updateSection(section.id, { content: mutation.content! });
          break;
        }
        case 'create_section': {
          addSection(mutation.title!, mutation.content || '');
          break;
        }
        case 'delete_section': {
          const section = findSectionByTitle(mutation.sectionTitle || '');
          if (section) removeSection(section.id);
          break;
        }
        case 'reorder_sections': {
          const reordered = (mutation.sectionTitles || [])
            .map(title => documentState.sections.find(
              s => s.title.toLowerCase() === title.toLowerCase()
            ))
            .filter(Boolean) as DocumentSection[];
          if (reordered.length === documentState.sections.length) {
            reorderSections(reordered);
          }
          break;
        }
        case 'update_section_title': {
          const section = findSectionByTitle(mutation.currentTitle || '');
          if (section) updateSection(section.id, { title: mutation.newTitle! });
          break;
        }
      }
    }
  }, [findSectionByTitle, updateSection, addSection, removeSection, reorderSections, documentState.sections]);

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
      onStageChange: handleStageChange,
      projectId: activeProjectId,
      sections: documentState.sections,
      qualityReview,
      onToolMutations: handleToolMutations,
    }),
    [updateMeta, handleStreamStart, handleStreamChunk, handleStreamDone, handleSectionStart, handleSectionDone, handleReviewResult, handleSectionRegenerationStart, handleSectionRegenerationDone, handleDocumentAnalysis, handleCompetitiveIntel, handleStageChange, activeProjectId, documentState.sections, qualityReview, handleToolMutations]
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
    updateBriefSection,
    toggleBriefSection,
    approveAndGenerate,
    proceedToGenerate,
    readinessReview,
    isReadinessLoading,
    backToBrief,
    backToPlanning,
    currentDocType,
    handleHandoff,
    resetChat,
    restoreChat,
    // Freeform / persistent chat
    sendFreeformMessage,
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
        readiness: 'outline_review',
        generating: 'generating',
        done: 'done',
      };
      syncProjectMeta(phaseMapping[phase] as any, documentState.meta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, phase, documentState.meta.projectTitle, documentState.meta.type]);

  // Auto-expand to full-page edit when generation completes
  useEffect(() => {
    if (phase === 'done' && !isGenerating && !isStreaming) {
      setIsFullPageEdit(true);
    }
    if (phase !== 'done' && phase !== 'generating') {
      setIsFullPageEdit(false);
    }
  }, [phase, isGenerating, isStreaming]);

  // Open "New Project" (folder) dialog
  const handleNewProject = useCallback(() => {
    setCreateDialogMode('folder');
    setCreateDialogPresets({});
  }, []);

  // Open "New Document" dialog, optionally pre-selecting a folder
  const handleNewDocument = useCallback((folderId?: string) => {
    setCreateDialogMode('document');
    setCreateDialogPresets({ folderId });
  }, []);

  // Called from LandingPage agent cards — opens naming dialog with doc type preset
  const handleStartDocument = useCallback((docType: 'RFP' | 'RFI' | 'brainstorm') => {
    setCreateDialogMode('document');
    setCreateDialogPresets({ docType });
  }, []);

  // Dialog callbacks
  const handleCreateFolder = useCallback(async (name: string, description?: string) => {
    await createFolder(name, description);
  }, [createFolder]);

  const handleCreateDocument = useCallback((title: string, documentType: string, folderId?: string) => {
    createProject({ title, documentType, folderId });
    resetChat();
    resetDocument();
    setIsFullPageEdit(false);
    // Start planning with the selected doc type
    setTimeout(() => startPlanning(documentType as any), 100);
  }, [createProject, resetChat, resetDocument, startPlanning]);

  const handleDeleteFolder = useCallback((folderId: string) => {
    if (!window.confirm('Delete this project folder? Documents inside will become standalone.')) return;
    deleteFolderApi(folderId);
    refreshFolders();
  }, [deleteFolderApi, refreshFolders]);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    updateFolder(folderId, { name: newName });
  }, [updateFolder]);

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
        // Pass document context so the agent knows the project state on resume
        const docContext = targetDraft.documentState ? {
          sections: targetDraft.documentState.sections?.filter((s: any) => s.content.trim()),
          docType: targetDraft.documentState.meta?.type,
          projectTitle: targetDraft.documentState.meta?.projectTitle,
          phase: targetDraft.chatState?.phase,
        } : undefined;
        restoreChat(targetDraft.chatState as any, docContext);
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
            onStartDocument={handleStartDocument}
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
            onUpdateSection={updateBriefSection}
            onUpdateBrief={updateBrief}
            onApproveAndGenerate={approveAndGenerate}
            onBackToPlanning={backToPlanning}
            isGenerating={isGenerating}
            currentDocType={currentDocType}
            onHandoff={handleHandoff}
          />
        ) : null;
      case 'readiness': {
        const agentNames: Record<string, string> = { RFP: 'Nova', RFI: 'Zuno', rfp: 'Nova', rfi: 'Zuno', brainstorm: 'Zia' };
        const agentName = agentNames[currentDocType || ''] || agentNames[brief?.docType || ''] || 'Nova';
        return (
          <ReadinessReviewComponent
            review={readinessReview}
            isLoading={isReadinessLoading}
            onGenerate={proceedToGenerate}
            onBackToBrief={backToBrief}
            isGenerating={isGenerating}
            agentName={agentName}
          />
        );
      }
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
          folders={folders}
          activeProjectId={activeProjectId}
          isCollapsed={sidebarCollapsed}
          isGenerating={isGenerating || isStreaming}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onNewDocument={handleNewDocument}
          onDeleteProject={handleDeleteProject}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
        />

        {/* Left Panel: Landing / Planning Chat / Brief Review / Generation Narrator */}
        {!isFullPageEdit && (
          <div
            className={`flex flex-col transition-all duration-500 ease-in-out ${
              showDocumentPanel
                ? 'w-2/5 min-w-[320px] border-r border-gray-200'
                : 'w-full'
            }`}
          >
            {renderLeftPanel()}
          </div>
        )}

        {/* Document Panel — full-width in edit mode, slides in during generation */}
        {showDocumentPanel && (
          <div className={`flex flex-col doc-panel-enter ${isFullPageEdit ? 'w-full' : 'flex-1'}`}>
            <DocumentPreview
              documentState={documentState}
              completedSections={completedSections}
              totalSections={totalSections}
              isStreaming={isStreaming}
              showPlaceholder={showPlaceholder}
              currentSection={currentSection}
              qualityReview={qualityReview}
              generationStage={generationStage}
              isFullPageEdit={isFullPageEdit}
              onToggleChatPanel={() => setIsFullPageEdit((prev) => !prev)}
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

      {/* Create Dialog */}
      <CreateDialog
        isOpen={createDialogMode !== null}
        onClose={() => setCreateDialogMode(null)}
        mode={createDialogMode || 'document'}
        folders={folders}
        preselectedDocType={createDialogPresets.docType}
        preselectedFolderId={createDialogPresets.folderId}
        onCreateFolder={handleCreateFolder}
        onCreateDocument={handleCreateDocument}
      />

      {/* Persistent floating chat — available during generation & done phases */}
      <PersistentChat
        phase={phase === 'landing' ? 'questions' : phase === 'planning' ? 'questions' : phase === 'brief' ? 'outline_review' : phase === 'readiness' ? 'outline_review' : phase}
        isGenerating={isGenerating}
        onSendMessage={sendFreeformMessage}
        sectionTitles={documentState.sections.map((s) => s.title)}
      />
    </div>
  );
}

export default App;
