'use client';

import { TabProvider } from '@/components/tabs/TabContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import TabShell from '@/components/tabs/TabShell';

export default function App() {
  return (
    <ThemeProvider>
      <TabProvider>
        <TabShell />
      </TabProvider>
    </ThemeProvider>
  );
}
