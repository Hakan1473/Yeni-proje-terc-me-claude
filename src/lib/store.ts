import { useSyncExternalStore } from 'react';

/** Minimal external store. Components subscribe to slices with useStore(). */
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

/** A single numeric value updated many times per second (audio levels). */
export interface Signal {
  get(): number;
  set(v: number): void;
  subscribe(l: () => void): () => void;
}

export function createSignal(initial = 0): Signal {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(v) {
      if (Math.abs(v - value) < 0.004) return;
      value = v;
      for (const l of listeners) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useSignal(signal: Signal): number {
  return useSyncExternalStore(signal.subscribe, signal.get);
}
