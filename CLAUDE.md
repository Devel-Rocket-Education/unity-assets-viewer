# Unity 에셋 검색 허브 — 에이전트 작업 지침

> 이 파일은 **`AGENTS.md`와 완전히 동일한 내용**이다. 한쪽을 고치면 다른 쪽도 반드시 같이 갱신한다.
> (`CLAUDE.md` = Claude Code, `AGENTS.md` = Codex·Antigravity 등 `agents.md` 규약을 읽는 에이전트. 파이프라인은 순수 Node.js라 특정 도구에 종속되지 않는다.)

## 이 레포의 목적

학원에서 지원하는 **유니티 에셋 검색 허브**다.
너(에이전트)의 임무는 **사용자가 원하는 조건을 말하면 데이터에서 맞는 에셋을 찾아 추천**하는 것이다.

예)
- "2D 픽셀아트 던전 타일셋 있어?"
- "URP 지원되는 로우폴리 판타지 캐릭터 찾아줘"
- "루프 가능한 배경음악 에셋 추천해줘"
- "Unity 2021에서 쓸 수 있는 무료 이펙트 팩"

---

## 데이터 구조 (중요)

| 파일 | 역할 | 수정 |
|---|---|---|
| `unity-assets-data.js` | **원본 데이터**(유일한 진실 소스). 뷰어(index.html)와 공용. `ASSETS` 배열 + `CATEGORY_MAP` | 데이터 추가/수정은 여기서만 |
| `search-index.jsonl` | **검색용 파생 인덱스**. 에셋 1건 = JSON 1줄. `images` 제외로 경량화 | ❌ 직접 수정 금지(파생물) |
| `search-index.meta.json` | 버전·카테고리 맵·총개수·검증 결과 | ❌ 직접 수정 금지(파생물) |
| `tools/search.js` | **검색 CLI**. 인덱스에서 조건에 맞는 에셋을 찾아 정제 출력 | 검색 로직 개선 시 |
| `tools/build-search-index.js` | 원본 → 인덱스 재생성 스크립트 | 형식 바뀔 때만 |
| `index.html` | 사람이 보는 웹 뷰어 | 검색 작업에서는 건드리지 않음 |

### 버전 확인
원본과 파생물은 **파일 최상단에서 버전/갱신일을 즉시 확인**할 수 있다.
- 원본 `unity-assets-data.js`: 상단 주석의 `Version` / `Updated` / `Assets`
- `search-index.jsonl`: 첫 줄 `//` 주석에 `source v… (갱신일) · N assets`
- `search-index.meta.json`: `sourceVersion` / `sourceUpdated` / `generatedAt`

파생물이 원본보다 오래됐는지 의심되면 **파생물의 `sourceUpdated`와 원본의 `Updated`를 비교**하고, 다르면 재생성한다(아래 "데이터 동기화").

### 인덱스(`search-index.jsonl`) 한 줄의 필드
```json
{"id":0,"name":"…","main":"2D","sub":"주변환경","publisher":"…",
 "unity":"2020.1.3","pkg":"1.0","rp":["URP"],"size":"6.9 MB",
 "updated":"2020-09-30","tags":["pixel art","mine",…],
 "desc":"…한두 줄 설명…","features":["구성1","구성2",…],
 "link":"https://assetstore.unity.com/…"}
```
- `id`: 원본 `ASSETS` 배열 인덱스(원본 역참조용)
- `rp`: 지원 렌더 파이프라인. **빈 배열 `[]`이면 미표기**(대개 구버전 Built-in) — "지원 안 함"이 아니라 "정보 없음"으로 다뤄라
- `link`가 `"#"`이면 스토어 링크 없음

### 카테고리 맵
```
2D      → GUI, 글꼴, 주변환경, 캐릭터, 텍스처 및 소재
3D      → GUI, 소품, 식물, 애니메이션, 운송도구, 주변환경, 캐릭터
시각 효과 → 셰이더, 파티클
음향     → 음악, 환경소리, 효과음
```

---

## 검색 워크플로 (이 순서를 따른다)

### 1) 요청에서 조건 추출
사용자 문장을 다음 축으로 분해한다:
- **대분류**: 2D / 3D / 시각 효과 / 음향
- **테마·스타일**: 픽셀아트, 로우폴리, 판타지, 사이버펑크, 던전, 농장 …
- **에셋 타입**: 캐릭터, 타일셋, BGM, 파티클, 셰이더 …
- **기술 조건**: 렌더 파이프라인(Built-in/URP/HDRP), Unity 버전, 용량

