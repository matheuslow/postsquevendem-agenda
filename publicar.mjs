// Robô de publicação do @vendemaispostando (Instagram + Página do Facebook) via Graph API.
// Roda no GitHub Actions a cada 15 min: publica o que está em agenda.json com horário vencido e marca como feito.
// Segredos: META_PAGE_TOKEN (token de página que não expira), IG_USER_ID, PAGE_ID.
import { readFileSync, writeFileSync } from "node:fs";

const G = "https://graph.facebook.com/v23.0";
const { META_PAGE_TOKEN: TOKEN, IG_USER_ID: IG, PAGE_ID: PAGE, GITHUB_REPOSITORY: REPO, DRY } = process.env;
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const MAX = Number(process.env.MAX_POR_RODADA || 3);
const agenda = JSON.parse(readFileSync("agenda.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params = {}, method = "POST") {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const url = method === "GET" ? `${G}/${path}?${body}` : `${G}/${path}`;
  const r = await fetch(url, method === "GET" ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  return j;
}
async function esperaContainer(id) {
  for (let i = 0; i < 60; i++) {
    const s = await api(id, { fields: "status_code,status" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR") throw new Error("container com erro: " + s.status);
    await sleep(10000);
  }
  throw new Error("container demorou demais");
}

async function publicaIG(p) {
  const url = (f) => RAW + encodeURI(f);
  let criacao;
  if (p.tipo === "reel") {
    criacao = (await api(`${IG}/media`, { media_type: "REELS", video_url: url(p.arquivos[0]), caption: p.legenda, share_to_feed: "true", ...(p.capa ? { cover_url: url(p.capa) } : {}) })).id;
  } else if (p.arquivos.length === 1) {
    criacao = (await api(`${IG}/media`, { image_url: url(p.arquivos[0]), caption: p.legenda })).id;
  } else {
    const filhos = [];
    for (const f of p.arquivos) filhos.push((await api(`${IG}/media`, { image_url: url(f), is_carousel_item: "true" })).id);
    for (const f of filhos) await esperaContainer(f);
    criacao = (await api(`${IG}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: p.legenda })).id;
  }
  await esperaContainer(criacao);
  return (await api(`${IG}/media_publish`, { creation_id: criacao })).id;
}

async function publicaFB(p) {
  const url = (f) => RAW + encodeURI(f);
  if (p.tipo === "reel") return (await api(`${PAGE}/videos`, { file_url: url(p.arquivos[0]), description: p.legenda })).id;
  const fotos = [];
  for (const f of p.arquivos) fotos.push((await api(`${PAGE}/photos`, { url: url(f), published: "false" })).id);
  const params = { message: p.legenda };
  fotos.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  return (await api(`${PAGE}/feed`, params)).id;
}

if (process.env.TESTE) {
  const me = await api(IG, { fields: "username,followers_count,media_count" }, "GET");
  const lim = await api(`${IG}/content_publishing_limit`, { fields: "quota_usage,config" }, "GET");
  console.log("TESTE OK", JSON.stringify(me), JSON.stringify(lim));
  process.exit(0);
}
const agora = Date.now();
const vencidos = agenda.filter((p) => new Date(p.quando).getTime() <= agora && (!p.ig || !p.fb)).slice(0, MAX);
console.log(`${vencidos.length} pra publicar agora`);
for (const p of vencidos) {
  if (DRY) { console.log("DRY", p.id, p.quando); continue; }
  try { if (!p.ig) { p.ig = await publicaIG(p); console.log("IG ok", p.id, p.ig); } } catch (e) { p.erro_ig = String(e.message); console.error("IG erro", p.id, e.message); }
  if (!PAGE) p.fb = "pular";
  try { if (!p.fb) { p.fb = await publicaFB(p); console.log("FB ok", p.id, p.fb); } } catch (e) { p.erro_fb = String(e.message); console.error("FB erro", p.id, e.message); }
}
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
