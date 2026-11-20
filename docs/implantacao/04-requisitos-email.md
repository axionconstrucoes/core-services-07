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
