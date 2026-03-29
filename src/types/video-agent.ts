/**
 * Video Agent — Shared types
 */

export type ToolConfirmationStatus = 'pending' | 'confirmed' | 'rejected';

// Always-expensive tools (require confirmation regardless of args)
export const EXPENSIVE_TOOLS = new Set([
  'generate_frames',
  'generate_videos',
  'reset_workspace',
  'generate_image',
]);
// edit_shot is conditionally expensive: only when args.regenerate is set
// — handled in processToolRound via isExpensiveToolCall()

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  isLoading?: boolean;
  toolStatus?: ToolStatus[];
  imageUrls?: string[];
  isUploadingImages?: boolean;
  suggestedActions?: SuggestedAction[];
  pendingToolCalls?: ToolCall[];
  confirmationStatus?: ToolConfirmationStatus;
}

export interface SuggestedAction {
  label: string;
  message: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface ToolStatus {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export interface StreamResult {
  content: string;
  thinking: string;
  tool_calls?: ToolCall[];
}
