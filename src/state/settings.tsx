import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_SETTINGS, type Settings } from '@/core/types';
import { loadSettings, saveSettings } from '@/data/db';

interface SettingsCtx {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, ready: false, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSettings().then((stored) => {
      // First launch: default the speech language to the device locale.
      const tag = getLocales()[0]?.languageTag;
      setSettings(stored ?? { ...DEFAULT_SETTINGS, language: tag ?? DEFAULT_SETTINGS.language });
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, ready, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
