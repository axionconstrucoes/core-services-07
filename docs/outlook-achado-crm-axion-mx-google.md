# Achado: crm@axion.com.br é caixa Google, não Exchange Online (Fase 6 / H3)

Data: 21/11/2026. Fonte: apuração do briefing da Fase 6 (consultas somente leitura; nenhuma chamada ao Graph).

## O achado

- O MX de `axion.com.br` aponta para o Google (`aspmx.l.google.com`). Portanto **`crm@axion.com.br` é uma caixa hospedada no Google Workspace**.
- O Microsoft Graph só lê caixas do **Exchange Online**. Um app registrado no Entra com `Mail.Read` **não alcança** uma caixa Google, mesmo que o usuário a abra no aplicativo Outlook.
- O conector Microsoft 365 enxerga o tenant `teleconferencia.onmicrosoft.com`; a conta do diretor ali tem `mail: null` — **sem caixa Exchange**.
- Conclusão: com o estado atual, **não existe caixa Exchange AXION que o Graph possa ler**. O leitor Outlook/Graph do ACC (`scripts/lib/mail-universal/graph-reader.mjs` + `graph-transport.mjs`) está pronto e testado, mas **sem alvo real** até que alguma das opções abaixo seja decidida.

## Opções reais

| Opção | O que é | Prós | Contras / risco | Autorização necessária |
|---|---|---|---|---|
| **A (recomendada para `crm@`)** | Ler `crm@axion.com.br` pelo **Gmail API** (mesma caixa; o Outlook é só um cliente que a exibe) | Nenhuma migração; reaproveita o leitor Gmail, o gate por caixa e o `gmail.readonly`; sem custo novo | Exige a delegação de domínio no Google Admin **ou** um OAuth do titular da caixa | Administrador do Google Workspace: autorizar o cliente de serviço `ACC Gmail Reader` no escopo `https://www.googleapis.com/auth/gmail.readonly` (ver `docs/gmail-delegacao-dominio-passo-a-passo.md`), **ou** o titular de `crm@` consentir o OAuth de leitura; mais o aceite individual da caixa no gate do ACC |
| **B** | Migrar ou **espelhar** a caixa para o Exchange Online (licença Exchange, migração/roteamento, ou regra de cópia) | Habilita o Graph e a política de acesso por caixa | Mudança de infraestrutura de e-mail da empresa (MX/roteamento ou cópia), custo de licença, risco de entrega; não é necessário para ler a caixa | Diretoria + administrador de TI; administrador do tenant Microsoft 365 para o consentimento do app e a política de acesso |
| **C** | Configurar IMAP/Gmail dentro do Outlook do usuário | — | **Não é fonte do ACC**: é configuração no cliente do usuário, sem acesso do servidor, sem trilha de leitura e sem controle central | Não aplicável (descartada) |

Para caixas WEG: **não** se presume acesso e **não** se pede credencial de terceiros; só mensagens que chegam às caixas AXION autorizadas são monitoradas (regra `weg.net` e subdomínios legítimos).

## O que NÃO está comprovado

- Que exista qualquer caixa Exchange Online da AXION (o conector mostra apenas `mail: null`).
- Que a delegação de domínio do Gmail esteja concedida no Google Admin (código declara `PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN`).
- Que o app do Entra tenha sido registrado, consentido ou restringido por política (nada disso foi criado nesta fase).
- Qualquer leitura real pelo Graph (nenhuma chamada foi feita; teste só contra servidor HTTP falso local).

## Autorização humana/administrativa necessária (por opção)

- **A:** administrador do Google Workspace (delegação ou consentimento do titular) + decisão do responsável de incluir `crm@axion.com.br` na lista da obra e registrar o aceite individual no gate.
- **B:** decisão de diretoria; administrador do tenant Microsoft 365 (criar/ajustar caixa, consentimento de administrador para `Mail.Read` de aplicativo, política de acesso por caixa) — roteiro em `docs/outlook-configuracao-graph.md`.
