# 단계 진행 기록

번호 단계가 시작되면 Codex는 이 폴더에 `SNN-progress.md`를 만든다. 이 기록은 큰 단계를 여러 내부 checkpoint로 안전하게 이어 가기 위한 것이며 사용자에게 추가 단계 번호를 요구하지 않는다.

각 진행 파일은 다음 틀을 사용한다.

```markdown
# SNN 진행 기록

- 상태: active | candidate-complete | complete
- 기준 로컬 HEAD:
- 기준 원격 HEAD:
- 범위 밖:
- 보존 계약:

## Checkpoints

- [ ] C1 — 산출물 / 검증 / 변경 경로

## 증거

- 테스트:
- 구현 commit과 push:
- status commit과 push:
- 미해결 위험:
```

`complete` 표시는 같은 단계의 완료 status commit이 `origin/codex/redesign`에 존재할 때만 사용할 수 있다.
