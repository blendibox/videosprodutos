/* =====================================================================
   SHEIN → mescla no reviews.json + baixa as mídias pro SEU repositório
   ---------------------------------------------------------------------
   Diferente da Shopee, a SHEIN NÃO tem API pública de avaliações e o
   storefront fica atrás de captcha/anti-bot. Então as reviews são
   COLHIDAS da sua sessão real do navegador (a dona resolve o captcha uma
   vez; a própria página da SHEIN faz as chamadas assinadas e a gente só
   guarda o JSON). Veja shein-harvest.md para o passo a passo da coleta.

   Este script NÃO acessa a SHEIN. Ele só PROCESSA o JSON cru colhido
   (shein-raw.json), igual ao shopee-reviews.js faz depois de puxar:
     - filtra (>=4 estrelas, com texto)
     - baixa fotos/vídeos pra images/reviews e videos/reviews
     - monta o schema { id, item_id, produto, nome, avatar, estrelas,
       origem:"shein", data, texto, fotos[], video }
     - MESCLA no reviews.json (mantém as da Shopee, sem duplicar)

   Node.js 18+.  Rode DENTRO da pasta do repositório (videosprodutos):
     node shein-reviews.js            # usa ./shein-raw.json
     node shein-reviews.js caminho/outro-raw.json

   NUNCA inventar reviews. Só dados reais colhidos da SHEIN.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// base dos SEUS links (o reviews.json aponta pra cá, não pra SHEIN)
const BASE_CDN = "https://video.blendibox.com.br/";

const MIN_ESTRELAS = 4;       // só 4 e 5 estrelas
const SO_COM_TEXTO = true;    // só avaliações com texto
const ORIGEM = "shein";

const RAW_FILE = process.argv[2] || "shein-raw.json";
const REVIEWS_FILE = "reviews.json";

/* ---------------------------------------------------------------------
   Mapa goods_id (SHEIN) -> código do produto no site. Tem PRIORIDADE
   sobre o nome (evita que "tote" e "maxi" se misturem). Preencha os
   goods_id conforme forem colhidos (aparecem no shein-raw.json / URL do
   produto .../p-<goods_sn>-... ; o goods_id vem no próprio JSON).
   Produtos que só existem na SHEIN (sem página no site) -> "outros".
   Itens fora do mapa caem na classificação por nome (classifica()).
   --------------------------------------------------------------------- */
const GOODS_TO_PRODUTO = {
  // "123456789": "3em1",
  // "234567890": "maxi",
  // "345678901": "tote",
  // "456789012": "transversal",
  // "567890123": "viagem",
  // "678901234": "necessaire",
};

// classifica a avaliação pelo NOME do produto -> código usado no widget
// (mesma lógica do shopee-reviews.js)
function classifica(nome) {
  const n = (nome || "").toLowerCase();
  if (/^\s*(al[çc]a|necess|estojo|kit al)/.test(n)) return "outros";
  if (/3\s*em\s*1/.test(n)) return "3em1";
  if (/\btote\b/.test(n)) return "tote";
  if (/transversal/.test(n)) return "transversal";
  if (/viagem/.test(n)) return "viagem";
  if (/maxi/.test(n)) return "maxi";
  return "outros";
}

/* ---------------------------------------------------------------------
   Normalização do JSON cru da SHEIN.
   A SHEIN varia os nomes dos campos conforme o endpoint/versão, então a
   gente tenta vários fallbacks (igual o midiaUrls do shopee-reviews.js).

   shein-raw.json aceito em 2 formatos:
   A) array de "grupos":
      [ { "goods_id":"123", "produto":"maxi", "nome_produto":"...",
          "comments":[ {raw}, {raw} ] }, ... ]
   B) array plano de comentários crus, cada um com goods_id/goods_name
      dentro (a gente agrupa sozinho).
   --------------------------------------------------------------------- */