### 2) 검색 CLI로 찾는다 (기본 경로)
**터미널(셸)에서 `tools/search.js`를 실행**한다. 인덱스를 직접 grep하지 마라(라인이 길어 검색 도구가 내용을 생략할 수 있다).

```bash
node tools/search.js [옵션] "조건1" "조건2" ...
```
- **각 위치인자 = 하나의 조건 그룹**이고, 그룹끼리는 **AND**로 묶인다.
- **그룹 안 동의어는 `|` 로 OR** 묶는다. 셸 파이프로 해석되지 않게 **반드시 따옴표**로 감싼다.
- **한글·영어를 한 그룹에 함께** 넣어라. `tags`는 대부분 영어(`pixel art`), `desc`/`features`/`name`엔 한글이 섞인다.
  - 스타일: `"pixel|픽셀"`, `"low.?poly|로우폴리|lowpoly"`, `"toon|툰|카툰|cartoon"`, `"cyberpunk|사이버펑크"`
  - 타입: `"character|캐릭터"`, `"tileset|타일셋|tilemap"`, `"music|음악|배경음|bgm"`, `"particle|파티클|vfx|이펙트"`
- 필터 옵션: `--main <2D|3D|시각 효과|음향>`, `--rp <Built-in|URP|HDRP>`, `--unity <2021 등 부분일치>`, `--limit <N>`
- 결과가 0개면 `--any`(그룹 간 OR)로 넓히거나 동의어를 추가한다.
- 결과를 프로그램적으로 다뤄야 하면 `--json`을 붙인다.

예)
```bash
node tools/search.js "pixel|픽셀" "dungeon|던전|광산|cave" --main 2D
node tools/search.js "low.?poly|로우폴리" "character|캐릭터" --rp URP --limit 5
node tools/search.js "music|음악|배경음|bgm|loop" --main 음향
```

> 출력의 `★N`은 매칭 점수(높을수록 조건에 잘 맞음). name/태그 매칭은 2점, 설명/features 매칭은 1점.
> 특수 조건(정확한 제작사명 등)으로 좁혀야 할 때만 보조로 grep을 써도 되지만, 기본은 이 CLI다.

### 3) 결과 정리·추천
매칭 결과를 **표**로 제시한다:

| 에셋 이름 | 분류 | 렌더 | Unity | 제작사 | 링크 |
|---|---|---|---|---|---|
| Pixel Mine Pack | 2D / 주변환경 | – | 2020.1.3 | Killer Rabbit Media | [스토어](링크) |

- 상위 후보 **3~7개** 정도로 추린다(너무 많으면 대표만).
- 각 후보에 **왜 이 요청에 맞는지 한 줄 이유**를 붙인다.
- 요청과 **가장 잘 맞는 1~2개를 먼저 추천**하고 이유를 설명한다.
- 링크가 `"#"`이면 "스토어 링크 없음"이라고 명시한다.

### 4) 결과가 없거나 애매할 때
- 검색어를 바꿔 재시도(동의어·영문/한글 전환).
- 완전히 없으면 **가장 가까운 대체 후보**를 제시하고, 어떤 조건이 안 맞는지 알려준다.
- 조건이 모호하면 추측해서 넓게 찾은 뒤, 필요한 경우에만 한 가지 되물어라(먼저 검색부터 해라).

---

## 데이터 동기화 (중요)

원본 `unity-assets-data.js`를 수정하면 파생물은 **자동으로 갱신되지 않는다**. 반드시 재생성한다:
```bash
node tools/build-search-index.js
```
- 이 명령이 `search-index.jsonl` / `search-index.meta.json`을 다시 만든다.
- 원본을 수정할 때 **상단 헤더의 `Version` / `Updated` / `Assets`도 함께 갱신**한다. (재생성 시 개수가 안 맞으면 스크립트가 경고한다)
- `search-index.jsonl` / `search-index.meta.json` / `index.html`은 **직접 손대지 않는다**. 데이터 변경은 원본에서 하고 재빌드한다.
- 이 레포에서 신규 에셋 수집·뷰어 UI 개선은 기본 범위가 아니다. 사용자가 명시적으로 요청할 때만 한다.

---

## 하지 말 것
- ❌ `search-index.jsonl` 직접 편집(원본에서 고치고 재빌드)
- ❌ 원본이나 인덱스를 통째로 열어 읽기 (검색은 `tools/search.js`로 한다)
- ❌ 존재하지 않는 에셋을 지어내기 — **검색 결과에 있는 것만** 추천한다
- ❌ 링크를 임의로 만들거나 바꾸기 — 결과에 나온 `link`를 그대로 쓴다
- ❌ 상위 폴더의 다른 프로젝트 지침(CatAcademy 등)을 이 레포에 적용
