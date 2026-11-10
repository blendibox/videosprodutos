/* =====================================================================
   SHOPEE → reviews.json + baixa as mídias pro SEU repositório
   ---------------------------------------------------------------------
   Lista TODOS os seus produtos (get_item_list), pega o nome de cada um
   (get_item_base_info) e puxa as avaliações produto por produto
   (get_comment com item_id — é assim que a Shopee retorna de verdade).
   Baixa fotos/vídeos pra images/reviews e videos/reviews. O reviews.json
   aponta pros SEUS links (jsDelivr), nunca pra Shopee (que expiram).

   Node.js 18+.  Rode DENTRO da pasta do repositório (videosprodutos),
   com as mesmas variáveis que o shopee-auth.js imprimiu:

     $env:SHOPEE_PARTNER_ID="2051618"
     $env:SHOPEE_PARTNER_KEY="sua_partner_key_live"
     $env:SHOPEE_SHOP_ID="seu_shop_id"
     $env:SHOPEE_ACCESS_TOKEN="seu_access_token"
     node shopee-reviews.js
   ===================================================================== */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CONFIG = {
  partner_id: Number(process.env.SHOPEE_PARTNER_ID || 0),
  partner_key: process.env.SHOPEE_PARTNER_KEY || "",
  shop_id: Number(process.env.SHOPEE_SHOP_ID || 0),
  access_token: process.env.SHOPEE_ACCESS_TOKEN || "",
  host: process.env.SHOPEE_HOST || "https://partner.shopeemobile.com",
};

// base dos SEUS links (o reviews.json vai apontar pra cá, não pra Shopee)
const BASE_CDN = "https://cdn.jsdelivr.net/gh/blendibox/videosprodutos@main/";

const MIN_ESTRELAS = 4;       // só 4 e 5 estrelas
const SO_COM_TEXTO = true;    // só avaliações com texto

// (opcional) força o "código" de um item específico. Normalmente nem precisa,
// porque classificamos pelo NOME do produto logo abaixo.
const ITEM_TO_PRODUTO = {
  // 23993511062: "3em1",
};

// classifica a avaliação pelo NOME do produto -> código usado no widget
function classifica(nome) {
  const n = (nome || "").toLowerCase();
  // acessórios (não são bolsas) -> ficam fora das páginas de bolsa
  if (/^\s*(al[çc]a|necess|estojo|kit al)/.test(n)) return "outros";
  if (/3\s*em\s*1/.test(n)) return "3em1";
  if (/\btote\b/.test(n)) return "tote";
  if (/transversal/.test(n)) return "transversal";
  if (/viagem/.test(n)) return "viagem";
  if (/maxi/.test(n)) return "maxi";
  return "outros";
}

function sign(p, ts) {
  const base = `${CONFIG.partner_id}${p}${ts}${CONFIG.access_token}${CONFIG.shop_id}`;
  return crypto.createHmac("sha256", CONFIG.partner_key).update(base).digest("hex");
}

async function call(path_, extra) {
  const ts = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams(Object.assign({
    partner_id: String(CONFIG.partner_id), timestamp: String(ts),
    access_token: CONFIG.access_token, shop_id: String(CONFIG.shop_id),
    sign: sign(path_, ts),
  }, extra || {}));
  const r = await fetch(`${CONFIG.host}${path_}?${q}`);
  const d = await r.json();
  if (d.error) throw new Error(`${d.error}: ${d.message}`);
  return d.response || {};
}

// 1) lista todos os item_id da loja
async function listarItens() {
  let offset = 0, ids = [], mais = true, guarda = 0;
  while (mais) {
    const r = await call("/api/v2/product/get_item_list", {
      offset: String(offset), page_size: "100", item_status: "NORMAL",
    });
    (r.item || []).forEach((i) => ids.push(i.item_id));
    mais = r.has_next_page; offset = r.next_offset || (offset + 100);
    if (++guarda > 100) break;
  }
  return ids;
}

// 2) nomes dos itens (até 50 por chamada)
async function nomesDosItens(ids) {
  const mapa = {};
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const r = await call("/api/v2/product/get_item_base_info", { item_id_list: lote.join(",") });
    (r.item_list || []).forEach((it) => { mapa[it.item_id] = it.item_name || ""; });
  }
  return mapa;
}

// 3) comentários de UM item (paginado)
async function comentariosDoItem(itemId) {
  let cursor = "", out = [], mais = true, guarda = 0;
  while (mais) {
    const r = await call("/api/v2/product/get_comment", {
      item_id: String(itemId), cursor: cursor, page_size: "100",
    });
    (r.item_comment_list || r.comment_list || []).forEach((c) => out.push(c));
    mais = r.more; cursor = r.next_cursor || "";
    if (++guarda > 200) break;
  }
  return out;
}