function pick(obj, keys) {
  for (const k of keys) {
    if (obj == null) return undefined;
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function estrelasDe(c) {
  const v = pick(c, ["comment_rank", "goods_rank", "rank_num", "rating", "star", "stars", "comment_rank_average"]);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function textoDe(c) {
  let v = pick(c, ["content", "comment", "comment_content", "text", "review", "reviewContent"]);
  v = (v || "").toString();
  // tira os botões de UI da SHEIN que às vezes grudam no fim do texto
  v = v.replace(/\s*(Traduzir|Translate)?\s*(Mostrar original|Show original|Ver original)\s*$/i, "");
  v = v.replace(/\s*Traduzir\s*$/i, "");
  return v.trim();
}

function nomeDe(c) {
  const v = pick(c, ["user_name", "username", "nickname", "member_name", "nickName", "userName", "buyer_name"]);
  return (v || "Cliente SHEIN").toString().trim() || "Cliente SHEIN";
}

function avatarDe(c) {
  const v = pick(c, ["member_image", "user_image", "avatar", "headPortrait", "logo"]);
  return (v && /^https?:/.test(v)) ? v : "";
}

function idDe(c) {
  const v = pick(c, ["comment_id", "commentId", "id", "review_id", "reviewId"]);
  if (v) return String(v);
  // sem id da SHEIN (a página de avaliações não expõe) -> hash estável do
  // conteúdo pra deduplicar entre rodadas (nome + data + texto + 1a foto)
  const base = [nomeDe(c), pick(c, ["dateRaw", "comment_time", "add_time", "date"]) || "",
                textoDe(c), (midiaUrls(c).imgs[0] || "")].join("|");
  return "h" + crypto.createHash("sha1").update(base).digest("hex").slice(0, 14);
}

function goodsIdDe(c, grupo) {
  const v = pick(c, ["goods_id", "goodsId", "goods_sn", "goodsSn", "cat_id"]);
  if (v) return String(v);
  if (grupo && (grupo.goods_id || grupo.goodsId)) return String(grupo.goods_id || grupo.goodsId);
  return "";
}

function nomeProdutoDe(c, grupo) {
  return (pick(c, ["goods_name", "goodsName", "product_name"]) ||
          (grupo && (grupo.nome_produto || grupo.goods_name)) || "").toString();
}

// data -> "mês ano" em pt-BR (ex.: "set. 2026")
const M_PT = ["jan.","fev.","mar.","abr.","mai.","jun.","jul.","ago.","set.","out.","nov.","dez."];
const M_EN = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
function mesAno(c) {
  let raw = pick(c, ["dateRaw", "comment_time", "add_time", "time", "date", "create_time", "commentTime"]);
  // formato da SHEIN na página de avaliações: "14 Aug,2025"
  const m = String(raw || "").match(/\b(\d{1,2})\s+([A-Za-z]{3})[,.\s]+(\d{4})\b/);
  if (m && M_EN[m[2].toLowerCase()] !== undefined) {
    return `${M_PT[M_EN[m[2].toLowerCase()]]} ${m[3]}`;
  }
  let d;
  if (raw == null) d = new Date();
  else if (typeof raw === "number" || /^\d{9,13}$/.test(String(raw))) {
    let n = Number(raw);
    if (n < 1e12) n *= 1000; // segundos -> ms
    d = new Date(n);
  } else {
    d = new Date(raw);
    if (isNaN(d.getTime())) d = new Date();
  }
  return `${M_PT[d.getMonth()]} ${d.getFullYear()}`;
}

// coleta URLs de fotos/vídeos do comentário cru
function midiaUrls(c) {
  const imgs = [];
  const vids = [];

  // fotos já extraídas do DOM (array de URLs)
  if (Array.isArray(c.fotos)) c.fotos.forEach((u) => { if (u) imgs.push(u); });
  if (typeof c.video === "string" && /^https?:/.test(c.video)) vids.push(c.video);

  // fotos: comment_image[] com member_image_original/middle, ou image[]/images[]
  const listaImg = c.comment_image || c.commentImage || c.images || c.image_list || c.imgs || c.member_image_list || [];
  (Array.isArray(listaImg) ? listaImg : []).forEach((it) => {
    if (typeof it === "string") { imgs.push(it); return; }
    const u = pick(it, ["member_image_original", "member_image_middle", "member_image", "origin_image", "url", "image_url", "img"]);
    if (u) imgs.push(u);
  });

  // vídeo: video_url / video / media
  const vid = pick(c, ["video_url", "videoUrl", "video", "comment_video"]);
  if (typeof vid === "string" && /^https?:/.test(vid)) vids.push(vid);
  else if (vid && typeof vid === "object") {
    const u = pick(vid, ["url", "video_url", "src"]);
    if (u) vids.push(u);
  }

  const norm = (u) => (u || "").toString().replace(/^\/\//, "https://");
  return {
    imgs: imgs.map(norm).filter((u) => /^https?:/.test(u)),
    vids: vids.map(norm).filter((u) => /^https?:/.test(u)),
  };
}

// olha os bytes de verdade (magic numbers). A SHEIN às vezes serve JPEG numa
// URL ".webp", então o conteúdo manda, não o nome. Cai pro Content-Type/URL.
function extDosBytes(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  // mp4/mov: 'ftyp' no offset 4
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    return /qt/i.test(brand) ? "mov" : "mp4";
  }
  return null;
}
function extDoTipo(ct, url, kind) {
  ct = (ct || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  // fallback pela extensão na URL (SHEIN costuma ter .jpg/.webp no path)
  const m = (url || "").toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|mp4|mov)(?:[?#]|$)/);
  if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  return kind === "vid" ? "mp4" : "jpg";
}

async function baixar(url, dir, nomeBase, kind) {
  // já baixado antes? pula (re-rodar fica rápido)
  if (fs.existsSync(dir)) {
    const achou = fs.readdirSync(dir).find((f) => f.startsWith(nomeBase + "."));
    if (achou) return achou;
  }
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://br.shein.com/" } });
  if (!res.ok) throw new Error("download falhou: " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  // os bytes mandam; só então Content-Type/URL
  const ext = extDosBytes(buf) || extDoTipo(res.headers.get("content-type"), url, kind);
  const file = `${nomeBase}.${ext}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}

// achata o shein-raw.json nos dois formatos aceitos -> lista de {c, grupo}
function achatar(raw) {
  const out = [];
  if (!Array.isArray(raw)) {
    // talvez { comments:[...] } ou { data:{...} } — tenta extrair
    raw = raw.comments || raw.data || raw.reviews || [];
  }
  for (const el of raw) {
    if (el && Array.isArray(el.comments)) {
      for (const c of el.comments) out.push({ c, grupo: el });
    } else {
      out.push({ c: el, grupo: null });
    }
  }
  return out;
}

(async () => {
  if (!fs.existsSync(RAW_FILE)) {
    console.error(`Não achei "${RAW_FILE}". Faça a coleta primeiro (veja shein-harvest.md) e salve o JSON cru aí.`);
    process.exit(1);
  }

  let raw;
  try { raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8")); }
  catch (e) { console.error(`"${RAW_FILE}" não é JSON válido: ${e.message}`); process.exit(1); }

  const itens = achatar(raw);
  if (!itens.length) { console.log("Nenhum comentário no arquivo cru — nada a fazer."); return; }

  // resumo bruto por produto
  const resumoBruto = {};
  for (const { c, grupo } of itens) {
    const gid = goodsIdDe(c, grupo);
    const prod = (grupo && grupo.produto) || GOODS_TO_PRODUTO[gid] || classifica(nomeProdutoDe(c, grupo));
    resumoBruto[prod] = (resumoBruto[prod] || 0) + 1;
  }
  console.log("Comentários crus por produto:", resumoBruto);

  // filtra
  let filtradas = itens.filter(({ c }) =>
    estrelasDe(c) >= MIN_ESTRELAS && (!SO_COM_TEXTO || textoDe(c).length > 0)
  );

  // DEDUP antes de baixar/contar: variantes de cor da SHEIN repetem a mesma
  // avaliação (ex.: todas as cores do maxi mostram o mesmo review). O id é um
  // hash do conteúdo, então duplicatas colapsam aqui.
  const vistos = new Set();
  const antesDedup = filtradas.length;
  filtradas = filtradas.filter(({ c }) => {
    const id = idDe(c);
    if (!id || vistos.has(id)) return false;
    vistos.add(id); return true;
  });
  const dups = antesDedup - filtradas.length;
  console.log(`${itens.length} comentários crus · ${antesDedup} após filtro (>=${MIN_ESTRELAS}★ com texto) · ${filtradas.length} únicas (${dups} duplicadas entre variantes). Baixando mídias...`);

  const novas = [];
  const perProduto = {};   // {produto: {reviews, fotos, videos}}
  let nImg = 0, nVid = 0;

  for (const { c, grupo } of filtradas) {
    const id = idDe(c);
    if (!id) continue; // sem id estável não dá pra deduplicar
    const gid = goodsIdDe(c, grupo);
    const produto = (grupo && grupo.produto) || GOODS_TO_PRODUTO[gid] || classifica(nomeProdutoDe(c, grupo));
    const { imgs, vids } = midiaUrls(c);

    const fotos = [];
    let i = 0;
    for (const u of imgs) {
      try {
        const f = await baixar(u, "images/reviews", `shein_${id}_${i++}`, "img");
        fotos.push(BASE_CDN + "images/reviews/" + f); nImg++;
      } catch (e) { console.warn("  foto falhou:", e.message); }
    }
    let video = "";
    if (vids[0]) {
      try {
        const f = await baixar(vids[0], "videos/reviews", `shein_rev_${id}`, "vid");
        video = BASE_CDN + "videos/reviews/" + f; nVid++;
      } catch (e) { console.warn("  vídeo falhou:", e.message); }
    }

    novas.push({
      id: "shein_" + id,          // prefixo evita colisão com ids da Shopee
      item_id: gid || null,
      produto,
      nome: nomeDe(c),
      avatar: avatarDe(c),
      estrelas: estrelasDe(c),
      origem: ORIGEM,
      data: mesAno(c),
      texto: textoDe(c),
      fotos,
      video,
    });

    const p = perProduto[produto] || (perProduto[produto] = { reviews: 0, fotos: 0, videos: 0 });
    p.reviews++; p.fotos += fotos.length; p.videos += video ? 1 : 0;
  }

  // MESCLA no reviews.json (mantém Shopee + outras, dedup por id)
  let existentes = [];
  if (fs.existsSync(REVIEWS_FILE)) {
    try { existentes = JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8")); }
    catch (e) { console.error(`${REVIEWS_FILE} ilegível: ${e.message}`); process.exit(1); }
    if (!Array.isArray(existentes)) existentes = [];
  }

  const porId = new Map(existentes.map((r) => [String(r.id), r]));
  let add = 0, upd = 0;
  for (const r of novas) {
    if (porId.has(r.id)) { porId.set(r.id, r); upd++; }   // atualiza a mesma review
    else { porId.set(r.id, r); add++; }
  }
  const final = Array.from(porId.values());

  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(final, null, 2), "utf8");

  const totalShein = final.filter((r) => r.origem === ORIGEM).length;
  console.log(`\nOK! reviews.json mesclado: ${final.length} no total (${totalShein} da SHEIN).`);
  console.log(`SHEIN nesta rodada: +${add} novas, ${upd} atualizadas · ${nImg} fotos · ${nVid} vídeos baixados.`);
  console.log("\nResumo SHEIN por produto (review/foto/vídeo):");
  Object.keys(perProduto).sort().forEach((p) => {
    const x = perProduto[p];
    console.log(`  ${p.padEnd(12)} ${String(x.reviews).padStart(3)} rev · ${String(x.fotos).padStart(3)} fotos · ${String(x.videos).padStart(2)} vídeos`);
  });
  console.log("\nConfira e me avise pra fazer o commit/push (reviews.json + images/reviews + videos/reviews).");
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
