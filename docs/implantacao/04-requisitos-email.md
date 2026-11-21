# 04 - Requisitos de e-mail: Gmail, Outlook, SPF, DKIM e DMARC

Data da leitura: 20/11/2026. SOMENTE LEITURA: consultas DNS públicas (`Resolve-DnsName`) e leitura do código. Nenhum DNS foi alterado; nenhum e-mail foi enviado; nenhum valor de variável de ambiente foi lido (apenas nomes).

## 1. Domínio remetente

O código usa o domínio `axion.com.br` como identidade de envio e de reconhecimento de pessoas internas:
- Remetentes institucionais: `crm@axion.com.br` (caixa institucional do piloto, cópia obrigatória e Reply-To) e `acc_ia@axion.com.br` (identidade do ACC no cabeçalho `From`); montagem do cabeçalho em `apps/web/lib/email/mime-message.ts` e `sender-identity.ts`.
- Transporte: API do Gmail (Google Workspace) com credenciais OAuth/delegação server-side. Não há SMTP próprio nem integração de envio pelo Outlook/Microsoft Graph no código; "Outlook" aparece apenas como compatibilidade de RENDERIZAÇÃO dos modelos HTML (`apps/web/lib/email/templates/*`) e como cliente que recebe a mensagem.
- Recepção/respostas: leitura da caixa monitorada por Gmail API; autenticação do remetente da resposta lê o cabeçalho `Authentication-Results` registrado por `mx.google.com` (`apps/web/lib/email-replies/sender-authentication.ts`).

## 2. O que existe no DNS público (consulta de 20/11/2026, resolvedor padrão e 8.8.8.8, resultados iguais)

| Registro | Resultado | Avaliação |
|---|---|---|
| MX de `axion.com.br` | `1 aspmx.l.google.com` (único) | Entrega via Google Workspace; configuração de MX único é legada mas funciona. Recomenda-se, quando o dono quiser, a lista MX padrão do Google com prioridades (redundância). |
| TXT de `axion.com.br` | somente `google-gws-recovery-domain-verification=...` | NÃO existe SPF (`v=spf1 ...`). |
| `_dmarc.axion.com.br` TXT | `v=DMARC1;p=none;` | DMARC existe em modo monitoramento, SEM `rua`/`ruf` (ninguém recebe relatórios), sem `pct`, `adkim`, `aspf`. Sem política de proteção. |
| DKIM (seletores testados: `google`, `default`, `selector1`, `selector2`, `k1`, `mail`, `s1`, `dkim`, `smtp`) | nenhum registro encontrado | Sem chave DKIM própria publicada nos seletores comuns. O Workspace usa por padrão o seletor `google`; ausente aqui. Não se pode afirmar que não exista outro seletor; confirmar no Admin do Google Workspace. |
| MTA-STS (`_mta-sts`) e BIMI | ausentes | Opcionais; sem impacto bloqueante. |
| NS | `e.sec.dns.br`, `d.sec.dns.br` | Servidores de nomes do registro.br. Alterações são feitas no painel do registro.br. |

Conclusão: faltam SPF e DKIM próprio; DMARC existe só em `p=none` sem relatórios. Isso confere com a pendência registrada ("DKIM próprio + DMARC") em `docs/arquitetura/acc-ordem-noturna-20261121.md`.

## 3. Impacto de cada item

