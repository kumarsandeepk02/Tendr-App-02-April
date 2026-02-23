import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectMeta,
  ProjectIndex,
  Draft,
  DocumentMeta,
  UnifiedFlowPhase,
} from '../types';

const PROJECTS_KEY = 'rfp_projects';
const LEGACY_KEY = 'rfp_draft_current';

function projectStorageKey(id: string): string {
  return `rfp_project_${id}`;
}

function createEmptyProject(): ProjectMeta {
  const now = Date.now();
  return {
    id: uuidv4(),
    title: 'Untitled RFP',
    status: 'draft',
    documentType: 'RFP',
    phase: 'questions',
    createdAt: now,
    updatedAt: now,
  };
}

function initializeProjectIndex(): ProjectIndex {
  // Try loading existing index
  try {
    const indexStr = localStorage.getItem(PROJECTS_KEY);
    if (indexStr) {
      const index: ProjectIndex = JSON.parse(indexStr);
      if (index.version && index.projects) return index;
    }
  } catch {
    /* fall through */
  }

  // Check for legacy draft
  try {
    const legacyStr = localStorage.getItem(LEGACY_KEY);
    if (legacyStr) {
      const legacyDraft: Draft = JSON.parse(legacyStr);
      const project = createEmptyProject();

      project.title =
        legacyDraft.documentState?.meta?.projectTitle || 'Untitled RFP';
      project.status =
        legacyDraft.chatState?.phase === 'done' ? 'completed' : 'draft';
      project.documentType =
        legacyDraft.documentState?.meta?.type || 'RFP';
      project.phase = legacyDraft.chatState?.phase || 'questions';
      project.createdAt =
        legacyDraft.documentState?.meta?.createdAt || Date.now();
      project.updatedAt = legacyDraft.savedAt || Date.now();

      // Save project data under new key
      localStorage.setItem(
        projectStorageKey(project.id),
        legacyStr
      );
      localStorage.removeItem(LEGACY_KEY);

      const index: ProjectIndex = {
        version: 1,
        activeProjectId: project.id,
        projects: [project],
      };
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
      return index;
    }
  } catch {
    /* fall through */
  }

  // Fresh install
  const project = createEmptyProject();
  const index: ProjectIndex = {
    version: 1,
    activeProjectId: project.id,
    projects: [project],
  };
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
  return index;
}

export function useProjects() {
  const [index, setIndex] = useState<ProjectIndex>(initializeProjectIndex);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist index on changes (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
      } catch {
        /* localStorage full */
      }
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [index]);

  const activeProjectId = index.activeProjectId;

  // Sorted by most recently updated
  const projects = [...index.projects].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const loadProject = useCallback((projectId: string): Draft | null => {
    try {
      const str = localStorage.getItem(projectStorageKey(projectId));
      return str ? JSON.parse(str) : null;
    } catch {
      return null;
    }
  }, []);

  const saveProject = useCallback(
    (projectId: string, draft: Draft) => {
      try {
        localStorage.setItem(
          projectStorageKey(projectId),
          JSON.stringify(draft)
        );
      } catch {
        /* localStorage full */
      }
    },
    []
  );

  const createProject = useCallback((): string => {
    const project = createEmptyProject();
    setIndex((prev) => ({
      ...prev,
      activeProjectId: project.id,
      projects: [project, ...prev.projects],
    }));
    return project.id;
  }, []);

  const switchProject = useCallback(
    (targetId: string, currentDraft: Draft): Draft | null => {
      // Save current project first
      if (index.activeProjectId) {
        saveProject(index.activeProjectId, currentDraft);
      }
      // Update active
      setIndex((prev) => ({
        ...prev,
        activeProjectId: targetId,
      }));
      // Load target
      return loadProject(targetId);
    },
    [index.activeProjectId, saveProject, loadProject]
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      localStorage.removeItem(projectStorageKey(projectId));
      setIndex((prev) => {
        const remaining = prev.projects.filter((p) => p.id !== projectId);
        let newActiveId = prev.activeProjectId;

        if (prev.activeProjectId === projectId) {
          // Switch to first remaining, or create new
          if (remaining.length > 0) {
            newActiveId = remaining[0].id;
          } else {
            const fresh = createEmptyProject();
            remaining.push(fresh);
            newActiveId = fresh.id;
          }
        }

        return {
          ...prev,
          activeProjectId: newActiveId,
          projects: remaining,
        };
      });
    },
    []
  );

  const updateProjectMeta = useCallback(
    (projectId: string, updates: Partial<ProjectMeta>) => {
      setIndex((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      }));
    },
    []
  );

  const syncProjectMeta = useCallback(
    (phase: UnifiedFlowPhase, docMeta: DocumentMeta) => {
      if (!activeProjectId) return;
      updateProjectMeta(activeProjectId, {
        title: docMeta.projectTitle || 'Untitled RFP',
        documentType: docMeta.type,
        phase,
        status: phase === 'done' ? 'completed' : 'draft',
        updatedAt: Date.now(),
      });
    },
    [activeProjectId, updateProjectMeta]
  );

  return {
    projects,
    activeProjectId,
    createProject,
    switchProject,
    deleteProject,
    saveProject,
    loadProject,
    syncProjectMeta,
    updateProjectMeta,
  };
}
