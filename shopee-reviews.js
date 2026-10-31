/* =====================================================================
   SHOPEE → reviews.json + baixa as mídias pro SEU repositório
   ---------------------------------------------------------------------
   Puxa avaliações pela API oficial (get_comment), BAIXA as fotos/vídeos
   que a API retornar e salva em images/reviews e videos/reviews. O
   reviews.json aponta pros SEUS links (jsDelivr) — nunca pra Shopee.

   Node.js 18+.  Rode DENTRO da pasta do repositório (videosprodutos):

     Windows PowerShell:
       $env:SHOPEE_PARTNER_ID="1234567"
       $env:SHOPEE_PARTNER_KEY="sua_partner_key"
       $env:SHOPEE_SHOP_ID="7654321"
       $env:SHOPEE_ACCESS_TOKEN="seu_access_token"
       node shopee-reviews.js

   (As credenciais vêm de variáveis de ambiente — assim NÃO ficam salvas
    no arquivo nem vão parar no GitHub.)
   ===================================================================== */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CONFIG = {
  partner_id: Number(process.env.SHOPEE_PARTNER_ID || 0),
  partner_key: process.env.SHOPEE_PARTNER_KEY || "",
  shop_id: Number(process.env.SHOPEE_SHOP_ID || 0),
  access_token: process.env.SHOPEE_ACCESS_TOKEN || "",
  host: process.env.SHOPEE_HOST || "https://partner.shopeemobile.com", // teste: https://partner.test-stable.shopeemobile.com
};

// base dos SEUS links (o reviews.json vai apontar pra cá, não pra Shopee)
const BASE_CDN = "https://cdn.jsdelivr.net/gh/blendibox/videosprodutos@main/";

// item_id da Shopee → "handle" do produto no site (veja na URL: …-i.<shop>.<item_id>)
const ITEM_TO_PRODUTO = {
  23993511062: "3em1",
  // 111111111: "maxi",
  // 222222222: "tote",
};

const MIN_ESTRELAS = 4;
const SO_COM_TEXTO = true;

function sign(p, ts) {
  const base = `${CONFIG.partner_id}${p}${ts}${CONFIG.access_token}${CONFIG.shop_id}`;
  return crypto.createHmac("sha256", CONFIG.partner_key).update(base).digest("hex");
}

async function getCommentPage(cursor) {
  const p = "/api/v2/product/get_comment";
  const ts = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({
    partner_id: String(CONFIG.partner_id), timestamp: String(ts),
    access_token: CONFIG.access_token, shop_id: String(CONFIG.shop_id),
    sign: sign(p, ts), page_size: "100", cursor: cursor || "",
  });
  const r = await fetch(`${CONFIG.host}${p}?${q}`);
  const d = await r.json();
  if (d.error) throw new Error(`${d.error}: ${d.message}`);
  return d.response || {};
}

function mesAno(s) {
  const d = new Date(s * 1000);
  const m = ["jan.","fev.","mar.","abr.","mai.","jun.","jul.","ago.","set.","out.","nov.","dez."];
  return `${m[d.getMonth()]} ${d.getFullYear()}`;
}

// coleta URLs de mídia nos campos possíveis (varia por versão da API)
function midiaUrls(c) {
  const m = c.media || c.comment_media || {};
  const imgs = (m.image_url_list || c.image_list || []).filter(Boolean);
  const vids = (m.video_url_list || []).filter(Boolean);
  return { imgs, vids };
}

async function baixar(url, dir, nomeBase) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download falhou: " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (url.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 4);
  const file = `${nomeBase}.${ext}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}

(async () => {
  console.log("Baixando avaliações da Shopee...");
  let cursor = "", mais = true, brutos = [], pag = 0;
  while (mais) {
    const r = await getCommentPage(cursor);
    (r.comment_list || []).forEach((c) => brutos.push(c));
    mais = r.more; cursor = r.next_cursor || ""; pag++;
    if (pag > 300) break;
  }
  console.log(`Recebidas ${brutos.length} avaliações. Baixando mídias...`);

  const filtradas = brutos
    .filter((c) => (c.rating_star || 0) >= MIN_ESTRELAS)
    .filter((c) => !SO_COM_TEXTO || (c.comment && c.comment.trim()));

  const reviews = [];
  let nImg = 0, nVid = 0;
  for (const c of filtradas) {
    const { imgs, vids } = midiaUrls(c);
    const fotos = [];
    let i = 0;
    for (const u of imgs) {
      try { const f = await baixar(u, "images/reviews", `${c.comment_id}_${i++}`);
        fotos.push(BASE_CDN + "images/reviews/" + f); nImg++; } catch (e) { /* ignora mídia que falhar */ }
    }
    let video = "";
    if (vids[0]) {
      try { const f = await baixar(vids[0], "videos/reviews", `rev_${c.comment_id}`);
        video = BASE_CDN + "videos/reviews/" + f; nVid++; } catch (e) {}
    }
    reviews.push({
      produto: ITEM_TO_PRODUTO[c.item_id] || String(c.item_id),
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
  console.log(`OK! ${reviews.length} avaliações · ${nImg} fotos · ${nVid} vídeos salvos no repo.`);
  console.log("Agora faça commit e push (reviews.json + images/reviews + videos/reviews).");
})().catch((e) => {
  console.error("ERRO:", e.message);
  console.error("Confira as variáveis SHOPEE_* (o access_token expira em ~4h).");
});
