import { NextRequest } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { replaceProjectContexts } from '@/lib/db/queries/context';
import { scanProjectDirectoryStream } from '@/lib/scanner';
import { runAnalysis } from '@/lib/ai/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return new Response('Project not found', { status: 404 });
  }

  if (!project.project_path) {
    return new Response('No project path', { status: 400 });
  }

  const projectPath = project.project_path;
  const projectId = id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };
      let directoryTree = '';
      let readmeContent = '';
      let packageJsonContent = '';

      try {
        const generator = scanProjectDirectoryStream(projectPath);

        for (const event of generator) {
          if (event.type === 'scanning_dir') {
            send('scanning', { dir: event.dir });
          } else if (event.type === 'file_found') {
            send('file', {
              file_path: event.file!.file_path,
              size: event.file!.size,
              category: event.file!.category,
              folder: event.file!.folder,
              summarized: event.file!.summarized,
            });
          } else if (event.type === 'done') {
            replaceProjectContexts(projectId, event.results!);
            directoryTree = event.results?.find(r => r.file_path === '__directory_tree.txt')?.content || '';
            readmeContent = event.results?.find(r => r.file_path.match(/^README\.md$/i))?.content || '';
            packageJsonContent = event.results?.find(r => r.file_path === 'package.json')?.content || '';
            send('scan_complete', {
              total: event.total,
              totalSize: event.totalSize,
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Scan failed';
        send('error', { error: msg });
        controller.close();
        return;
      }

      // Phase 2: Auto-analyze project with AI
      send('analyzing', { message: '프로젝트를 분석하고 있습니다...' });

      const analysisPrompt = `아래 프로젝트의 디렉토리 구조와 핵심 파일을 보고, 이 프로젝트에 대해 간결하게 설명해주세요.

다음 형식으로 작성해주세요 (마크다운 없이 평문):
1. 프로젝트 목적 (1줄)
2. 기술 스택 (1줄)
3. 주요 서브 프로젝트/모듈 구성 (2-3줄)
4. 현재 개발 상태 추정 (1줄)

간결하고 핵심만 담아주세요. 한국어로 작성하세요.

=== 디렉토리 구조 ===
${directoryTree.slice(0, 5000)}

${readmeContent ? `=== README.md ===\n${readmeContent.slice(0, 3000)}` : ''}

${packageJsonContent ? `=== package.json ===\n${packageJsonContent.slice(0, 2000)}` : ''}`;

      try {
        const analysisResult = await runAnalysis(analysisPrompt, (text) => {
          send('analysis_text', { text });
        });
        send('analysis_done', { description: analysisResult });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        console.error('[scan] Auto-analysis failed:', msg);
        send('analysis_done', { description: '', error: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
