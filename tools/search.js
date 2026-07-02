// 에셋 검색 CLI
// search-index.jsonl(파생 인덱스)에서 조건에 맞는 에셋을 찾아 정제된 결과를 출력한다.
// 에이전트는 이 스크립트를 실행해 짧고 구조화된 결과를 받는다(긴 JSON 라인을 직접 grep하지 않는다).
//
// 사용법:
//   node tools/search.js [옵션] "조건1" "조건2" ...
//     · 각 위치인자 = 하나의 "조건 그룹"(기본 그룹 간 AND)
//     · 그룹 안 동의어는 | 로 묶는다(그룹 내 OR)   ※ 셸에서 반드시 따옴표로 감쌀 것
//   예) node tools/search.js "pixel|픽셀" "dungeon|던전|광산|cave" --main 2D
//
// 옵션:
//   --main <대분류>   2D | 3D | 시각 효과 | 음향
//   --rp <파이프라인>  Built-in | URP | HDRP (대소문자 무시, 지원 목록에 포함되면 매칭)
//   --unity <버전>    유니티 버전 부분일치 (예: 2021)
//   --any             그룹 간 OR (넓게 검색)
//   --limit <N>       최대 출력 개수 (기본 15)
//   --json            JSON 배열로 출력 (에이전트 파싱용)

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const idxFile = path.join(root, "search-index.jsonl");

function printHelp() {
  console.log(`사용법: node tools/search.js [옵션] "조건1" "조건2" ...
  각 조건은 하나의 그룹(기본 그룹 간 AND). 그룹 안 동의어는 | 로 묶는다(OR).
  예: node tools/search.js "pixel|픽셀" "dungeon|던전|광산|cave" --main 2D

옵션:
  --main <대분류>    2D | 3D | 시각 효과 | 음향
  --rp <파이프라인>   Built-in | URP | HDRP (대소문자 무시)
  --unity <버전>     유니티 버전 부분일치 (예: 2021)
  --any              그룹 간 OR (넓게 검색)
  --limit <N>        최대 출력 개수 (기본 15)
  --json             JSON 배열로 출력 (에이전트 파싱용)`);
}

if (!fs.existsSync(idxFile)) {
  console.error("search-index.jsonl 이 없습니다. 먼저 실행: node tools/build-search-index.js");
  process.exit(1);
}

const rows = fs
  .readFileSync(idxFile, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("//")) // 빈 줄과 헤더 주석(//) 제외
  .map((l) => JSON.parse(l));

// ── 인자 파싱 ─────────────────────────────────────────────
const argv = process.argv.slice(2);
let mainF = null, rpF = null, unityF = null, limit = 15, mode = "and", asJson = false;
const groups = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--main") mainF = argv[++i];
  else if (a === "--rp") rpF = argv[++i];
  else if (a === "--unity") unityF = argv[++i];
  else if (a === "--limit") limit = parseInt(argv[++i], 10) || 15;
  else if (a === "--any") mode = "or";
  else if (a === "--json") asJson = true;
  else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
  else groups.push(a);
}

if (!groups.length && !mainF && !rpF && !unityF) { printHelp(); process.exit(0); }

// ── 조건 그룹 → 정규식 ────────────────────────────────────
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function toRe(group) {
  const parts = group.split("|").map((s) => s.trim()).filter(Boolean).map(esc);
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
}
const groupRes = groups.map((g) => ({ raw: g, re: toRe(g) })).filter((x) => x.re);

// name/tags = 강한 신호(가중 2), desc/features/publisher/sub = 약한 신호(가중 1)
const SEP = "  ";
function strongText(r) { return [r.name, ...(r.tags || [])].join(SEP); }
function weakText(r) { return [r.desc, ...(r.features || []), r.publisher, r.sub].join(SEP); }

// ── 매칭 & 점수 ───────────────────────────────────────────
const results = [];
for (const r of rows) {
  if (mainF && r.main !== mainF) continue;
  if (rpF && !(r.rp || []).some((x) => x.toLowerCase() === rpF.toLowerCase())) continue;
  if (unityF && !String(r.unity || "").includes(unityF)) continue;

  const st = strongText(r), wt = weakText(r);
  let score = 0, hitGroups = 0;
  const matched = [];
  for (const g of groupRes) {
    if (g.re.test(st)) { score += 2; hitGroups++; matched.push(`${g.raw}→이름/태그`); }
    else if (g.re.test(wt)) { score += 1; hitGroups++; matched.push(`${g.raw}→설명`); }
  }
  const ok = groupRes.length === 0
    ? true
    : mode === "and" ? hitGroups === groupRes.length : hitGroups > 0;
  if (!ok) continue;
  results.push({ r, score, matched });
}

results.sort(
  (a, b) => b.score - a.score || String(b.r.updated || "").localeCompare(String(a.r.updated || ""))
);
const shown = results.slice(0, limit);

// ── 출력 ──────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify(
    shown.map((x) => ({
      name: x.r.name, main: x.r.main, sub: x.r.sub, rp: x.r.rp,
      unity: x.r.unity, size: x.r.size, publisher: x.r.publisher,
      link: x.r.link, desc: x.r.desc, score: x.score, matched: x.matched,
    })),
    null, 2
  ));
} else {
  const cond = groupRes.map((g) => `[${g.raw}]`).join(mode === "and" ? " AND " : " OR ") || "(조건 없음)";
  const filt = [mainF && `main=${mainF}`, rpF && `rp=${rpF}`, unityF && `unity~${unityF}`].filter(Boolean).join(" ");
  console.log(`조건: ${cond}${filt ? "  필터: " + filt : ""}`);
  console.log(`매칭 ${results.length}개` + (results.length > shown.length ? ` (상위 ${shown.length} 표시)` : "") + "\n");
  shown.forEach((x, i) => {
    const rp = x.r.rp && x.r.rp.length ? x.r.rp.join("/") : "(미표기)";
    const desc = (x.r.desc || "").length > 110 ? x.r.desc.slice(0, 110) + "…" : x.r.desc || "";
    const link = x.r.link && x.r.link !== "#" ? x.r.link : "(스토어 링크 없음)";
    console.log(`[${i + 1}] ${x.r.name}   ★${x.score}`);
    console.log(`    ${x.r.main} / ${x.r.sub} · RP:${rp} · Unity ${x.r.unity} · ${x.r.publisher} · ${x.r.size}`);
    console.log(`    링크: ${link}`);
    console.log(`    설명: ${desc}`);
    console.log(`    매칭: ${x.matched.join(", ")}`);
    console.log("");
  });
  if (!shown.length) console.log("(매칭 없음) 검색어를 바꾸거나 --any 로 넓혀보세요.");
}
