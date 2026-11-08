// 08/11/2026: põe na agenda os 30 dias novos (09/11 a 08/12): 2 reels + 1 carrossel por dia e 3 stories de venda.
// Fonte: work/ig-30dias/pauta.json (roteiros), motion-edit-studio/out/ig/<id>/ (renders), out/ig-stories/ e stories-agenda.json.
// node montar-30dias.mjs [--seco]   (--seco só mostra o que faria)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "C:/Users/Mathe/motion-edit-studio/out";
const PAUTA = "C:/Users/Mathe/Documents/Codex/work/ig-30dias";
const seco = process.argv.includes("--seco");
const agenda = JSON.parse(readFileSync("agenda.json", "utf8"));
const ids = new Set(agenda.map((p) => p.id));
const pauta = JSON.parse(readFileSync(`${PAUTA}/pauta.json`, "utf8"));
const falta = [];
let n = 0;

for (const p of pauta) {
  const id = `N${p.id}`; // N = novembro novo, não colide com os ids antigos D01..D30 de outubro
  if (ids.has(id)) continue;
  const src = `${OUT}/ig/${p.id}`;
  const dest = `midia/${id}`;
  let arquivos, capa;
  if (p.tipo === "reel") {
    if (!existsSync(`${src}/reel.mp4`)) { falta.push(p.id); continue; }
    arquivos = [`${dest}/reel.mp4`]; capa = `${dest}/capa.jpg`;
    if (!seco) { mkdirSync(dest, { recursive: true }); copyFileSync(`${src}/reel.mp4`, arquivos[0]); copyFileSync(`${src}/capa.jpg`, capa); }
  } else {
    const fs_ = existsSync(src) ? readdirSync(src).filter((f) => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)) : [];
    if (fs_.length !== p.slides.length) { falta.push(p.id); continue; }
    arquivos = fs_.map((f) => `${dest}/${f}`);
    if (!seco) { mkdirSync(dest, { recursive: true }); fs_.forEach((f, i) => copyFileSync(`${src}/${f}`, arquivos[i])); }
  }
  agenda.push({ id, quando: `${p.data}T${p.hora}:00-03:00`, etapa: p.pilar, tipo: p.tipo, arquivos, ...(capa ? { capa } : {}), legenda: p.legenda, tema: p.tema, cta: p.cta, lote: "nov-30dias" });
  n++;
}

// stories: arquivo único por arte (midia/stories-nov/sNN.jpg), reaproveitado nos dias
const st = JSON.parse(readFileSync(`${PAUTA}/stories-agenda.json`, "utf8"));
for (const s of st) {
  const id = `N${s.dia}-${s.hora.replace(":", "h")}-story`;
  if (ids.has(id)) continue;
  const src = `${OUT}/ig-stories/${s.story}.jpg`;
  if (!existsSync(src)) { falta.push(s.story); continue; }
  const f = `midia/stories-nov/${s.story}.jpg`;
  if (!seco) { mkdirSync("midia/stories-nov", { recursive: true }); if (!existsSync(f)) copyFileSync(src, f); }
  agenda.push({ id, quando: `${s.data}T${s.hora}:00-03:00`, etapa: "story", tipo: "story", arquivos: [f], legenda: "(story de venda, sem legenda)", lote: "nov-30dias", arte: s.story });
  n++;
}

agenda.sort((a, b) => a.quando.localeCompare(b.quando));
if (!seco) writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
console.log(n, "itens novos na agenda", falta.length ? `· faltando render: ${[...new Set(falta)].join(" ")}` : "");
