# Unity Assets Viewer

학원에서 지원하는 **유니티 에셋 검색 허브**. 두 가지 방식으로 쓴다.

1. **사람** — `index.html`을 브라우저로 열어 검색·필터·미리보기
2. **에이전트** — 자연어로 조건을 말하면 에이전트가 데이터에서 맞는 에셋을 찾아 추천
   (Claude Code는 `CLAUDE.md`, Codex·Antigravity 등은 `AGENTS.md`를 읽는다)

---

## 파일 구조

| 파일 | 역할 | |
|---|---|---|
| `unity-assets-data.js` | **원본 데이터**(유일한 진실 소스). `ASSETS` + `CATEGORY_MAP` | ✅ 여기서만 수정 |
| `index.html` | 사람용 웹 뷰어(원본을 직접 로드) | |
| `search-index.jsonl` | 에이전트 검색용 파생 인덱스(에셋 1건=1줄, `images` 제외) | ⚠️ 파생물 |
| `search-index.meta.json` | 버전·카테고리·개수·검증 결과 | ⚠️ 파생물 |
| `tools/build-search-index.js` | 원본 → 인덱스 재생성 스크립트 | |
| `tools/search.js` | 검색 CLI | |
| `CLAUDE.md` / `AGENTS.md` | 에이전트 작업 지침(동일 내용) | |

> **원본과 파생물은 파일 최상단에서 버전/갱신일을 바로 확인**할 수 있다.
> 원본은 상단 주석의 `Version` / `Updated` / `Assets`, 파생물은 첫 줄 주석과 `meta.json`의 `sourceVersion` / `sourceUpdated`.

---

## 요구사항

- [Node.js](https://nodejs.org) (검색 CLI·인덱스 재생성용). 뷰어(`index.html`)만 볼 거면 필요 없다.

## 검색 (CLI)

```bash
# "2D 픽셀 던전" 조건으로 검색
node tools/search.js "pixel|픽셀" "dungeon|던전|광산|cave" --main 2D

# URP 로우폴리 캐릭터 상위 5개
node tools/search.js "low.?poly|로우폴리" "character|캐릭터" --rp URP --limit 5
```

- 위치인자 = 조건 그룹(그룹끼리 **AND**), 그룹 안 동의어는 `|`로 **OR**(따옴표 필수).
- 옵션: `--main`, `--rp`, `--unity`, `--limit`, `--any`(OR), `--json`.
- 도움말: `node tools/search.js --help`

---

## 데이터 추가·수정 시 (중요)

**원본이 바뀌면 파생 인덱스는 자동으로 갱신되지 않는다.** 다음 순서를 지킨다.

1. `unity-assets-data.js`의 `ASSETS`를 수정한다. (형식은 파일 상단 주석 참고)
2. 원본 상단 헤더의 `Updated` / `Assets`(그리고 필요 시 `Version`)를 갱신한다.
3. 인덱스를 재생성한다:
   ```bash
   node tools/build-search-index.js
   ```
   - `search-index.jsonl` / `search-index.meta.json`을 다시 만든다.
   - 대/소분류가 `CATEGORY_MAP`에 없으면 **검증 경고**를 출력한다. 헤더 `Assets` 수가 실제와 다르면 알려준다.

`search-index.*`와 `index.html`은 직접 수정하지 않는다. 데이터 변경은 **원본에서만** 하고 재빌드한다.
