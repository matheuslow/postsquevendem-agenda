// Robô de publicação do @vendemaispostando (Instagram + Página do Facebook) via Graph API.
// Roda no GitHub Actions a cada 15 min: publica o que está em agenda.json com horário vencido e marca como feito.
// Segredos: META_PAGE_TOKEN (token de página que não expira), IG_USER_ID, PAGE_ID.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const G = "https://graph.facebook.com/v23.0";
const { META_PAGE_TOKEN: TOKEN, IG_USER_ID: IG, PAGE_ID: PAGE, GITHUB_REPOSITORY: REPO, DRY } = process.env;
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const MAX = Number(process.env.MAX_POR_RODADA || 3);
const agenda = JSON.parse(readFileSync("agenda.json", "utf8"));
// Estado salvo no repo na hora (antes e depois de cada publicação), mesclando só o que ESTA rodada mudou por cima
// da versão mais nova do remoto. Assim uma rodada que falha no push nunca faz outra republicar o mesmo post.
const original = new Map(agenda.map((p) => [p.id, JSON.stringify(p)]));
function salvar(msg) {
  if (process.env.TESTE || DRY || !REPO) return;
  const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (let t = 0; t < 6; t++) {
    try {
      sh("git fetch -q origin main");
      const remoto = JSON.parse(sh("git show origin/main:agenda.json"));
      const porId = new Map(remoto.map((p) => [p.id, p]));
      for (const p of agenda) {
        const antes = original.has(p.id) ? JSON.parse(original.get(p.id)) : {};
        const alvo = porId.get(p.id); if (!alvo) continue;
        for (const k of new Set([...Object.keys(p), ...Object.keys(antes)])) {
          if (JSON.stringify(p[k]) === JSON.stringify(antes[k])) continue;
          if (p[k] === undefined) delete alvo[k]; else alvo[k] = p[k];
        }
      }
      sh("git reset -q --hard origin/main");
      writeFileSync("agenda.json", JSON.stringify(remoto, null, 1));
      sh("git add agenda.json");
      if (sh("git status --porcelain agenda.json").trim()) { sh(`git -c user.name=robo-agenda -c user.email=robo@users.noreply.github.com commit -q -m "agenda: ${msg}"`); sh("git push -q origin HEAD:main"); }
      for (const p of agenda) original.set(p.id, JSON.stringify(p));
      return;
    } catch (e) { console.error("salvar tentativa", t + 1, String(e.message).slice(0, 120)); execSync("sleep " + (3 + t * 4)); }
  }
  throw new Error("não consegui salvar o estado no repo");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ultimoUso = "";
// Limite de chamadas do Meta (códigos 4, 17, 32, 613 ou "request limit"): para a rodada e tenta na próxima.
const ehLimite = (m) => /request limit|rate limit|too many|(#(4|17|32|613))/i.test(m);
async function api(path, params = {}, method = "POST") {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const url = method === "GET" ? `${G}/${path}?${body}` : `${G}/${path}`;
  const r = await fetch(url, method === "GET" ? {} : { method, body });
  const uso = r.headers.get("x-app-usage") || r.headers.get("x-business-use-case-usage");
  if (uso && uso !== ultimoUso) { ultimoUso = uso; console.log("uso da API", uso.slice(0, 160)); }
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  return j;
}
async function esperaContainer(id) {
  // poucas checagens: cada uma conta no limite de chamadas por hora do app
  for (const espera of [3000, 7000, 15000, 30000, 30000, 45000, 60000, 60000, 90000, 120000]) {
    await sleep(espera);
    const s = await api(id, { fields: "status_code,status" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR") throw new Error("container com erro: " + s.status);
  }
  throw new Error("container demorou demais");
}

async function idPublicado(p) {
  const desde = new Date(p.publicar_tentado).getTime() - 120e3;
  if (p.tipo === "story") {
    const r = await api(`${IG}/stories`, { fields: "id,timestamp", limit: "10" }, "GET");
    const m = (r.data || []).find((x) => new Date(x.timestamp).getTime() >= desde);
    return m ? m.id : null;
  }
  const r = await api(`${IG}/media`, { fields: "id,caption,timestamp", limit: "10" }, "GET");
  const norm = (t) => (t || "").replace(/s+/g, " ").trim().slice(0, 80);
  const m = (r.data || []).find((x) => norm(x.caption) === norm(p.legenda) && new Date(x.timestamp).getTime() >= desde);
  return m ? m.id : null;
}
async function publicaIG(p) {
  const url = (f) => RAW + encodeURI(f);
  // container já criado numa rodada anterior (vale 24 h): só publica, sem recriar tudo
  // Trava contra duplicado: o Meta às vezes responde erro no media_publish (ex.: "Application request limit reached")
  // mas publica mesmo assim, e aceita publicar o mesmo container de novo. Então: media_publish NUNCA é repetido.
  if (p.publicar_tentado) throw new Error("publicação já foi tentada e não confirmada; confira no perfil e libere no painel");
  let criacao;
  if (p.tipo === "story") {
    const f = p.arquivos[0];
    criacao = (await api(`${IG}/media`, f.endsWith(".mp4") ? { media_type: "STORIES", video_url: url(f) } : { media_type: "STORIES", image_url: url(f) })).id;
  } else if (p.tipo === "reel") {
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
  p.container = criacao; p.publicar_tentado = new Date().toISOString();
  salvar(`tentando ${p.id}`); // grava ANTES de publicar: se a rodada morrer, a próxima não repete
  try {
    return (await api(`${IG}/media_publish`, { creation_id: criacao })).id;
  } catch (e) {
    // confere se saiu mesmo assim (feed: pela legenda; story: pelo horário)
    await sleep(20000);
    const achado = await idPublicado(p).catch(() => null);
    if (achado) { console.log("publicou apesar do erro", p.id, e.message); return achado; }
    p.pausado = true;
    throw e;
  }
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
let limitado = false;
const vencidos = agenda.filter((p) => !p.pausado && p.tipo !== "manual" && new Date(p.quando).getTime() <= agora && (!p.ig || !p.fb)).slice(0, MAX);
console.log(`${vencidos.length} pra publicar agora`);
for (const p of vencidos) {
  if (DRY) { console.log("DRY", p.id, p.quando); continue; }
  let parar = false;
  try { if (!p.ig) { p.ig = await publicaIG(p); delete p.erro_ig; console.log("IG ok", p.id, p.ig); } } catch (e) { p.erro_ig = String(e.message); console.error("IG erro", p.id, e.message); if (ehLimite(e.message)) parar = true; else if (/container/.test(e.message)) delete p.container; }
  if (!PAGE || p.tipo === "story") p.fb = "pular";
  try { if (!p.fb) { p.fb = await publicaFB(p); console.log("FB ok", p.id, p.fb); } } catch (e) { p.erro_fb = String(e.message); console.error("FB erro", p.id, e.message); }
  salvar(`${p.id} ${p.ig ? "publicado" : "erro"}`);
  if (parar) { console.log("limite de chamadas do Meta: paro aqui e tento na próxima rodada"); limitado = true; break; }
}
if (!limitado) await coletarMetricas().catch((e) => console.error("metricas", e.message));
writeFileSync("agenda.json", JSON.stringify(agenda, null, 1));
salvar("publicados e métricas");

// Resultados: curtidas/comentários sempre; alcance, views, envios e salvos se o token tiver instagram_manage_insights.
async function coletarMetricas() {
  const h = new Date();
  if (!process.env.FORCAR_METRICAS && !(h.getUTCMinutes() < 15 && h.getUTCHours() % 3 === 0)) return;
  let midias = [], url = `${IG}/media`, params = { fields: "id,caption,timestamp,media_type,media_product_type,permalink,like_count,comments_count", limit: "50" };
  for (let pg = 0; pg < 8 && url; pg++) {
    const r = await api(url, params, "GET");
    midias = midias.concat(r.data || []);
    url = r.paging?.cursors?.after && r.paging?.next ? `${IG}/media` : null;
    params = { ...params, after: r.paging?.cursors?.after };
  }
  const porId = new Map(midias.map((m) => [m.id, m]));
  const norm = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 80);
  for (const p of agenda) {
    if (p.tipo === "manual" || p.tipo === "story") continue;
    let m = p.ig && porId.get(String(p.ig));
    if (!m && (p.via === "business_suite" || p.ig_media || p.ig === "confirmado")) m = porId.get(p.ig_media) || midias.find((x) => norm(x.caption) === norm(p.legenda) && Math.abs(new Date(x.timestamp) - new Date(p.quando)) < 6 * 3600e3);
    if (!m) continue;
    p.ig_media = m.id; p.link = m.permalink;
    p.metricas = { ...(p.metricas || {}), curtidas: m.like_count ?? null, comentarios: m.comments_count ?? null, atualizado: new Date().toISOString() };
  }
  let semInsights = false, n = 0;
  for (const p of agenda.filter((x) => x.ig_media && Date.now() - new Date(x.quando) < 14 * 86400e3)) {
    if (semInsights || n++ >= 60) break;
    try {
      const r = await api(`${p.ig_media}/insights`, { metric: "reach,views,shares,saved,total_interactions" }, "GET");
      for (const it of r.data || []) p.metricas[{ reach: "alcance", views: "visualizacoes", shares: "envios", saved: "salvos", total_interactions: "interacoes" }[it.name]] = it.values?.[0]?.value ?? it.total_value?.value ?? null;
    } catch (e) { if (/permission|scope|#10|#200/i.test(e.message)) { semInsights = true; console.log("insights sem permissão ainda"); } }
  }
  console.log("metricas atualizadas", agenda.filter((x) => x.metricas).length);
}
