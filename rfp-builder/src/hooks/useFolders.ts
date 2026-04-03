import { useState, useCallback, useEffect } from 'react';
import { FolderMeta } from '../types';
import { api } from '../utils/api';

/**
 * useFolders — folder (project) management backed by the API.
 * Folders are the organizational layer above individual documents (RFPs/RFIs).
 */
export function useFolders() {
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch folders from server on mount
  useEffect(() => {
    api.get('/api/folders')
      .then((res) => {
        setFolders(res.data.folders || []);
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load folders:', err);
        setIsLoaded(true);
      });
  }, []);

  const sortedFolders = [...folders].sort((a, b) => b.updatedAt - a.updatedAt);

  const createFolder = useCallback(
    async (name: string, description?: string): Promise<FolderMeta | null> => {
      // Optimistic
      const tempId = `temp-folder-${Date.now()}`;
      const now = Date.now();
      const tempFolder: FolderMeta = {
        id: tempId,
        name,
        description,
        documentCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      setFolders((prev) => [tempFolder, ...prev]);

      try {
        const res = await api.post('/api/folders', { name, description });
        const serverFolder: FolderMeta = res.data;
        setFolders((prev) =>
          prev.map((f) => (f.id === tempId ? serverFolder : f))
        );
        return serverFolder;
      } catch (err) {
        console.error('Failed to create folder:', err);
        setFolders((prev) => prev.filter((f) => f.id !== tempId));
        return null;
      }
    },
    []
  );

  const updateFolder = useCallback(
    async (folderId: string, updates: { name?: string; description?: string }) => {
      // Optimistic
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId ? { ...f, ...updates, updatedAt: Date.now() } : f
        )
      );

      try {
        await api.patch(`/api/folders/${folderId}`, updates);
      } catch (err) {
        console.error('Failed to update folder:', err);
      }
    },
    []
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const snapshot = folders;

      setFolders((prev) => prev.filter((f) => f.id !== folderId));

      try {
        await api.delete(`/api/folders/${folderId}`);
      } catch (err) {
        console.error('Failed to delete folder, rolling back:', err);
        setFolders(snapshot);
      }
    },
    [folders]
  );

  const refreshFolders = useCallback(async () => {
    try {
      const res = await api.get('/api/folders');
      setFolders(res.data.folders || []);
    } catch (err) {
      console.error('Failed to refresh folders:', err);
    }
  }, []);

  return {
    folders: sortedFolders,
    isLoaded,
    createFolder,
    updateFolder,
    deleteFolder,
    refreshFolders,
  };
}
