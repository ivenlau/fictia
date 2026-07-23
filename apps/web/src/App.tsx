import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { IDELayout } from "./components/layout/IDELayout";
import { ChapterEditor } from "./features/chapter/ChapterEditor";
import { SettingsModal } from "./features/settings/SettingsModal";
import { NewNovelModal } from "./features/novel/NewNovelModal";
import { useUIStore } from "./stores/uiStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useChatStore } from "./stores/chatStore";
import { settingsApi } from "./api/settings";
import { providersApi } from "./api/providers";

export default function App() {
  const showSettings = useUIStore((s) => s.showSettings);
  const showNewNovel = useUIStore((s) => s.showNewNovel);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const setProviders = useSettingsStore((s) => s.setProviders);

  useEffect(() => {
    settingsApi.get().then(loadSettings).catch(() => {});
    providersApi.list().then(setProviders).catch(() => {});
    // default chat model = first usable provider/model
    providersApi
      .usable()
      .then((usable) => {
        const chat = useChatStore.getState();
        if (!chat.selectedProviderId && usable[0]?.models[0]) {
          chat.setModel(usable[0].id, usable[0].models[0].id);
        }
      })
      .catch(() => {});
  }, [loadSettings, setProviders]);

  return (
    <>
      <IDELayout>
        <Routes>
          <Route path="/" element={<Navigate to="/novel" replace />} />
          <Route path="/novel" element={<></>} />
          <Route path="/novel/:novelId/chapter/:chapterId" element={<ChapterEditor />} />
        </Routes>
      </IDELayout>
      {showSettings && <SettingsModal />}
      {showNewNovel && <NewNovelModal />}
    </>
  );
}
