import { createContext, useContext } from 'react';

export interface WorkshopActions {
  fillPrompt: (text: string) => void;
  directSend: (text: string) => void;
  attachFrameToChat: (url: string) => void;
}

const WorkshopActionsContext = createContext<WorkshopActions | null>(null);

export const WorkshopActionsProvider = WorkshopActionsContext.Provider;

export function useWorkshopActions(): WorkshopActions {
  const ctx = useContext(WorkshopActionsContext);
  if (!ctx) throw new Error('useWorkshopActions must be used within WorkshopActionsProvider');
  return ctx;
}
