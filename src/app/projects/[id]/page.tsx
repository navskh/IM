'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    // Store project ID for TabProvider to pick up, then redirect to root
    sessionStorage.setItem('im-open-project', id);
    router.replace('/');
  }, [id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}
