import { vi } from 'vitest';

const store: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    multiRemove: vi.fn((keys: string[]) => {
      for (const key of keys) delete store[key];
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) delete store[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(store))),
  },
  __store: store,
}));
