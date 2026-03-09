'use client';

import { useTabContext } from './TabContext';
import TabBar from './TabBar';
import DashboardPanel from '@/components/dashboard/DashboardPanel';
import WorkspacePanel from '@/components/workspace/WorkspacePanel';

export default function TabShell() {
  const { state } = useTabContext();

  return (
    <div className="h-screen flex flex-col">
      <TabBar />
      <div className="flex-1 min-h-0 relative">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0 flex flex-col"
            style={{ display: tab.id === state.activeTabId ? 'flex' : 'none' }}
          >
            {tab.type === 'dashboard' ? (
              <DashboardPanel />
            ) : (
              <WorkspacePanel
                id={tab.projectId!}
                initialSubId={tab.initialSubId}
                initialTaskId={tab.initialTaskId}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
