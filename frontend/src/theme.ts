import { createTheme } from '@mantine/core';

const fontFamily = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: { light: 7, dark: 6 },
  defaultRadius: 'md',
  fontFamily,
  headings: { fontFamily, fontWeight: '700' },
  cursorType: 'pointer',
});
