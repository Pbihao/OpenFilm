/**
 * Config — reads API keys from localStorage
 */

const CONFIG_KEY = 'video-agent-config';

export interface AppConfig {
  openrouterApiKey: string;
  falApiKey: string;
  agentModel: string;
  persistFalUploads: boolean;
}

const DEFAULTS: AppConfig = {
  openrouterApiKey: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  falApiKey: import.meta.env.VITE_FAL_API_KEY ?? '',
  agentModel: 'anthropic/claude-opus-4.6',
  persistFalUploads: false,
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function isConfigured(): boolean {
  const c = loadConfig();
  return !!(c.openrouterApiKey && c.falApiKey);
}
