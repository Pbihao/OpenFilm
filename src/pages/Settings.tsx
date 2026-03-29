/**
 * Settings page — API key configuration
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { loadConfig, saveConfig, type AppConfig } from '@/config';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Eye, EyeOff, FolderOpen } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<AppConfig>(loadConfig());
  const [showKeys, setShowKeys] = useState(false);

  const handleSave = () => {
    saveConfig(config);
    navigate('/');
  };

  const inputClass = "w-full px-3 py-2 text-sm rounded-lg bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{t('settings.title')}</h1>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => { const next = i18n.language === 'zh' ? 'en' : 'zh'; i18n.changeLanguage(next); localStorage.setItem('video-agent-lang', next); }}>
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">{t('settings.openrouterKey')}</label>
              <button onClick={() => setShowKeys(!showKeys)} className="text-muted-foreground hover:text-foreground">
                {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input type={showKeys ? 'text' : 'password'} className={inputClass}
              value={config.openrouterApiKey} onChange={e => setConfig(c => ({ ...c, openrouterApiKey: e.target.value }))}
              placeholder="sk-or-..." />
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.openrouterHint')} <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">openrouter.ai/keys</a>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">{t('settings.falKey')}</label>
            <input type={showKeys ? 'text' : 'password'} className={inputClass}
              value={config.falApiKey} onChange={e => setConfig(c => ({ ...c, falApiKey: e.target.value }))}
              placeholder="fal-..." />
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.falHint')} <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">fal.ai/dashboard/keys</a>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">{t('settings.agentModel')}</label>
            <input type="text" className={inputClass}
              value={config.agentModel} onChange={e => setConfig(c => ({ ...c, agentModel: e.target.value }))} />
          </div>

          <Button onClick={handleSave} className="w-full gap-2">
            <Save className="h-4 w-4" />{t('settings.save')}
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-start gap-3">
            <FolderOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">本地存储</p>
              <p className="text-xs text-muted-foreground">
                生成的图片、视频和对话记录自动保存到项目目录下的{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">local-data/</code>{' '}
                文件夹，按 session 分子目录存放。
              </p>
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 pt-1 border-t border-border">
            <div>
              <p className="text-sm font-medium">{t('settings.persistFalUploads')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.persistFalUploadsHint')}</p>
            </div>
            <Switch
              checked={config.persistFalUploads ?? false}
              onCheckedChange={v => setConfig(c => ({ ...c, persistFalUploads: v }))}
            />
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          ⚠️ {t('settings.securityWarning')}
        </p>
      </div>
    </div>
  );
}
