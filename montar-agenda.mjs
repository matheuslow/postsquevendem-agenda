// Monta agenda.json + copia mídias a partir dos AGENDA-loteN.csv. node montar-agenda.mjs 1 2 3
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "../instagram-vendemaispostando";
const JA_NO_BUSINESS_SUITE = new Set(JSON.parse(readFileSync("ja-agendados.json", "utf8")));
const datas = Object.fromEntries(Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 5 + i)); return ["D" + String(i + 1).padStart(2, "0"), d.toISOString().slice(0, 10)]; }));
const agenda = existsSync("agenda.json") ? JSON.parse(readFileSync("agenda.json", "utf8")) : [];
const ids = new Set(agenda.map((p) => p.id));
for (const n of process.argv.slice(2)) {
  for (const l of readFileSync(`${BASE}/03-calendario-30-dias/AGENDA-lote${n}.csv`, "utf8").trim().split(/\r?\n/).slice(1)) {
    const [d, hora, etapa, tipo, pasta] = l.split(",");
    const id = `${d}-${hora.replace(":", "h")}`;
    if (ids.has(id) || JA_NO_BUSINESS_SUITE.has(id)) continue;
    const src = join(BASE, pasta), files = readdirSync(src);
    const reel = files.includes("reel.mp4");
    const arqs = reel ? ["reel.mp4"] : files.filter((f) => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const dest = `midia/${id}`; mkdirSync(dest, { recursive: true });
    for (const f of arqs) copyFileSync(join(src, f), join(dest, f));
    if (reel && files.includes("capa.jpg")) copyFileSync(join(src, "capa.jpg"), join(dest, "capa.jpg"));
    agenda.push({ id, quando: `${datas[d]}T${hora}:00-03:00`, etapa, tipo: reel ? "reel" : "carrossel", arquivos: arqs.map((f) => `${dest}/${f}`), ...(reel && files.includes("capa.jpg") ? { capa: `${dest}/capa.jpg` } : {}), legenda: readFileSync(join(src, "legenda.txt"), "utf8") });
  }
}
agenda.sort((a, b) => a.quando.localeCompare(b.quando));
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
console.log(agenda.length, "na agenda");
