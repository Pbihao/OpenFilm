/**
 * Re-export shim — preserves backward compatibility.
 * All logic lives in ./tools/; import from there directly in new code.
 */
export type { ToolContext, ToolHandler } from './tools/index';
export { executeTool, isExpensiveTool } from './tools/index';
