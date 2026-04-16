# Release

IM 릴리즈 세트를 실행합니다. 인자로 버전 타입(major/minor/patch)과 릴리즈 제목을 받습니다.

## 사용법
```
/release minor "제목"
```
인자가 없으면 물어봅니다.

## 실행 순서

1. **버전 범프** — package.json 버전을 $ARGUMENTS 에 맞게 올림 (major/minor/patch). 인자 없으면 minor.
2. **package-lock.json 동기화** — `npm install --package-lock-only --ignore-scripts`
3. **전체 git add + 커밋** — 미커밋 변경사항을 feat 커밋으로, 버전 범프를 별도 커밋으로
4. **태그** — `git tag v{version}`
5. **푸시** — `git push origin main && git push origin v{version}`
6. **GitHub 릴리즈** — `gh release create` with 릴리즈 노트 (변경사항 요약)
7. **npm 퍼블리시** — `npm publish`
8. **npm deprecate** — 이전 버전들 deprecate
9. **검증** — `npm view idea-manager version`으로 확인

## 주의사항
- 빌드가 통과하는지 먼저 확인 (`npm run build`)
- git status가 clean하지 않으면 먼저 커밋할 내용을 정리
- 릴리즈 노트는 최근 커밋 메시지들을 기반으로 자동 생성
