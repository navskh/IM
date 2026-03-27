'use client';

import { useEffect, useState } from 'react';

export type DashboardTab = 'active' | 'all' | 'today' | 'archive';

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'archive', label: 'Archive' },
];

export default function TabBar({
  value,
  onChange,
}: {
  value: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-1.5 text-sm rounded-md transition-all ${
            value === tab.key
              ? 'bg-card text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
