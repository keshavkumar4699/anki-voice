import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export type RemoteAction = 'press' | 'next' | 'previous' | 'stop' | 'interrupt' | 'focusGain';

type Events = {
  onRemote: (e: { action: RemoteAction; ageMs: number }) => void;
  onTimer: (e: { token: number }) => void;
};

interface PodcastControlsNative {
  start(title: string, subtitle: string): void;
  update(title: string, subtitle: string): void;
  stop(): void;
  isRunning(): boolean;
  setTimer(token: number, ms: number): void;
  clearTimers(): void;
  beep(durationMs: number): void;
  addListener<K extends keyof Events>(event: K, listener: Events[K]): EventSubscription;
}

/** Null when the native module isn't compiled in (web, Expo Go, tests). */
export const PodcastControls: PodcastControlsNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<PodcastControlsNative>('PodcastControls') : null;
