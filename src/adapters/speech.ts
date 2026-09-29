// Text-to-speech and speech recognition adapters (expo-speech, expo-speech-recognition).
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import type { Settings } from '@/core/types';

type SpeakOpts = Pick<Settings, 'language' | 'voice' | 'rate'>;

/** Resolves when the utterance finishes, is stopped, or fails. */
export function speak(text: string, { language, voice, rate }: SpeakOpts): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      voice: voice ?? undefined,
      rate,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export function stopSpeaking(): void {
  void Speech.stop();
}

export async function listVoices(language: string): Promise<Speech.Voice[]> {
  const prefix = language.split('-')[0].toLowerCase();
  const voices = await Speech.getAvailableVoicesAsync();
  return voices.filter((v) => v.language.toLowerCase().replace('_', '-').startsWith(prefix));
}

export async function ensureMicPermission(): Promise<boolean> {
  const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (current.granted) return true;
  return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
}

export function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/**
 * Listens for one phrase. Resolves with the final transcript ('' if nothing was heard).
 * onPartial receives live text while the user speaks.
 */
export function listenOnce(language: string, onPartial?: (text: string) => void): { result: Promise<string>; stop: () => void } {
  let text = '';
  const subs: { remove(): void }[] = [];
  const cleanup = () => subs.forEach((s) => s.remove());

  const result = new Promise<string>((resolve, reject) => {
    subs.push(
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        text = e.results[0]?.transcript ?? text;
        onPartial?.(text);
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'speech-timeout') return;
        cleanup();
        reject(new Error(e.message || e.error));
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        cleanup();
        resolve(text.trim());
      }),
    );
    ExpoSpeechRecognitionModule.start({ lang: language, interimResults: true, addsPunctuation: true, continuous: false });
  });

  return { result, stop: () => ExpoSpeechRecognitionModule.stop() };
}

/**
 * Keeps listening and reports each partial/final phrase until stopped.
 * Used for the "say don't know" signal during the think window.
 */
export function listenContinuously(language: string, onPhrase: (text: string) => void): () => void {
  const sub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
    const t = e.results[0]?.transcript;
    if (t) onPhrase(t);
  });
  ExpoSpeechRecognitionModule.start({ lang: language, interimResults: true, continuous: true });
  return () => {
    sub.remove();
    ExpoSpeechRecognitionModule.abort();
  };
}
