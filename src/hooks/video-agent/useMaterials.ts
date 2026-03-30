/**
 * useMaterials — unified material library hook.
 * Lifted from WorkshopPanel's inline state. Persists to localStorage.
 */
import { useState, useCallback, useEffect } from 'react';
import type { Material } from '@/types/material';

export type { Material };

const STORAGE_KEY = 'frame-gen-materials';
const MAX_SAVED = 50;

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      type Saved = Omit<Material, 'file'>;
      return (JSON.parse(raw) as Saved[]).filter(s => s.id && s.displayUrl);
    } catch { return []; }
  });

  // Persist to localStorage — only persistent URLs (CDN or local-server), never blob:
  useEffect(() => {
    const timer = setTimeout(() => {
      const toSave = materials
        .filter(m => !m.displayUrl.startsWith('blob:'))
        .slice(-MAX_SAVED)
        .map(({ file: _file, ...rest }) => rest); // strip non-serializable File
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [materials]);

  const addMaterial = useCallback((material: Material) => {
    setMaterials(prev => {
      const idx = prev.findIndex(m => m.id === material.id);
      if (idx >= 0) return prev.map((m, i) => i === idx ? { ...m, ...material, addedAt: Date.now() } : m);
      return [...prev, { ...material, addedAt: Date.now() }];
    });
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
  }, []);

  const clearMaterials = useCallback(() => {
    setMaterials([]);
  }, []);

  return { materials, addMaterial, removeMaterial, clearMaterials };
}
