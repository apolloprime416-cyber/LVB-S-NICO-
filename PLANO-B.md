# Plano B — LVB Sônico fora do Replit (Vercel como reserva)

> Objetivo: se o Replit ficar fora do ar um dia, a operação de keys continua
> funcionando na Vercel, com os mesmos dados, sem perder nenhum cliente.
>
> Regra de ouro: o Replit continua sendo a casa principal. Nada aqui muda o
> funcionamento atual. O Plano B é preparado "na gaveta" e só é acionado se
> precisar.

---

## Como o sistema é hoje (o que precisa sobreviver)

| Parte | O que é | Onde vive hoje |
|---|---|---|
| Painel (site) | O site lvbsonic.replit.app — login, keys, planos, admin | Replit |
| Servidor de APIs | Valida keys, gera PIX (PushinPay), entrega a extensão | Replit |
| Banco de dados | Clientes, keys, pagamentos, o zip da extensão | Replit (PostgreSQL) |
| Extensão | O arquivo que os clientes baixam e instalam no Chrome | Baixada do site |
| Segredos | Token da PushinPay e chave de sessão | Replit (Secrets) |

O código é padrão do mercado (React + Node + PostgreSQL) — ele não fica
"preso" em nenhuma hospedagem.

---

## Os 3 pilares do Plano B

### Pilar 1 — Código em backup no GitHub (fácil, sem risco)

- O Replit conecta direto com o GitHub. Uma vez conectado, todo o código fica
  copiado num repositório seu, fora do Replit.
- Qualquer hospedagem (Vercel incluída) puxa o código de lá em minutos.
- **Custo: grátis. Risco: zero — não muda nada no funcionamento.**
- Como fazer: conectar sua conta GitHub ao Replit (painel Git do workspace) e
  enviar o código. Depois disso, a cada atualização importante, envia de novo
  (ou peço para o agente enviar).

### Pilar 2 — Banco de dados neutro (o pilar mais importante)

Hoje os dados vivem no banco do Replit. Se o Replit cair, os dados ficam
inacessíveis até ele voltar.

- Solução: mover o banco para um serviço neutro de PostgreSQL, como o
  **Neon** (neon.tech) — tem plano gratuito e é o mesmo tipo de banco usado
  aqui, então a mudança é de endereço, não de tecnologia.
- Replit e Vercel passam a apontar para esse banco único. Key criada em um
  aparece no outro na hora. Nada duplicado, nada dessincronizado.
- A migração é: criar o banco no Neon → copiar os dados (export/import
  padrão do PostgreSQL) → trocar o endereço do banco no Replit → testar →
  republicar.
- **Custo: grátis no início. Risco: baixo, mas é a única etapa que mexe no
  sistema em produção — deve ser feita com calma, com backup antes, e de
  preferência num horário de pouco movimento.**

### Pilar 3 — Versão da Vercel pronta na gaveta

- A Vercel hospeda o painel (site) sem esforço. O servidor de APIs precisa de
  uma adaptação técnica (a Vercel usa "funções sob demanda" em vez de um
  servidor sempre ligado). Pontos que exigem ajuste:
  - Sessões de login (hoje guardadas no banco — continuam funcionando, só
    precisa conferir).
  - Upload/download do zip da extensão (o zip já fica no banco, então ok).
  - O webhook da PushinPay (confirmação de pagamento) aponta para UM endereço
    — no dia da virada, troca-se para o endereço da Vercel. Enquanto isso, a
    conferência automática a cada 5 segundos já cobre pagamentos mesmo sem
    webhook.
- Cadastrar na Vercel os mesmos segredos: token da PushinPay e chave de
  sessão.
- Deixar publicado num endereço reserva (ex.: lvbsonico.vercel.app), testado
  com uma compra pequena, e **desligado/esquecido até precisar**.
- **Custo: plano gratuito da Vercel atende no início. Risco: zero para o
  Replit — é uma cópia paralela.**

---

## O elo que falta: domínio próprio (recomendado)

A extensão instalada nos computadores dos clientes aponta para
`lvbsonic.replit.app`. Se o Replit cair, esse endereço cai junto — e as
extensões já instaladas param de validar, mesmo com a Vercel de pé.

