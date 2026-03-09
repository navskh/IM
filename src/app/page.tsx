'use client';

import { TabProvider } from '@/components/tabs/TabContext';
import TabShell from '@/components/tabs/TabShell';

export default function App() {
  return (
    <TabProvider>
      <TabShell />
    </TabProvider>
  );
}
