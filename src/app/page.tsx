'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface IProject {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<IProject[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });

    if (res.ok) {
      const project = await res.json();
      setName('');
      setDescription('');
      setShowForm(false);
      router.push(`/projects/${project.id}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;

    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    fetchProjects();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            IM <span className="text-muted-foreground font-normal text-lg ml-2">아이디어 매니저</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            자유롭게 아이디어를 쏟아내면, AI가 구조화해드립니다
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg
                     transition-colors font-medium text-sm"
        >
          + 새 프로젝트
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 p-5 bg-card rounded-lg border border-border"
        >
          <input
            type="text"
            placeholder="프로젝트 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 mb-3
                       focus:border-primary focus:outline-none text-foreground"
            autoFocus
          />
          <input
            type="text"
            placeholder="설명 (선택사항)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 mb-4
                       focus:border-primary focus:outline-none text-foreground"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg
                         transition-colors text-sm"
            >
              만들기
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-20">로딩 중...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">💡</div>
          <p className="text-muted-foreground text-lg mb-2">아직 프로젝트가 없습니다</p>
          <p className="text-muted-foreground text-sm">
            &quot;새 프로젝트&quot; 버튼을 눌러 시작하세요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="p-5 bg-card hover:bg-card-hover border border-border rounded-lg
                         cursor-pointer transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {project.name}
                  </h2>
                  {project.description && (
                    <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
                  )}
                  <p className="text-muted-foreground text-xs mt-2">
                    수정일 {formatDate(project.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(project.id, e)}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-0
                             group-hover:opacity-100 p-1 text-sm"
                  title="프로젝트 삭제"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
