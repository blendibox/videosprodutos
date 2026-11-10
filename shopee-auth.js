/* =====================================================================
   SHOPEE — AUTORIZAÇÃO (gera o Access Token)
   ---------------------------------------------------------------------
   Passo 1 (link):   node shopee-auth.js url
     -> abre o link que ele imprime, faça login de VENDEDOR e confirme.
        Você será redirecionada para a sua "redirect URL" com algo como:
        ...?code=XXXXXXXX&shop_id=123456789
        Copie o code e o shop_id da barra de endereços.

   Passo 2 (token):  node shopee-auth.js token  <code>  <shop_id>
     -> troca o code pelo access_token + refresh_token,
        salva em shopee-token.json E imprime o bloco pra colar no
        PowerShell antes de rodar o shopee-reviews.js.

   Credenciais (variáveis de ambiente) — PowerShell:
     $env:SHOPEE_PARTNER_ID="SEU_PARTNER_ID"
     $env:SHOPEE_PARTNER_KEY="SUA_PARTNER_KEY"
     $env:SHOPEE_REDIRECT="https://www.blendibox.com.br"   # igual à cadastrada no app
     node shopee-auth.js url

   (host de teste: $env:SHOPEE_HOST="https://partner.test-stable.shopeemobile.com")
   ===================================================================== */

const crypto = require("crypto");
const fs = require("fs");

const PARTNER_ID = Number(process.env.SHOPEE_PARTNER_ID || 0);
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";
const REDIRECT = process.env.SHOPEE_REDIRECT || "https://www.blendibox.com.br";
const HOST = process.env.SHOPEE_HOST || "https://partner.shopeemobile.com";

function signPublic(path, ts) {
  // APIs públicas: base = partner_id + path + timestamp
  return crypto.createHmac("sha256", PARTNER_KEY).update(`${PARTNER_ID}${path}${ts}`).digest("hex");
}

function checkCreds() {
  if (!PARTNER_ID || !PARTNER_KEY) {
    console.error("Faltam credenciais. Defina SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY (veja o topo do arquivo).");
    process.exit(1);
  }
}

function cmdUrl() {
  checkCreds();
  const path = "/api/v2/shop/auth_partner";
  const ts = Math.floor(Date.now() / 1000);
  const sign = signPublic(path, ts);
  const url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${ts}&sign=${sign}&redirect=${encodeURIComponent(REDIRECT)}`;
  console.log("\n1) Abra este link no navegador (logada como VENDEDOR da loja):\n");
  console.log(url);
  console.log(`\n2) Depois de confirmar, o navegador vai para:\n   ${REDIRECT}?code=XXXX&shop_id=YYYY`);
  console.log("\n3) Rode:  node shopee-auth.js token <code> <shop_id>\n");
}

async function cmdToken(code, shopId) {
  checkCreds();
  if (!code || !shopId) {
    console.error("Uso: node shopee-auth.js token <code> <shop_id>");
    process.exit(1);
  }
  const path = "/api/v2/auth/token/get";
  const ts = Math.floor(Date.now() / 1000);
  const sign = signPublic(path, ts);
  const url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${ts}&sign=${sign}`;
  const body = { code: String(code), shop_id: Number(shopId), partner_id: PARTNER_ID };

  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.error) { console.error(`ERRO ${d.error}: ${d.message}`); process.exit(1); }

  const token = {
    partner_id: PARTNER_ID,
    shop_id: Number(shopId),
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expire_in: d.expire_in,
    obtido_em: new Date().toISOString(),
  };
  fs.writeFileSync("shopee-token.json", JSON.stringify(token, null, 2), "utf8");

  console.log("\nOK! Token salvo em shopee-token.json (expira em ~" + Math.round((d.expire_in || 14400) / 3600) + "h).\n");
  console.log("Agora cole este bloco no PowerShell e rode o shopee-reviews.js:\n");
  console.log(`$env:SHOPEE_PARTNER_ID="${PARTNER_ID}"`);
  console.log(`$env:SHOPEE_PARTNER_KEY="${PARTNER_KEY}"`);
  console.log(`$env:SHOPEE_SHOP_ID="${shopId}"`);
  console.log(`$env:SHOPEE_ACCESS_TOKEN="${d.access_token}"`);
  console.log(`node shopee-reviews.js\n`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "url") cmdUrl();
else if (cmd === "token") cmdToken(a, b).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
else {
  console.log("Comandos:\n  node shopee-auth.js url\n  node shopee-auth.js token <code> <shop_id>");
}
