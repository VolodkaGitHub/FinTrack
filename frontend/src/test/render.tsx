import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

interface Options {
  route?: string;
  path?: string;
  /** Дані, які вже є в кеші React Query (як у застосунку після завантаження довідників). */
  queryData?: Array<[QueryKey, unknown]>;
}

/** Рендер компонента з усіма провайдерами застосунку; Mantine у тестовому режимі (без анімацій і порталів). */
export function renderWithProviders(ui: ReactElement, { route = '/', path = '/', queryData = [] }: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryData.forEach(([key, data]) => queryClient.setQueryData(key, data));
  const result = render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'uk', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <MemoryRouter initialEntries={[route]}>
              <Routes>
                <Route path={path} element={ui} />
                {path !== '/' && <Route path="/" element={<div>Головна сторінка</div>} />}
                <Route path="*" element={<div>Інша сторінка</div>} />
              </Routes>
            </MemoryRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>,
  );
  return { ...result, queryClient };
}