| Item | Para que serve | Efeito da ausência/estado atual |
|---|---|---|
| SPF | Lista quem pode enviar em nome do domínio | Sem SPF, destinatários externos tratam a mensagem como "neutra"; aumenta a chance de spam e, com DMARC futuro, causa falha de alinhamento. Facilita spoofing do domínio. |
| DKIM | Assina a mensagem com chave do domínio | Sem chave do domínio, o Google assina com domínio de reserva (não alinhado a `axion.com.br`): o DMARC não consegue passar por DKIM. Provedores exigentes (Gmail/Yahoo para remetentes em volume; Microsoft Outlook.com) penalizam. |
| DMARC | Política de rejeição/quarentena e relatórios | `p=none` sem `rua` não protege contra spoofing nem dá visibilidade. Para proteger, o caminho é `none` com relatórios -> `quarantine` -> `reject`, depois de SPF e DKIM estarem alinhados. |
| Efeito no ACC (respostas por e-mail) | O fluxo de respostas só aceita ação se `Authentication-Results` do Google mostrar SPF/DKIM/DMARC sem falha (docs `email-respostas-lote3.md`, `piloto-projeto-email.md`) | Sem SPF/DKIM próprios, mensagens legítimas de usuários `@axion.com.br` podem aparecer sem `pass` alinhado e as confirmações por e-mail seriam recusadas (comportamento fail-closed). Alternativa já prevista no código: `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS` (confiar em remetentes do mesmo tenant), a ser ligada só após homologação e decisão do dono. Esta análise não testou mensagens reais. |
| Gmail (destino) | Cliente mais comum entre destinatários | Para remetentes que enviam volume, exige SPF ou DKIM, DMARC publicado e baixo índice de spam; mensagens sem autenticação podem ir para spam/ser rejeitadas. Volume do ACC é baixo, mas o risco existe para alertas críticos. |
| Outlook / Microsoft 365 (destino) | Segundo cliente mais comum | Aplica filtragem por SPF/DKIM/DMARC e reputação; mensagens sem autenticação alinhada tendem a spam/quarentena corporativa. O HTML dos modelos usa compatibilidade com o motor de renderização do Outlook (VML/tabelas); homologação visual real em Outlook ainda consta como pendente (`acc-consolidacao-20261120.md`). |

## 4. Plano de implantação (NÃO executado; exige responsável de TI/DNS e decisão do dono)

Ordem recomendada, cada passo conferido por consulta DNS pública antes do seguinte:
1. Inventário de remetentes de `axion.com.br`: Google Workspace (principal) e quaisquer serviços de terceiros que enviem em nome do domínio (CRM, marketing, sistemas). Sem inventário, um SPF restritivo derruba e-mail legítimo.
2. SPF: publicar um único TXT na raiz, por exemplo `v=spf1 include:_spf.google.com ~all` (acrescentar includes dos demais remetentes do passo 1); começar com `~all` (softfail) e migrar a `-all` após a observação. Apenas um registro SPF por domínio; limite de 10 consultas DNS.
3. DKIM: no Admin do Google Workspace gerar a chave (2048 bits) para `axion.com.br`, publicar o TXT do seletor indicado pelo Admin (normalmente `google._domainkey`) e só então clicar em "Iniciar autenticação". Conferir um cabeçalho real com `dkim=pass header.d=axion.com.br`.
4. DMARC: manter `p=none` e acrescentar `rua=mailto:<caixa de relatórios>` (caixa dedicada decidida pelo dono) por 2 a 4 semanas; analisar; subir para `p=quarantine` (com `pct` gradual) e depois `p=reject` apenas se os relatórios mostrarem alinhamento SPF/DKIM de todos os remetentes legítimos.
5. MX: opcional, adotar a lista padrão do Google com prioridades para redundância.
6. Homologação: enviar mensagens de teste controladas (modo piloto, destinatários da allowlist) para uma conta Gmail e uma Outlook/Microsoft 365 e conferir "Mostrar original" / cabeçalhos: `spf=pass`, `dkim=pass`, `dmarc=pass`. Conferir também que as respostas por e-mail continuam sendo aceitas conforme a política do código.
7. Só depois dos passos 2 a 6 avaliar a abertura do modo de envio real (decisão do dono, ver `06`).

Riscos do plano: SPF incompleto bloqueia remetentes legítimos; DKIM ligado antes do TXT propagar falha a assinatura; `p=reject` precipitado derruba e-mail legítimo. Mitigação: etapas graduais e relatórios DMARC.

## 5. Variáveis de ambiente e travas de envio (SOMENTE NOMES; valores nunca neste repositório)

