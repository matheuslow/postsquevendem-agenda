// Monta agenda.json + copia mídias a partir dos AGENDA-loteN.csv. node montar-agenda.mjs 1 2 3
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "../instagram-vendemaispostando";
const JA_NO_BUSINESS_SUITE = new Set(JSON.parse(readFileSync("ja-agendados.json", "utf8")));
const datas = Object.fromEntries([["DH", "2026-10-03"], ["D00", "2026-10-04"], ...Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 5 + i)); return ["D" + String(i + 1).padStart(2, "0"), d.toISOString().slice(0, 10)]; })]);
const agenda = existsSync("agenda.json") ? JSON.parse(readFileSync("agenda.json", "utf8")) : [];
const ids = new Set(agenda.map((p) => p.id));
for (const n of process.argv.slice(2).filter((a) => a !== "stories")) {
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
// stories de venda (03/10): 5 por dia, todos automáticos (a API não põe figurinha, então CTA = link na bio).
// node montar-agenda.mjs stories  → lê 03-calendario-30-dias/AGENDA-stories.csv (dia,hora,arquivo)
if (process.argv.includes("stories")) {
  for (const l of readFileSync(`${BASE}/03-calendario-30-dias/AGENDA-stories.csv`, "utf8").trim().split(String.fromCharCode(10)).slice(1)) {
    const [d, hora, arq] = l.trim().split(",");
    const id = `${d}-${hora.replace(":", "h")}-story`;
    if (agenda.some((p) => p.id === id)) continue;
    const f = arq.split("/").pop(), dest = `midia/${id}`; mkdirSync(dest, { recursive: true }); copyFileSync(join(BASE, arq), join(dest, f));
    agenda.push({ id, quando: `${datas[d]}T${hora}:00-03:00`, etapa: "story", tipo: "story", arquivos: [`${dest}/${f}`], legenda: "(story de venda, sem legenda)" });
  }
}
agenda.sort((a, b) => a.quando.localeCompare(b.quando));
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
console.log(agenda.length, "na agenda");
