import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n';
import VideoAgentPage from '@/pages/VideoAgent';
import SettingsPage from '@/pages/Settings';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<VideoAgentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}