| Nome | Função | Estado desejado antes do GO |
|---|---|---|
| `ACC_OUTBOUND_MODE` | Só o valor exato `production` libera destinatários originais; ausente/`pilot`/outro = modo piloto com allowlist | diferente de `production` até a decisão |
| `ACC_PILOT_RECIPIENT`, `ACC_PILOT_ALLOWED_RECIPIENTS`, `ACC_PILOT_ADDITIONAL_RECIPIENTS`, `ACC_EMAIL_ONLY_RECIPIENT` | Allowlist/redirecionamento do piloto e testes controlados | conferidos |
| `ACC_PROJECT_PILOT_SENDER`, `ACC_PROJECT_PILOT_PROJECT_ID`, `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS`, `ACC_PROJECT_PILOT_TEST_GROUP` | Piloto por projeto (WEG) | conferidos |
| `ACC_PILOT_INSTITUTIONAL_ADDRESS`, `ACC_PILOT_INSTITUTIONAL_MAILBOXES`, `ACC_PILOT_CORPORATE_DOMAIN` | Caixa institucional e domínio corporativo do piloto | conferidos |
| `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` | Liga o envio de reemissão de alerta | desligada |
| `ACC_INSURANCE_REAL_SEND_ENABLED` | Trava fail-closed de envio real do módulo Seguros (minutas permanecem DRAFT) | desligada |
| `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED`, `ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR` | Respostas por e-mail e limite por remetente | desligada até homologar |
| `ACC_EMAIL_SPECIALIST_ENABLED` | Consulta de Expert por e-mail | desligada até homologar |
| `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS`, `ACC_EMAIL_TRUSTED_AUTHSERV_IDS`, `ACC_EMAIL_TOKEN_OWNER_STRICT` | Confiança de remetente/tenant e autenticação das respostas | decisão após SPF/DKIM/DMARC |
| `ACC_SSMA_NOTIFICATIONS_ENABLED`, `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED`, `ACC_WEEKLY_REPORTS_ENABLED`, `ACC_WHATSAPP_ENABLED`, `ACC_SCHEDULER_PG_CRON_ENABLED` | Liga canais e agendador | conforme o plano de cada bloco |
| `ACC_TEST_MODE`, `ACC_TEST_MODE_BANNER_TEXT`, `ACC_SENDER_DISPLAY_NAME` | Modo teste e identidade | conforme ambiente |
| `GOOGLE_GMAIL_*` (remetente, cliente, token, delegação de domínio) e `ACC_SCHEDULER_*_CRON_SECRET` | Credenciais server-side (Vercel/GitHub secrets) | nunca no frontend nem no repositório; conferir presença, não valor |

Travas no código: `pilot-outbound-guard.ts` (modo piloto fail-closed, allowlist), `send-guard.ts` do módulo de seguros (flag + aprovação humana), `reissue-send-gate.ts`, estados de entrega (`20261121130000`: aceito pelo provedor x entrega comprovada).

## 6. Fase 5/F (21/11/2026): DNS reconsultado e inventário Gmail / Outlook / Graph por camada

Somente leitura: consultas DNS públicas (`nslookup`) e leitura de código, workflows e documentos. Nenhuma chamada a Gmail, Microsoft Graph ou seguradoras; nenhum e-mail enviado; nenhum valor de variável lido (apenas nomes).

### 6.1 DNS público de `axion.com.br` em 21/11/2026 (igual a 20/11)

| Registro | Resultado |
|---|---|
| MX | `1 aspmx.l.google.com` (único) |
| TXT (raiz) | somente `google-gws-recovery-domain-verification=...`; NÃO há SPF (`v=spf1`) |
| `_dmarc` TXT | `v=DMARC1;p=none;` (sem `rua`/`ruf`) |
| DKIM (seletores `google`, `default`, `selector1`, `selector2`, `k1`, `s1`, `mail`, `dkim`) | nenhum registro (NXDOMAIN); outro seletor não pode ser descartado: confirmar no Admin do Google Workspace |

Princípio: SPF, DKIM e DMARC NÃO bloqueiam a LEITURA de caixas (a leitura usa a API do provedor, autenticada pelo OAuth/delegação, e não depende do DNS do remetente). Eles afetam o ENVIO (entregabilidade e spoofing) e a aceitação de RESPOSTAS por e-mail pelo ACC (fail-closed sem `pass` alinhado, seção 3).

### 6.2 Inventário por camada

Legenda de estado: REAL = existe no código/workflow e é só mecanismo (não prova que a credencial/caixa está ativa em produção); AUSENTE = não existe neste commit; FRENTE A = em implementação na Fase 5 (transporte falso, sem chamada real).

