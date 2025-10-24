# Revival Guild

## 프로젝트 개요
- 다키스트 던전형 경영 로그라이크: 플레이어는 길드를 운영하고, 파티는 자동으로 던전을 탐험합니다.

## 빠른 시작
- GitHub Pages: [https://rep87.github.io/Revival-Guild/](https://rep87.github.io/Revival-Guild/)
- 로컬 미리보기: 저장소를 클론한 뒤 `index.html`을 브라우저로 열거나 간단한 정적 서버(`npx serve` 등)를 실행하세요.

## 조작법
- 용병 모집: 상단의 **용병 모집** 버튼을 눌러 후보를 확인하고 고용합니다.
- 퀘스트 수락: 던전 퀘스트 패널에서 원하는 퀘스트의 **수행하기**를 눌러 용병을 배치합니다.
- 턴 진행: **턴 진행** 버튼으로 시간 경과와 신규 퀘스트 생성을 처리합니다.
- 삭제: 완료되었거나 필요 없는 퀘스트는 카드 우측의 삭제 버튼으로 정리합니다.

## 저장 및 초기화
- 모든 진행 상황은 `localStorage`의 `rg_v1_save` 키에 저장됩니다.
- 상단 메뉴의 **새로 시작** 버튼으로 저장 데이터를 초기화하고 새 게임을 시작할 수 있습니다.
- 하드 리로드로도 초기화 가능합니다.
  - Windows/Linux: <kbd>Ctrl</kbd>+<kbd>F5</kbd> 또는 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>
  - macOS: <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>

## 아트 에셋 가이드
- 모든 이미지는 `assets/` 하위 경로 규칙을 따릅니다. 예) 배경 `assets/bg/`, 용병 초상 `assets/mercs/{id}.jpg`, 던전 썸네일 `assets/monsters/`.
- 해당 경로에 파일이 없으면 UI에서 플레이스홀더 이미지와 안내 문구가 표시됩니다.

## 로드맵 요약
- Phase-2.1 이후 예정: 라이벌 밸런싱 조정, 던전 미니 리포트 및 탐험 애니메이션 추가.