- Solução: comprar um domínio próprio (ex.: `lvbsonico.com.br`, ~R$40/ano) e
  apontar para o Replit. A extensão passa a falar com o SEU domínio.
- No dia de uma emergência: muda-se o apontamento do domínio para a Vercel
  (leva minutos) e **todas as extensões já instaladas continuam funcionando
  sem ninguém baixar nada de novo**.
- Sem domínio próprio, o Plano B funciona, mas todos os clientes precisariam
  baixar a extensão de novo — bem pior.

---

## Ordem sugerida (do mais fácil ao mais delicado)

1. **GitHub** — backup do código. Sem risco, faz hoje.
2. **Domínio próprio** — compra e aponta para o Replit. Sem risco, e já
   melhora a marca.
3. **Atualizar a extensão** para falar com o domínio próprio e redistribuir
   o zip pelo painel.
4. **Banco neutro (Neon)** — migração com backup, em horário calmo.
5. **Cópia na Vercel** — adaptar, publicar no endereço reserva, testar uma
   compra, guardar na gaveta.

## Dia de emergência (se o Replit cair) — roteiro de virada

1. Apontar o domínio próprio para a Vercel (minutos).
2. Conferir login, validação de key e uma compra PIX de teste na Vercel.
3. Trocar o endereço do webhook da PushinPay para o da Vercel.
4. Pronto — clientes seguem usando sem perceber. Quando o Replit voltar,
   pode voltar o apontamento ou manter na Vercel.

---

## Pilar 3 — status: código pronto (06/08/2026)

O repositório já está adaptado para a Vercel. Nada mudou no funcionamento do
Replit — são arquivos novos que só a Vercel usa:

| Arquivo | Para que serve |
|---|---|
| `vercel.json` | Diz à Vercel como instalar, construir e rotear o site + APIs |
| `artifacts/api-server/src/vercel.ts` | Entrada do servidor no modelo "função sob demanda" |
| `artifacts/api-server/build-vercel.mjs` | Empacota o servidor num arquivo único (`api/index.mjs`) durante o build da Vercel |

Testado localmente com o mesmo empacotamento da Vercel: saúde da API, login
(sessão no banco) e validação de key funcionaram apontando para o banco atual.

### Como publicar na Vercel (uma vez, ~10 minutos)

1. Entrar em vercel.com com a conta GitHub e importar o repositório
   `apolloprime416-cyber/LVB-S-NICO-`.
2. Na importação, **não mudar nada** de build — o `vercel.json` já configura
   tudo. Só conferir que o "Root Directory" é a raiz do repositório.
3. Em *Settings → Environment Variables*, cadastrar:
   - `DATABASE_URL` — o endereço do banco Neon (o mesmo usado no Replit
     depois da migração do Pilar 2).
   - `PUSHINPAY_TOKEN` — o mesmo token da PushinPay usado no Replit.
   - `SESSION_SECRET` — a mesma chave de sessão usada no Replit (importante
     ser a mesma para os logins valerem nos dois lugares).
   - `PUBLIC_BASE_URL` — o endereço da Vercel (ex.:
     `https://lvbsonico.vercel.app`), para o PIX gerado lá receber o aviso de
     pagamento lá mesmo.
4. Fazer o deploy e testar no endereço reserva: login, validar uma key e uma
   compra PIX pequena.
5. Guardar na gaveta. A cada atualização importante enviada ao GitHub, a
   Vercel republica sozinha.

### Observações técnicas (para o dia da virada)

- O webhook da PushinPay de compras feitas no Replit continua apontando para
  o Replit; a conferência automática a cada 5 segundos cobre o resto.
- Enquanto o banco ainda for o do Replit (Pilar 2 pendente), a cópia da
  Vercel só funciona se o Replit estiver no ar — por isso o Pilar 2 (Neon)
  é pré-requisito para a emergência de verdade.
- O download da extensão (zip ~220 KB) vem do banco e está dentro dos
  limites das funções da Vercel.

---

*Documento gerado em 05/08/2026 e atualizado em 06/08/2026 (Pilar 3: código
adaptado e testado; publicação na Vercel depende do passo a passo acima, que
usa a sua conta Vercel).*
