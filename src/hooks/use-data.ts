import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { onDataChanged } from '@/data/db';

/**
 * Loads async data and reloads it when the screen regains focus, when the
 * database reports a change, or when `key` changes. Returns null until the
 * first load finishes.
 */
export function useData<T>(load: () => Promise<T>, key: unknown = null): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  const seq = useRef(0);
  const keyStr = JSON.stringify(key);

  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(() => {
    const n = ++seq.current;
    void loadRef.current().then((d) => {
      if (n === seq.current) setData(d); // ignore out-of-order results
    });
    // keyStr is the trigger: a new key means a new reload function, which refocus-reloads.
  }, [keyStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(reload);
  useEffect(() => onDataChanged(reload), [reload]);

  return [data, reload];
}
