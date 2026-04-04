import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ProjectMeta,
  Draft,
  DocumentMeta,
  UnifiedFlowPhase,
} from '../types';
import { api } from '../utils/api';

/**
 * useProjects — project management backed by Neon DB via API.
 *
 * Falls back to localStorage for draft state (chat messages, document sections)
 * that hasn't been saved to the server yet (e.g., mid-planning).
 * Project metadata (title, status, phase) is always server-authoritative.
 */

function projectStorageKey(id: string): string {
  return `rfp_project_${id}`;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch projects from server on mount
  useEffect(() => {
    api.get('/api/projects')
      .then((res) => {
        const serverProjects: ProjectMeta[] = res.data.projects || [];

        if (serverProjects.length > 0) {
          setProjects(serverProjects);

          // Restore last active project from localStorage hint
          const lastActive = localStorage.getItem('tendr_active_project');
          if (lastActive && serverProjects.find((p) => p.id === lastActive)) {
            setActiveProjectId(lastActive);
          } else {
            setActiveProjectId(serverProjects[0].id);
          }
        } else {
          // No projects — create one
          createProjectOnServer().then((newProject) => {
            if (newProject) {
              setProjects([newProject]);
              setActiveProjectId(newProject.id);
            }
          });
        }
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load projects:', err);
        // Fallback: create a project
        createProjectOnServer().then((newProject) => {
          if (newProject) {
            setProjects([newProject]);
            setActiveProjectId(newProject.id);
          }
          setIsLoaded(true);
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active project ID to localStorage
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('tendr_active_project', activeProjectId);
    }
  }, [activeProjectId]);

  // Sorted by most recently updated
  const sortedProjects = [...projects].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  // --- Draft management (local storage for in-progress state) ---

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

  // --- Server operations ---

  const createProject = useCallback(
    (opts?: { title?: string; documentType?: string; folderId?: string }): string => {
      const tempId = `temp-${Date.now()}`;
      const now = Date.now();
      const tempProject: ProjectMeta = {
        id: tempId,
        title: opts?.title || 'Untitled Document',
        status: 'draft',
        documentType: (opts?.documentType?.toUpperCase() || 'RFP') as ProjectMeta['documentType'],
        phase: 'questions',
        folderId: opts?.folderId || null,
        createdAt: now,
        updatedAt: now,
      };

      setProjects((prev) => [tempProject, ...prev]);
      setActiveProjectId(tempId);

      createProjectOnServer(opts).then((serverProject) => {
        if (serverProject) {
          setProjects((prev) =>
            prev.map((p) => (p.id === tempId ? serverProject : p))
          );
          setActiveProjectId(serverProject.id);

          const tempDraft = localStorage.getItem(projectStorageKey(tempId));
          if (tempDraft) {
            localStorage.setItem(projectStorageKey(serverProject.id), tempDraft);
            localStorage.removeItem(projectStorageKey(tempId));
          }
        }
      });

      return tempId;
    },
    []
  );

  const switchProject = useCallback(
    (targetId: string, currentDraft: Draft): Draft | null => {
      // Save current project's draft locally
      if (activeProjectId) {
        saveProject(activeProjectId, currentDraft);
      }

      setActiveProjectId(targetId);

      // Load target project's draft
      return loadProject(targetId);
    },
    [activeProjectId, saveProject, loadProject]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      // Snapshot for rollback
      const snapshot = projects;
      const draftBackup = localStorage.getItem(projectStorageKey(projectId));

      // Optimistic: remove from state
      localStorage.removeItem(projectStorageKey(projectId));

      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== projectId);

        if (activeProjectId === projectId) {
          if (remaining.length > 0) {
            setActiveProjectId(remaining[0].id);
          } else {
            createProjectOnServer().then((newProject) => {
              if (newProject) {
                setProjects((p) => [...p, newProject]);
                setActiveProjectId(newProject.id);
              }
            });
          }
        }

        return remaining;
      });

      // Confirm with server — rollback on failure
      try {
        await api.delete(`/api/projects/${projectId}`);
      } catch (err) {
        console.error('Failed to delete project on server, rolling back:', err);
        setProjects(snapshot);
        if (draftBackup) {
          localStorage.setItem(projectStorageKey(projectId), draftBackup);
        }
        if (activeProjectId === projectId) {
          setActiveProjectId(projectId);
        }
      }
    },
    [activeProjectId, projects]
  );

  const updateProjectMeta = useCallback(
    (projectId: string, updates: Partial<ProjectMeta>) => {
      // Update local state immediately
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, ...updates } : p
        )
      );

      // Debounced sync to server
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        api.patch(`/api/projects/${projectId}`, updates).catch((err) => {
          console.error('Failed to sync project meta:', err);
        });
      }, 500);
    },
    []
  );

  const syncProjectMeta = useCallback(
    (phase: UnifiedFlowPhase, docMeta: DocumentMeta) => {
      if (!activeProjectId) return;
      updateProjectMeta(activeProjectId, {
        title: docMeta.projectTitle || 'Untitled Document',
        documentType: docMeta.type,
        phase,
        status: phase === 'done' ? 'completed' : 'draft',
        updatedAt: Date.now(),
      });
    },
    [activeProjectId, updateProjectMeta]
  );

  const moveDocument = useCallback(
    async (projectId: string, folderId: string | null) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, folderId, updatedAt: Date.now() } : p
        )
      );

      try {
        await api.patch(`/api/projects/${projectId}`, { folderId });
      } catch (err) {
        console.error('Failed to move document:', err);
      }
    },
    []
  );

  const fetchFolderDocs = useCallback(async (folderId: string) => {
    try {
      const res = await api.get(`/api/projects?folderId=${folderId}&includeBriefs=true`);
      return (res.data.projects || []) as Array<ProjectMeta & { briefData?: any }>;
    } catch {
      return [];
    }
  }, []);

  return {
    projects: sortedProjects,
    activeProjectId,
    isLoaded,
    createProject,
    switchProject,
    deleteProject,
    saveProject,
    loadProject,
    syncProjectMeta,
    updateProjectMeta,
    moveDocument,
    fetchFolderDocs,
  };
}

async function createProjectOnServer(
  opts?: { title?: string; documentType?: string; folderId?: string }
): Promise<ProjectMeta | null> {
  try {
    const res = await api.post('/api/projects', {
      title: opts?.title || 'Untitled Document',
      documentType: opts?.documentType || 'RFP',
      folderId: opts?.folderId || undefined,
    });
    return res.data;
  } catch (err) {
    console.error('Failed to create project on server:', err);
    return null;
  }
}
