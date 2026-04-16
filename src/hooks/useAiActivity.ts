import { useSyncExternalStore } from 'react';
import { getAiActivities, subscribeAiActivity, type AiActivity } from '@/lib/ai-activity';

export function useAiActivity(): AiActivity[] {
  return useSyncExternalStore(subscribeAiActivity, getAiActivities, getAiActivities);
}
