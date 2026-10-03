// Monta agenda.json + copia mídias a partir dos AGENDA-loteN.csv. node montar-agenda.mjs 1 2 3
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "../instagram-vendemaispostando";
const JA_NO_BUSINESS_SUITE = new Set(JSON.parse(readFileSync("ja-agendados.json", "utf8")));
const datas = Object.fromEntries([["D00", "2026-10-04"], ...Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 5 + i)); return ["D" + String(i + 1).padStart(2, "0"), d.toISOString().slice(0, 10)]; })]);
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
// stories: 10h automático (ideia do dia); 15h e 17h manuais (figurinha), com o roteiro
for (const n of process.argv.slice(2)) {
  const dias = [...new Set(readFileSync(`${BASE}/03-calendario-30-dias/AGENDA-lote${n}.csv`, "utf8").trim().split(String.fromCharCode(10)).slice(1).map((l) => l.trim().split(",")[4].split("/").slice(0, 2).join("/")))];
  for (const pasta of dias) {
    const d = pasta.split("/")[1].slice(0, 3), sp = join(BASE, pasta, "stories");
    if (!existsSync(sp)) continue;
    const fs_ = readdirSync(sp).filter((f) => f.endsWith(".jpg")).sort();
    const como = existsSync(join(sp, "COMO-POSTAR.txt")) ? readFileSync(join(sp, "COMO-POSTAR.txt"), "utf8") : "";
    const utm = `https://pertinho.club/pizza?utm_source=instagram&utm_medium=organico&utm_campaign=stories&utm_content=${d.toLowerCase()}`;
    [["10:00", "story", fs_.find((f) => f.startsWith("1-"))], ["15:00", "manual", fs_.find((f) => f.startsWith("2-"))], ["17:00", "manual", fs_.find((f) => f.startsWith("3-"))]].forEach(([hora, tipo, f]) => {
      if (!f) return;
      const id = `${d}-${hora.replace(":", "h")}-story`;
      if (ids.has(id) || agenda.some((p) => p.id === id)) return;
      const dest = `midia/${id}`; mkdirSync(dest, { recursive: true }); copyFileSync(join(sp, f), join(dest, f));
      agenda.push({ id, quando: `${datas[d]}T${hora}:00-03:00`, etapa: "story", tipo, arquivos: [`${dest}/${f}`], legenda: tipo === "manual" ? `${como}
Link da figurinha: ${utm}` : "(story da ideia do dia, sem legenda)" });
    });
  }
}
agenda.sort((a, b) => a.quando.localeCompare(b.quando));
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
console.log(agenda.length, "na agenda");
