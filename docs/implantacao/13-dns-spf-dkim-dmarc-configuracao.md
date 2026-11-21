# 13 - Configuração de SPF, DKIM e DMARC por provedor autorizado (PREPARAÇÃO; nenhum registro DNS foi alterado)

Status: documento de configuração para decisão e execução pelo responsável de TI/DNS. Nada foi criado, alterado ou removido no DNS; nenhum e-mail foi enviado. Os valores abaixo são EXEMPLOS: substituir pelos valores reais gerados no console de cada provedor. Complementa `04-requisitos-email.md` (estado do DNS em 20/11 e 21/11/2026: sem SPF, sem DKIM encontrado, DMARC `p=none` sem `rua`).

## 1. Princípios

1. SPF, DKIM e DMARC afetam o ENVIO e a aceitação de respostas por e-mail; NÃO bloqueiam a LEITURA de caixas (a leitura usa a API do provedor, autenticada por OAuth/delegação).
2. Provedores autorizados a enviar em nome de `axion.com.br`:
   - **Google Workspace**: é o transporte atual do ACC (API do Gmail com OAuth server-side; remetentes institucionais `crm@axion.com.br` e `acc_ia@axion.com.br`). MX de `axion.com.br` = `aspmx.l.google.com`: as caixas do domínio são Google.
   - **Microsoft 365 / Exchange Online**: só se aplicável. Hoje o conector enxerga o tenant `teleconferencia.onmicrosoft.com` sem caixa Exchange para o domínio; o ACC não envia por Microsoft. Incluir o Microsoft no SPF/DKIM SOMENTE se alguém do domínio passar a enviar por lá.
   - Qualquer outro serviço (CRM, marketing, sistemas) que envie em nome do domínio precisa ser inventariado antes: SPF restritivo sem inventário derruba e-mail legítimo.
3. Um único registro SPF por domínio; limite de 10 consultas DNS no SPF (cada `include:` conta).
4. Ordem: inventário -> SPF -> DKIM -> DMARC em monitoramento -> análise de relatórios -> endurecimento gradual. Conferir por consulta DNS pública entre os passos.
5. O DNS de `axion.com.br` está no registro.br (NS `e.sec.dns.br` e `d.sec.dns.br`): as alterações são feitas no painel de DNS do registro.br (ou onde a zona estiver delegada na data). Não há automação neste repositório e não deve haver.

## 2. Passo 0: inventário e pré-requisitos

1. Listar todos os remetentes legítimos (Workspace, CRM, ferramentas). Fonte: relatórios DMARC (passo 4) e o Admin do Google Workspace.
2. Definir a caixa de relatórios DMARC (dedicada, ex.: `dmarc-relatorios@axion.com.br`; decisão do Dono).
3. Definir quem aprova (Dono) e quem executa (TI/DNS) e a janela (fora do horário de envio de alertas; modo piloto `ACC_OUTBOUND_MODE` diferente de `production` durante todo o processo).

## 3. Google Workspace (principal)

### 3.1 SPF

Registro TXT na raiz (`axion.com.br`; no painel do registro.br o "nome" costuma ficar vazio ou `@`):

```
Tipo: TXT   Nome: @   Valor: "v=spf1 include:_spf.google.com ~all"
```
Começar com `~all` (softfail). Migrar para `-all` somente depois de 2 a 4 semanas sem falhas legítimas nos relatórios DMARC. Se já existir TXT `v=spf1` (hoje não há), EDITAR o existente (um só SPF).

### 3.2 DKIM

1. Admin do Google Workspace > Aplicativos > Google Workspace > Gmail > Autenticar e-mail > selecionar `axion.com.br` > "Gerar novo registro" (2048 bits; seletor padrão `google`).
2. Publicar o TXT indicado pelo Admin, no formato:
   ```
   Tipo: TXT   Nome: google._domainkey   Valor: "v=DKIM1; k=rsa; p=<chave pública longa fornecida pelo Admin>"
   ```
   Chaves de 2048 bits excedem 255 caracteres: dividir em várias strings entre aspas dentro do MESMO registro, conforme o painel aceitar.
3. Esperar a propagação, conferir (seção 6) e só então clicar em "Iniciar autenticação" no Admin.
4. Conferir em uma mensagem real enviada: cabeçalho `Authentication-Results` com `dkim=pass header.d=axion.com.br`.

### 3.3 DMARC (monitoramento primeiro)

```
Tipo: TXT   Nome: _dmarc   Valor: "v=DMARC1; p=none; rua=mailto:dmarc-relatorios@axion.com.br; fo=1; adkim=r; aspf=r; pct=100"
```
Hoje: `v=DMARC1;p=none;` sem `rua`. Acrescentar `rua` e manter `p=none` por 2 a 4 semanas; analisar os relatórios agregados (remetentes, alinhamento SPF e DKIM). Depois: `p=quarantine; pct=10` e subir gradualmente; `p=reject` apenas se os relatórios mostrarem alinhamento de TODOS os remetentes legítimos. Se a caixa de relatórios for de outro domínio, o domínio receptor precisa publicar o registro de autorização (`axion.com.br._report._dmarc`); preferir caixa no próprio domínio.

