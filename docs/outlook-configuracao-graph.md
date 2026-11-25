# Outlook / Microsoft Graph — configuração técnica pronta para contas AXION (Fase 6 / H3)

Estado: **preparado, NÃO ativado**. Nenhuma chamada real ao Graph, nenhum registro no Entra, nenhuma política aplicada. Prioridade da preparação: `crm@axion.com.br` — porém essa caixa é **Google**; leia primeiro `docs/outlook-achado-crm-axion-mx-google.md`. O Graph só serve para caixas **Exchange Online**.

## 1. O que já existe no código (testado contra servidor HTTP FALSO local)

| Peça | Arquivo | Garantias |
|---|---|---|
| Leitor `MailReader` (delta por pasta Inbox/SentItems) | `scripts/lib/mail-universal/graph-reader.mjs` | Somente leitura (proxy recusa escrita); `Mail.Read` de aplicativo |
| **Transporte real** (client credentials) | `scripts/lib/mail-universal/graph-transport.mjs` | Só `GET` (+ `POST` do token); delta com paginação `@odata.nextLink` e `@odata.deltaLink`; 429/503/504 respeitam `Retry-After` (segundos ou data HTTP, teto 120 s, até 5 tentativas); 401 renova o token uma vez; anexos **só metadados** (sem `contentBytes`); links de paginação só do host do Graph configurado; https obrigatório (http só em loopback para teste); erros sem corpo/segredo |
| Configuração por variáveis | `scripts/lib/mail-universal/graph-config.mjs` | Falha fechado se faltar variável; só nomes documentados |
| Testes | `scripts/test-f6-h3-graph-transporte.mjs` | 12 verificações com servidor HTTP em `127.0.0.1` |

## 2. Variáveis (só NOMES; valores só no repositório de segredos do executor, nunca no frontend nem no Git)

| Variável | Obrigatória | Uso |
|---|---|---|
| `ACC_GRAPH_TENANT_ID` | Sim | Diretório (tenant) do Entra |
| `ACC_GRAPH_CLIENT_ID` | Sim | ID do aplicativo registrado |
| `ACC_GRAPH_CLIENT_SECRET` | Sim (preferir certificado/federação quando o executor permitir) | Segredo do aplicativo; validade ≤ 6 meses, rotação agendada |
| `ACC_GRAPH_MAILBOXES` | Sim | Lista (vírgula) das caixas Exchange Online autorizadas — o mesmo gate por caixa do Gmail deve ser exigido antes de ler |
| `ACC_GRAPH_FOLDERS` | Não | Padrão `inbox,sentitems` |
| `ACC_GRAPH_BASE_URL`, `ACC_GRAPH_AUTHORITY` | Não | Nuvens soberanas/teste; padrão Graph global |

## 3. Registro do aplicativo no Entra (manifesto de referência)

Arquivo: `scripts/outlook/entra-app-manifest.json` (**não aplicado**). Pontos:

- Locatário único (`AzureADMyOrg`).
- Permissão **de aplicativo** `Mail.Read` (ID `810c84a8-4a9e-49e6-bf7d-12d183f40d01`) do Microsoft Graph. **Proibido** `Mail.ReadWrite`, `Mail.Send`, `Mail.ReadBasic.All` e qualquer permissão delegada ampla.
- Sem redirect URI, sem fluxo implícito.
- Credencial: certificado ou federação (preferido); segredo de cliente apenas se necessário.

## 4. Restrição por caixa (OBRIGATÓRIA antes de ligar)

Sem política, o consentimento daria ao app acesso a **todas** as caixas do tenant. Script de referência: `scripts/outlook/exchange-application-access-policy.ps1`.

- Cria um grupo de segurança de escopo, adiciona **somente** as caixas autorizadas e cria `New-ApplicationAccessPolicy -AccessRight RestrictAccess`.
- **Não foi executado.** Por padrão roda em simulação; para aplicar exige `-Apply` e `ACC_OUTLOOK_POLICY_CONFIRMED=SIM`.
- Verificação obrigatória: `Test-ApplicationAccessPolicy` deve dar `Granted` para a caixa autorizada e `Denied` para uma não listada; a propagação pode levar até ~1 h.
- Alternativa moderna: RBAC for Applications (Exchange Online), se disponível no tenant.
- Rollback: `Remove-ApplicationAccessPolicy` e remoção do grupo; revogar o consentimento no Entra.

## 5. Checklist de consentimento do administrador

- [ ] Responsável decidiu a opção A/B/C (`docs/outlook-achado-crm-axion-mx-google.md`) e confirmou a lista de caixas.
- [ ] Confirmado que cada caixa alvo é **Exchange Online** (`Get-Mailbox <caixa>` retorna objeto) — caixa Google não serve.
- [ ] Administrador do tenant registra o app (`ACC Outlook Reader`) a partir do manifesto.
- [ ] Concedido **somente** `Mail.Read` de aplicativo; consentimento de administrador registrado (quem/quando).
- [ ] Política de acesso por caixa aplicada **antes** de qualquer segredo ser entregue ao executor; teste `Granted`/`Denied` anexado.
- [ ] Segredo/certificado criado, guardado só no repositório de segredos do executor; validade e data de rotação registradas.
- [ ] Variáveis `ACC_GRAPH_*` cadastradas no executor (nomes acima).
- [ ] Aceite individual de cada caixa e período registrados no gate do ACC (mesmo gate do Gmail; hoje só existe para o Gmail).
- [ ] Primeira execução em **DRY_RUN** (`runMailboxSync`, padrão) e conferência dos contadores com o responsável.
- [ ] Workflow manual equivalente ao Gmail criado em PR próprio (não existe workflow Graph hoje) — **fora do escopo desta frente**.

## 6. O que NÃO está comprovado

Existência de caixa Exchange AXION; registro/consentimento do app; política aplicada; conectividade e cotas reais do Graph; comportamento do delta em caixa real. Só o transporte e o leitor foram verificados, contra servidor falso.

## 7. Regras

- Somente leitura; nenhum envio, movimentação, marcação ou exclusão de mensagem.
- Caixas da WEG **não** são lidas pela AXION; só mensagens que chegam a caixas AXION autorizadas. Não pedir credenciais de terceiros.
- SPF/DKIM/DMARC não afetam a leitura (só o envio; ver plano de DNS da Frente H4).