function mesAno(s) {
  const d = new Date(s * 1000);
  const m = ["jan.","fev.","mar.","abr.","mai.","jun.","jul.","ago.","set.","out.","nov.","dez."];
  return `${m[d.getMonth()]} ${d.getFullYear()}`;
}

function midiaUrls(c) {
  const m = c.media || c.comment_media || {};
  const imgs = (m.image_url_list || c.image_list || []).filter(Boolean);
  const vids = (m.video_url_list || []).filter(Boolean);
  return { imgs, vids };
}

// a extensão vem do Content-Type (as URLs da Shopee não têm extensão no path)
function extDoTipo(ct, kind) {
  ct = (ct || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  return kind === "vid" ? "mp4" : "jpg";
}

async function baixar(url, dir, nomeBase, kind) {
  // já baixado antes? pula (re-rodar fica rápido)
  if (fs.existsSync(dir)) {
    const achou = fs.readdirSync(dir).find((f) => f.startsWith(nomeBase + "."));
    if (achou) return achou;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("download falhou: " + res.status);
  const ext = extDoTipo(res.headers.get("content-type"), kind);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${nomeBase}.${ext}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}

(async () => {
  if (!CONFIG.partner_id || !CONFIG.partner_key || !CONFIG.shop_id || !CONFIG.access_token) {
    console.error("Faltam variáveis SHOPEE_* (partner_id, partner_key, shop_id, access_token).");
    process.exit(1);
  }

  console.log("Listando seus produtos na Shopee...");
  const ids = await listarItens();
  console.log(`Encontrados ${ids.length} produtos.`);
  if (!ids.length) { console.log("Nenhum produto NORMAL encontrado — nada a fazer."); return; }

  const nomes = await nomesDosItens(ids);

  console.log("Puxando avaliações de cada produto...");
  let brutos = [];
  const resumo = {};
  for (const id of ids) {
    const nome = nomes[id] || "";
    const cs = await comentariosDoItem(id);
    cs.forEach((c) => { c.__item_id = id; c.__item_nome = nome; });
    brutos = brutos.concat(cs);
    resumo[id] = { nome: nome.slice(0, 40), total: cs.length, produto: ITEM_TO_PRODUTO[id] || classifica(nome) };
  }

  console.log("\nResumo por produto:");
  Object.keys(resumo).forEach((id) => {
    const r = resumo[id];
    console.log(`  ${String(id).padEnd(12)} ${r.produto.padEnd(12)} ${String(r.total).padStart(4)} aval.  ${r.nome}`);
  });

  const filtradas = brutos
    .filter((c) => (c.rating_star || 0) >= MIN_ESTRELAS)
    .filter((c) => !SO_COM_TEXTO || (c.comment && c.comment.trim()));

  console.log(`\nRecebidas ${brutos.length} avaliações · ${filtradas.length} após filtro. Baixando mídias...`);

  const reviews = [];
  let nImg = 0, nVid = 0;
  for (const c of filtradas) {
    const { imgs, vids } = midiaUrls(c);
    const fotos = [];
    let i = 0;
    for (const u of imgs) {
      try { const f = await baixar(u, "images/reviews", `${c.comment_id}_${i++}`, "img");
        fotos.push(BASE_CDN + "images/reviews/" + f); nImg++; } catch (e) {}
    }
    let video = "";
    if (vids[0]) {
      try { const f = await baixar(vids[0], "videos/reviews", `rev_${c.comment_id}`, "vid");
        video = BASE_CDN + "videos/reviews/" + f; nVid++; } catch (e) {}
    }
    reviews.push({
      id: String(c.comment_id || ""),
      produto: ITEM_TO_PRODUTO[c.__item_id] || classifica(c.__item_nome),
      nome: c.buyer_username || "Cliente Shopee",
      avatar: "",
      estrelas: c.rating_star || 5,
      origem: "shopee",
      data: mesAno(c.create_time || c.comment_time || Date.now() / 1000),
      texto: (c.comment || "").trim(),
      fotos,
      video,
    });
  }

  fs.writeFileSync("reviews.json", JSON.stringify(reviews, null, 2), "utf8");
  console.log(`\nOK! ${reviews.length} avaliações · ${nImg} fotos · ${nVid} vídeos salvos no repo.`);
  console.log("Agora me avise que eu faço o commit e push (reviews.json + images/reviews + videos/reviews).");
})().catch((e) => {
  console.error("ERRO:", e.message);
  console.error("Se for token expirado (~4h), rode de novo o shopee-auth.js pra pegar um access_token novo.");
});
