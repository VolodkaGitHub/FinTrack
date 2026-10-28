import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import dayjs from 'dayjs';
import 'dayjs/locale/uk';
import relativeTime from 'dayjs/plugin/relativeTime';
import { afterEach } from 'vitest';

dayjs.extend(relativeTime);
dayjs.locale('uk');

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});

if (typeof window !== 'undefined') {
  // Mantine використовує ці API браузера, яких немає в jsdom
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView ??= () => undefined;
  window.scrollTo = () => undefined;
}
