# Como colher as reviews da SHEIN (passo a passo)

A SHEIN não tem API pública de avaliações e o site fica atrás de captcha/anti-bot,
então a coleta é feita na **sua sessão real do navegador** (você passa o captcha uma vez;
a própria página da SHEIN faz as chamadas; a gente só guarda o JSON). Nada é inventado.

Depois da coleta, o `shein-reviews.js` processa tudo (baixa mídias, mescla no reviews.json).

---

## Opção A — coletar junto comigo (Claude) no painel do navegador  ← recomendado
1. No painel do navegador, abra a loja:
   `https://br.shein.com/store/home?store_code=3038323342&tab=items`
2. **Resolva o captcha** que aparecer (eu não posso resolver captcha).
3. Me avise. Eu abro cada produto, deixo as avaliações carregarem, "Ver mais" até o fim,
   e capturo as respostas JSON. Salvo tudo em `shein-raw.json`.
4. Eu rodo `node shein-reviews.js` e te mostro o resumo.

## Opção B — você coleta sozinha pelo console do Chrome
1. Logada/na sessão normal, abra a página de **avaliações de um produto** da loja.
2. Clique em "Ver mais avaliações" até carregar todas as que quiser.
3. Abra o DevTools (F12) → aba **Network** → filtre por `review` ou `comment`.
4. Para cada resposta JSON de review, clique → **Copy → Copy response**.
5. Cole num arquivo montando o formato abaixo em `videosprodutos/shein-raw.json`.
6. Rode: `node shein-reviews.js`

---

## Formato do `shein-raw.json`

Dois formatos são aceitos. O mais seguro é **agrupar por produto** (assim o `produto`
do site já vem certo, sem depender do nome):

```json
[
  {
    "goods_id": "123456789",
    "produto": "maxi",
    "nome_produto": "Maxi Bolsa Puffer",
    "comments": [ { ...objeto cru de review da SHEIN... }, { ... } ]
  },
  {
    "goods_id": "234567890",
    "produto": "tote",
    "comments": [ { ... } ]
  }
]
```

- `produto` tem que ser um destes códigos do site:
  `3em1, maxi, tote, transversal, viagem, necessaire, outros`.
- Se não puser `produto`, o script tenta adivinhar pelo `goods_id` (mapa `GOODS_TO_PRODUTO`
  no topo do `shein-reviews.js`) ou pelo nome do produto.
- Os objetos de review podem vir crus — o script entende os campos comuns da SHEIN
  (`comment_id`, `content`, `comment_rank`, `comment_time`, `user_name`, `member_image`,
  `comment_image[]`, `video_url`). Pode colar como a SHEIN devolveu.

Também aceita um **array plano** de reviews cruas (sem agrupar), desde que cada uma tenha
`goods_id`/`goods_name` dentro — aí o script agrupa e classifica sozinho.

---

## Filtros aplicados (iguais à Shopee)
- Só **4 e 5 estrelas**.
- Só avaliações **com texto**.
- Fotos/vídeos baixados para `images/reviews/` e `videos/reviews/`; o `reviews.json`
  aponta para `https://video.blendibox.com.br/...` (nunca para a SHEIN).
- Mescla no `reviews.json` **sem apagar** as da Shopee e **sem duplicar** (dedup por id;
  ids da SHEIN levam prefixo `shein_`).