| Camada | Gmail (Google Workspace) | Outlook / Microsoft Graph |
|---|---|---|
| **A. Leitura** (monitoramento de caixas) | REAL (mecanismo): escopo único `gmail.readonly`, caixa personificada `sub` sempre explícita (`scripts/lib/gmail-delegated-auth.mjs`, `gmail-delegation-config.mjs`, `gmail-mailbox-gate.mjs`); caixa do proprietário (`scripts/lib/gmail-owner-mailbox.mjs`). Workflows: `gmail-inbound-sync` (cron a cada 15 min), `gmail-owner-mailbox-sync` (minutos 7 e 37 de cada hora), `gmail-delegated-sync`, `gmail-historical-backfill` e `gmail-recover-existing` (manuais). Quais caixas estão de fato autorizadas e ativas: dado operacional (tabela `email_access_authorizations` e config), NÃO verificado nesta fase. | AUSENTE neste commit. A camada `MailReader` (Gmail + Graph, delta/cursor, dedupe, anexos) é a FRENTE A, testada só com transporte falso. Monitoramento de Outlook NÃO está comprovado. |
| **B. Processamento** | REAL: triagem e alertas (`api/cron/risk-alerts`, `weekly-schedule-email-ingestion` a cada hora no minuto 20, ingestão de anexos). Classificação de risco por e-mail: FRENTE B. | Igual ao Gmail, depois que A entregar mensagens em `emails`. |
| **C. Ações do usuário** (responder/confirmar por e-mail) | REAL, desligado por padrão: respostas por e-mail (`ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED`, limite por remetente), autenticação via cabeçalho `Authentication-Results` do Google (`apps/web/lib/email-replies/sender-authentication.ts`). | Sem leitura Graph não há autenticação de resposta equivalente; HTML dos modelos já considera o motor do Outlook (compatibilidade de renderização), sem prova visual real. |
| **D. Envio pelo ACC** | REAL, travado: API do Gmail com OAuth (`gmail.send` + `userinfo.email` para provar a conta); modo piloto fail-closed e allowlist (`ACC_OUTBOUND_MODE` diferente de `production`); `ACC_RISK_ALERT_REISSUE_SEND_ENABLED`, `ACC_INSURANCE_REAL_SEND_ENABLED` desligadas. Envio real de teste: nunca executado nesta fase. | AUSENTE: não há envio por Graph/SMTP. Mensagens do ACC chegam a destinatários Outlook apenas como destino. |
| **E. Segurança de domínio** | SPF ausente; DKIM não encontrado; DMARC `p=none` sem relatórios (6.1). Plano em 4. | Destinatários Outlook/Microsoft 365 filtram por SPF/DKIM/DMARC e reputação: mesma pendência. |

Quotas e limites (limites PÚBLICOS dos provedores, NÃO medidos neste ambiente; conferir na documentação/console antes de dimensionar): Gmail API aplica cota por projeto e por usuário (unidades por segundo; `messages.list` e `messages.get` consomem unidades), por isso o backfill é manual e controlado (dry-run por padrão na Fase 5). Microsoft Graph aplica limitação (HTTP 429/`Retry-After`) por aplicativo e por caixa; o leitor Graph deve respeitar `Retry-After` e usar delta para não varrer a caixa inteira.

### 6.3 BLOQUEIO exato para leitura real de Outlook / Microsoft Graph

Nada abaixo existe ou foi testado; é o que falta antes de qualquer uso real (o código da FRENTE A roda só com transporte falso):
1. Registro de aplicativo no Microsoft Entra ID (tenant da organização), com identificador do aplicativo e segredo/certificado guardados APENAS server-side (Vercel/GitHub secrets; nunca no frontend nem no repositório).
2. Permissão de aplicativo `Mail.Read` (somente leitura; `Mail.ReadBasic` não traz corpo/anexos) com CONSENTIMENTO DE ADMINISTRADOR do tenant; avaliar restringir às caixas autorizadas por política de acesso a aplicativos do Exchange Online (Application Access Policy / RBAC for Applications) para não ler todas as caixas.
3. Lista das caixas Outlook a monitorar, com autorização do titular e base legal (LGPD), registrada em `email_access_authorizations` ou equivalente.
4. Decisão do dono sobre o escopo (inclusive WEG: mensagens com `@weg.net` em remetente/destinatário/cópia) e sobre a retenção do conteúdo.
5. Teste controlado com uma caixa de homologação antes de qualquer caixa real.
Enquanto 1 a 3 não existirem: Outlook = NÃO monitorado.