### 3.4 MX (opcional)

MX único (`1 aspmx.l.google.com`) funciona; a lista padrão do Google com prioridades (`aspmx.l.google.com` 1, `alt1.aspmx.l.google.com` 5, `alt2.aspmx.l.google.com` 5, `alt3.aspmx.l.google.com` 10, `alt4.aspmx.l.google.com` 10) dá redundância. Não altera SPF/DKIM/DMARC; decisão do Dono.

## 4. Microsoft 365 / Exchange Online (somente se for enviar por Microsoft)

Aplicável apenas se o domínio `axion.com.br` for adicionado ao tenant Microsoft e houver remetentes lá (hoje não há caixa Exchange do domínio; as caixas são Google).

- **SPF**: unir ao registro único, não criar um segundo: `v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all`.
- **DKIM**: no portal de segurança (Microsoft Defender > E-mail e colaboração > Políticas > DKIM) selecionar o domínio; criar os 2 CNAME e ativar:
  ```
  Tipo: CNAME  Nome: selector1._domainkey  Valor: selector1-axion-com-br._domainkey.<tenant>.onmicrosoft.com
  Tipo: CNAME  Nome: selector2._domainkey  Valor: selector2-axion-com-br._domainkey.<tenant>.onmicrosoft.com
  ```
  `<tenant>` é o nome do tenant (o conector enxerga `teleconferencia.onmicrosoft.com`; confirmar o valor exato no portal antes de usar).
- **DMARC**: o mesmo registro único `_dmarc` do passo 3.3 (um por domínio).
- MX só muda se as caixas forem migradas (não faz parte deste plano; ver o achado de `crm@axion.com.br` em `docs/outlook-*.md`, frente H3).

## 5. Plano de execução e critérios

| Passo | Responsável | Verificação | Parada |
|---|---|---|---|
| 0 Inventário | TI + Dono | lista de remetentes assinada | remetente desconhecido: não publicar `-all` |
| 1 SPF `~all` | TI | `nslookup -type=TXT axion.com.br` mostra um único `v=spf1`; cabeçalho `spf=pass` | dois registros SPF ou mais de 10 consultas |
| 2 DKIM | TI | `nslookup -type=TXT google._domainkey.axion.com.br`; `dkim=pass header.d=axion.com.br` em mensagem real | `dkim=fail`: não ativar a autenticação; revisar o TXT |
| 3 DMARC `p=none` + `rua` | TI | `nslookup -type=TXT _dmarc.axion.com.br`; relatórios chegando | sem relatórios em 7 dias: revisar `rua` |
| 4 Análise (2 a 4 semanas) | TI + Eng | todos os remetentes legítimos alinhados | remetente legítimo falhando: corrigir antes de endurecer |
| 5 `quarantine` gradual / `reject` | Dono decide | taxa de falha de alinhamento ~0 | qualquer perda de e-mail legítimo: voltar ao passo anterior |
| 6 Homologação de envio | Eng | mensagens de teste em modo piloto (allowlist) para uma conta Gmail e uma Outlook: `spf=pass`, `dkim=pass`, `dmarc=pass`; respostas por e-mail aceitas pelo ACC (autenticação lida no `Authentication-Results` de `mx.google.com`) | falha em qualquer um |

Reversão (cada passo é um registro DNS): remover/editar o TXT/CNAME publicado; TTL baixo (300 s) durante a janela facilita reverter; guardar o valor anterior de cada registro antes de mudar. Sem relatórios DMARC não endurecer.

## 6. Conferência pública (somente leitura)

```
nslookup -type=TXT axion.com.br
nslookup -type=TXT google._domainkey.axion.com.br
nslookup -type=TXT _dmarc.axion.com.br
nslookup -type=MX axion.com.br
```
PowerShell: `Resolve-DnsName -Type TXT _dmarc.axion.com.br`. Também úteis: Google Admin Toolbox (Verificar MX / Cabeçalho de mensagem). O seletor DKIM real vem do Admin do Workspace; se não for `google`, usar o indicado.

## 7. Relação com as travas do ACC

SPF/DKIM/DMARC corretos são pré-requisito (critério B3 em `06`) para avaliar a abertura do envio real; a abertura em si continua dependendo de decisão do Dono (`ACC_OUTBOUND_MODE=production`, flags de envio) e NÃO faz parte deste documento. Confirmação de destinatário externo (uso único), aprovação por perfil e a ANÁLISE automática de e-mails recebidos/enviados são independentes do DNS.

## 8. O que NÃO foi feito

Nenhum DNS alterado; os valores `p=...` de chave, `<tenant>` e a caixa de relatórios são exemplos; o estado atual do DNS foi herdado de `04` (consulta pública de 20 e 21/11/2026), não reconsultado nesta fase; a existência de outro seletor DKIM não foi descartada.
