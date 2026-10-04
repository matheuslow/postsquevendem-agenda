// Reels extras (04/10): o carrossel de dica das 07:00 vira reel às 13:00 e o de topo das 16:00 vira reel às 21:30.
// Reel é o formato que chega em quem não segue. node reels-extra.mjs D01 D30  (intervalo de dias)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const BASE = "../instagram-vendemaispostando";
const [ini, fim] = process.argv.slice(2);
const agenda = JSON.parse(readFileSync("agenda.json", "utf8"));
const datas = Object.fromEntries(Array.from({ length: 31 }, (_, i) => ["D" + String(i).padStart(2, "0"), new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10)]));
const linhas = readdirSync(`${BASE}/03-calendario-30-dias`).filter((f) => /^AGENDA-lote\d+\.csv$/.test(f))
  .flatMap((f) => readFileSync(`${BASE}/03-calendario-30-dias/${f}`, "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.trim().split(",")));
const SEG = 2.8; // segundos por slide
let n = 0;
for (const [d, hora, , tipo, pasta] of linhas) {
  if (tipo !== "carrossel" || !["07:00", "16:00"].includes(hora) || d < ini || d > fim) continue;
  const novaHora = hora === "07:00" ? "13:00" : "21:30";
  const id = `${d}-${novaHora.replace(":", "h")}-reel`;
  if (agenda.some((p) => p.id === id) || new Date(`${datas[d]}T${novaHora}:00-03:00`) < new Date()) continue;
  const src = join(BASE, pasta);
  const slides = readdirSync(src).filter((f) => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  const dest = `midia/${id}`; mkdirSync(dest, { recursive: true });
  // cada slide 1080x1350 no centro de um 1080x1920 com o próprio slide desfocado no fundo, leve zoom, sem música
  const ins = slides.flatMap((f) => ["-loop", "1", "-framerate", "30", "-t", String(SEG), "-i", join(src, f)]);
  const fc = slides.map((_, i) => `[${i}:v]scale=1080:1350,setsar=1,split[a${i}][b${i}];[a${i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18[bg${i}];[bg${i}][b${i}]overlay=0:285,fps=30,trim=duration=${SEG},setpts=PTS-STARTPTS[v${i}]`).join(";")
    + ";" + slides.map((_, i) => `[v${i}]`).join("") + `concat=n=${slides.length}:v=1:a=0,format=yuv420p[v]`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...ins, "-f", "lavfi", "-t", String(SEG * slides.length), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", fc, "-map", "[v]", "-map", `${slides.length}:a`, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-shortest", "-movflags", "+faststart", join(dest, "reel.mp4")]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(dest, "reel.mp4"), "-frames:v", "1", "-q:v", "3", join(dest, "capa.jpg")]);
  const legenda = readFileSync(join(src, "legenda.txt"), "utf8");
  agenda.push({ id, quando: `${datas[d]}T${novaHora}:00-03:00`, etapa: "topo", tipo: "reel", arquivos: [`${dest}/reel.mp4`], capa: `${dest}/capa.jpg`, legenda, origem: pasta });
  n++; console.log(id, slides.length, "slides");
}
agenda.sort((a, b) => a.quando.localeCompare(b.quando));
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
console.log(n, "reels extras");
