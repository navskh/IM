'use client';

import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';

export interface ITab {
  id: string;
  type: 'dashboard' | 'project';
  projectId?: string;
  projectName?: string;
  initialSubId?: string;
  initialTaskId?: string;
}

interface ITabState {
  tabs: ITab[];
  activeTabId: string;
}

type TabAction =
  | { type: 'OPEN_PROJECT'; projectId: string; projectName: string; initialSubId?: string; initialTaskId?: string }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SET_ACTIVE'; tabId: string }
  | { type: 'UPDATE_TAB_NAME'; tabId: string; name: string }
  | { type: 'CONSUME_INITIAL'; tabId: string }
  | { type: 'HYDRATE'; state: ITabState };

const DASHBOARD_TAB: ITab = { id: 'dashboard', type: 'dashboard' };

function ensureDashboard(tabs: ITab[]): ITab[] {
  if (!tabs.some(t => t.id === 'dashboard')) {
    return [DASHBOARD_TAB, ...tabs];
  }
  return tabs;
}

function tabReducer(state: ITabState, action: TabAction): ITabState {
  switch (action.type) {
    case 'OPEN_PROJECT': {
      const existing = state.tabs.find(t => t.projectId === action.projectId);
      if (existing) {
        // Update initial selection if provided
        const tabs = state.tabs.map(t =>
          t.id === existing.id
            ? { ...t, initialSubId: action.initialSubId, initialTaskId: action.initialTaskId }
            : t
        );
        return { tabs, activeTabId: existing.id };
      }
      const newTab: ITab = {
        id: action.projectId,
        type: 'project',
        projectId: action.projectId,
        projectName: action.projectName,
        initialSubId: action.initialSubId,
        initialTaskId: action.initialTaskId,
      };
      return { tabs: [...state.tabs, newTab], activeTabId: newTab.id };
    }
    case 'CLOSE_TAB': {
      if (action.tabId === 'dashboard') return state;
      const idx = state.tabs.findIndex(t => t.id === action.tabId);
      const tabs = state.tabs.filter(t => t.id !== action.tabId);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === action.tabId) {
        // Activate previous tab or dashboard
        activeTabId = tabs[Math.max(0, idx - 1)]?.id || 'dashboard';
      }
      return { tabs: ensureDashboard(tabs), activeTabId };
    }
    case 'SET_ACTIVE':
      return { ...state, activeTabId: action.tabId };
    case 'UPDATE_TAB_NAME':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.tabId ? { ...t, projectName: action.name } : t
        ),
      };
    case 'CONSUME_INITIAL':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.tabId ? { ...t, initialSubId: undefined, initialTaskId: undefined } : t
        ),
      };
    case 'HYDRATE':
      return { tabs: ensureDashboard(action.state.tabs), activeTabId: action.state.activeTabId };
    default:
      return state;
  }
}

const STORAGE_KEY = 'im-tabs';

function loadState(): ITabState {
  if (typeof window === 'undefined') return { tabs: [DASHBOARD_TAB], activeTabId: 'dashboard' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ITabState;
      return { tabs: ensureDashboard(parsed.tabs), activeTabId: parsed.activeTabId };
    }
  } catch { /* ignore */ }
  return { tabs: [DASHBOARD_TAB], activeTabId: 'dashboard' };
}

interface TabContextValue {
  state: ITabState;
  openProject: (projectId: string, projectName: string, initialSubId?: string, initialTaskId?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabName: (tabId: string, name: string) => void;
  consumeInitial: (tabId: string) => void;
}

const TabCtx = createContext<TabContextValue | null>(null);

export function useTabContext() {
  const ctx = useContext(TabCtx);
  if (!ctx) throw new Error('useTabContext must be used within TabProvider');
  return ctx;
}

export function TabProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tabReducer, undefined, loadState);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // URL sync: update URL when active tab changes
  useEffect(() => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;
    const path = activeTab.type === 'dashboard' ? '/' : `/projects/${activeTab.projectId}`;
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [state.activeTabId, state.tabs]);

  // Handle initial URL on mount (e.g., direct bookmark access)
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/projects\/(.+)$/);
    if (match) {
      const projectId = match[1];
      if (!state.tabs.some(t => t.projectId === projectId)) {
        // Fetch project name and open tab
        fetch(`/api/projects/${projectId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) {
              dispatch({ type: 'OPEN_PROJECT', projectId, projectName: data.name });
            }
          });
      } else {
        dispatch({ type: 'SET_ACTIVE', tabId: projectId });
      }
    }
    // Also check sessionStorage redirect
    const redirectId = sessionStorage.getItem('im-open-project');
    if (redirectId) {
      sessionStorage.removeItem('im-open-project');
      fetch(`/api/projects/${redirectId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            dispatch({ type: 'OPEN_PROJECT', projectId: redirectId, projectName: data.name });
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProject = useCallback((projectId: string, projectName: string, initialSubId?: string, initialTaskId?: string) => {
    dispatch({ type: 'OPEN_PROJECT', projectId, projectName, initialSubId, initialTaskId });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', tabId });
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    dispatch({ type: 'SET_ACTIVE', tabId });
  }, []);

  const updateTabName = useCallback((tabId: string, name: string) => {
    dispatch({ type: 'UPDATE_TAB_NAME', tabId, name });
  }, []);

  const consumeInitial = useCallback((tabId: string) => {
    dispatch({ type: 'CONSUME_INITIAL', tabId });
  }, []);

  return (
    <TabCtx.Provider value={{ state, openProject, closeTab, setActiveTab, updateTabName, consumeInitial }}>
      {children}
    </TabCtx.Provider>
  );
}
