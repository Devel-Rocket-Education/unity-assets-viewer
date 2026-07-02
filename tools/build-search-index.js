// 검색용 인덱스 생성 파이프라인
// unity-assets-data.js(뷰어 겸용 원본 데이터)를 읽어 에이전트 검색에 최적화된
// 경량 JSONL 인덱스(search-index.jsonl)를 파생 생성한다.
//
// 실행:  node tools/build-search-index.js
//
// 원칙:
//   - 원본(unity-assets-data.js)이 유일한 진실 소스(Single Source of Truth)다.
//   - 이 스크립트가 만드는 search-index.jsonl은 파생물이므로 직접 수정하지 않는다.
//   - 원본 데이터가 바뀌면 이 스크립트를 다시 실행해 인덱스를 재생성한다.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "unity-assets-data.js");
const outFile = path.join(root, "search-index.jsonl");
const metaFile = path.join(root, "search-index.meta.json");

// ── 원본 로드 ─────────────────────────────────────────────
// unity-assets-data.js는 브라우저용 전역 선언(const CATEGORY_MAP, const ASSETS)이라
// require로 불러올 수 없다. vm 샌드박스에서 실행한 뒤 값을 캡처한다.
const code = fs.readFileSync(dataFile, "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  code + "\n;globalThis.__CATEGORY_MAP = CATEGORY_MAP; globalThis.__ASSETS = ASSETS;",
  sandbox,
  { filename: "unity-assets-data.js" }
);

const CATEGORY_MAP = sandbox.__CATEGORY_MAP;
const ASSETS = sandbox.__ASSETS;

if (!Array.isArray(ASSETS)) {
  throw new Error("ASSETS 배열을 찾지 못했습니다. unity-assets-data.js 형식을 확인하세요.");
}

// ── 원본 헤더에서 버전/갱신일 파싱 → 파생물에 전파 ─────────
const srcVersion = (code.match(/Version\s*:\s*([^\n\r]+)/) || [])[1]?.trim() || "unknown";
const srcUpdated = (code.match(/Updated\s*:\s*([^\n\r]+)/) || [])[1]?.trim() || "unknown";
const headerAssets = (code.match(/Assets\s*:\s*(\d+)/) || [])[1];

// ── 검증(가벼운 무결성 체크) ──────────────────────────────
const issues = [];
ASSETS.forEach((a, i) => {
  if (!a.name) issues.push(`#${i}: name 누락`);
  const subs = CATEGORY_MAP[a.mainCategory];
  if (!subs) {
    issues.push(`#${i} (${a.name}): 알 수 없는 대분류 "${a.mainCategory}"`);
  } else if (a.subCategory && !subs.includes(a.subCategory)) {
    issues.push(`#${i} (${a.name}): 대분류 "${a.mainCategory}"에 없는 소분류 "${a.subCategory}"`);
  }
});

// ── 인덱스 생성 (images 제외 → 경량화) ────────────────────
// 검색은 name/desc/tags/features/publisher 등 텍스트 필드로 이뤄지므로
// 용량 대부분을 차지하는 이미지 URL 배열은 인덱스에서 제외한다.
const lines = ASSETS.map((a, i) =>
  JSON.stringify({
    id: i,                       // ASSETS 배열의 인덱스(원본 역참조용)
    name: a.name,
    main: a.mainCategory,
    sub: a.subCategory,
    publisher: a.publisher,
    unity: a.unityVersion,
    pkg: a.packageVersion,
    rp: a.renderPipeline,        // 지원 렌더 파이프라인(빈 배열이면 미표기 에셋)
    size: a.size,
    updated: a.updatedAt,
    tags: a.tags,
    desc: a.desc,
    features: a.features,
    link: a.link,
  })
);

// 파생물 첫 줄에 버전 헤더 주석을 넣는다(직접 수정 금지 안내 + 원본 버전).
// search.js 는 "//" 로 시작하는 줄을 건너뛰므로 파싱에 영향 없다.
const jsonlHeader =
  `// search-index.jsonl — 파생물(직접 수정 금지) · source v${srcVersion} (${srcUpdated})` +
  ` · ${ASSETS.length} assets · 재생성: node tools/build-search-index.js`;
fs.writeFileSync(outFile, jsonlHeader + "\n" + lines.join("\n") + "\n", "utf8");

// ── 메타 정보 ─────────────────────────────────────────────
const meta = {
  _comment: "파생물(직접 수정 금지). 원본 unity-assets-data.js 에서 tools/build-search-index.js 로 재생성.",
  sourceVersion: srcVersion,
  sourceUpdated: srcUpdated,
  generatedAt: new Date().toISOString(),
  totalAssets: ASSETS.length,
  categoryMap: CATEGORY_MAP,
  countsByMain: Object.keys(CATEGORY_MAP).reduce((acc, m) => {
    acc[m] = ASSETS.filter((a) => a.mainCategory === m).length;
    return acc;
  }, {}),
  validationIssues: issues,
};
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n", "utf8");

// ── 결과 리포트 ───────────────────────────────────────────
const srcKB = (fs.statSync(dataFile).size / 1024).toFixed(0);
const outKB = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`원본 unity-assets-data.js : ${srcKB} KB (v${srcVersion}, updated ${srcUpdated})`);
console.log(`인덱스 search-index.jsonl : ${outKB} KB (${ASSETS.length}개 에셋, 1줄=1에셋)`);
console.log(`메타 search-index.meta.json 생성 완료`);
if (headerAssets && Number(headerAssets) !== ASSETS.length) {
  console.log(`⚠ 원본 헤더 Assets(${headerAssets}) ≠ 실제 개수(${ASSETS.length}). 원본 상단 헤더의 Assets/Updated를 갱신하세요.`);
}
if (issues.length) {
  console.log(`\n⚠ 검증 경고 ${issues.length}건:`);
  issues.slice(0, 20).forEach((s) => console.log("  - " + s));
  if (issues.length > 20) console.log(`  ...외 ${issues.length - 20}건`);
} else {
  console.log("검증: 이상 없음");
}
