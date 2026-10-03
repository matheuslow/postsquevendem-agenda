// Recopia as mídias re-renderizadas dos lotes pedidos, só dos posts que ainda não saíram. node recopiar.mjs 2 3
import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const BASE = "../instagram-vendemaispostando";
const agenda = JSON.parse(readFileSync("agenda.json", "utf8"));
let n = 0;
for (const lote of process.argv.slice(2)) {
  for (const l of readFileSync(`${BASE}/03-calendario-30-dias/AGENDA-lote${lote}.csv`, "utf8").trim().split(/\r?\n/).slice(1)) {
    const [d, hora, , , pasta] = l.trim().split(",");
    const p = agenda.find((x) => x.id === `${d}-${hora.replace(":", "h")}`);
    if (!p || p.via === "business_suite" || (p.ig && p.ig !== "pular")) continue;
    for (const a of [...p.arquivos, ...(p.capa ? [p.capa] : [])]) {
      const src = join(BASE, pasta, a.split("/").pop());
      if (existsSync(src)) { copyFileSync(src, a); n++; }
    }
  }
}
console.log(n, "arquivos recopiados");
