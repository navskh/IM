'use client';

import { useTabContext } from './TabContext';

export default function TabBar() {
  const { state, setActiveTab, closeTab } = useTabContext();

  return (
    <div className="tab-bar">
      {state.tabs.map((tab) => {
        const isActive = state.activeTabId === tab.id;
        const isDashboard = tab.type === 'dashboard';

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1 && !isDashboard) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
            className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
          >
            <span className="truncate">
              {isDashboard ? 'Dashboard' : tab.projectName || 'Workspace'}
            </span>
            {!isDashboard && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="tab-close"
              >
                &times;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
