# M0: 프로젝트 스캐폴딩

## 목표
`npm install && npm run build`가 성공하고, `npm start`가 빈 진입점을 실행한다.

## 선행 의존
없음

## 작업 목록

| 파일 | 작업 |
|------|------|
| `package.json` | name, scripts(build, start, dev, typecheck, test), dependencies(`@anthropic-ai/sdk`), devDependencies(`typescript`, `ts-node`, `@types/node`, `vitest`) |
| `tsconfig.json` | strict mode, outDir: `dist`, rootDir: `src`, target: ES2022, module: Node16 |
| `src/index.ts` | 최소 진입점 스텁 (main 함수 선언 + 호출) |
| `.gitignore` | `output/` 추가 |

## 검증 기준
- `npm install` 성공
- `npm run build` 성공 (dist/ 생성)
- `npm start` 정상 종료
- `npm run typecheck` 에러 0
