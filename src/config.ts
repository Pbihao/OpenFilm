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
  const toSave: Partial<AppConfig> = { ...config };
  // Don't persist keys that match the env var defaults — keeps .env.local changes effective
  if (toSave.openrouterApiKey === (import.meta.env.VITE_OPENROUTER_API_KEY ?? ''))
    delete toSave.openrouterApiKey;
  if (toSave.falApiKey === (import.meta.env.VITE_FAL_API_KEY ?? ''))
    delete toSave.falApiKey;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(toSave));
}

export function isConfigured(): boolean {
  const c = loadConfig();
  return !!(c.openrouterApiKey && c.falApiKey);
}
