# Piloto WEG — dados cadastrais definitivos e correção dos rótulos [DEV]

Projeto piloto: ID `00000000-0000-4000-8000-000000000001` (**preservado**, com todo o histórico). Levantamento de 21/11/2026, somente leitura no operacional.
Nenhum valor abaixo foi gravado. Nada foi inventado: cada item tem a sua fonte, e o que é leitura de OCR exige conferência no original assinado.

## 1. Estado atual da ficha (operacional)

| Campo | Valor hoje |
|---|---|
| `code` | `AXION-DEV-001` |
| `name` | `[DEV] WEG - Fábrica de Fios - Linhares` |
| `client` | `Cliente Fictício DEV` |
| `contract_number` | vazio |
| `location` | `Ambiente de Desenvolvimento` |

**Efeito visível:** o nome da obra entra no assunto dos e-mails de alerta (`OBRA <NOME> - CONSOLIDADO DE RISCOS …` e `… - <ÁREA> - <TÍTULO>`), então o "[DEV]" chega aos destinatários.

## 2. Valores candidatos, com a fonte

| Campo | Valor candidato | Fonte | Confiança |
|---|---|---|---|
| Nome da obra | `WEG - Fábrica de Fios - Linhares` | o próprio nome atual sem o prefixo `[DEV]`; confere com o contrato ("Contrato Base - WEG Fábrica de fios"), o aditivo ("WEG LINHARES ADITIVO 01 REV03") e a proposta ("AXN CP 501 WEG LINHARES REV06") | alta |
| Cliente (razão social) | `WEG LINHARES EQUIPAMENTOS ELÉTRICOS S/A` | texto da página 1 do contrato base (partes do instrumento) | **média: leitura de OCR, conferir** |
| CNPJ do cliente | `10.885.321/0001-74` | mesmo trecho; o OCR separou os dígitos ("10.885.321/0001 - 74") | **média: conferir no original** |
| Local | `Linhares - ES` | endereço da contratante no contrato (Rod. Gov. Mário Covas, s/n, km 161,5) | alta |
| Número do contrato | **`PEDIDO 4518243191 - 10055`** (identificação do instrumento "Contrato particular de prestação de serviços") | cabeçalho da página 1 do contrato base | **a confirmar: não é certo que esse seja o "número do contrato" no padrão da Axion** |
| Contratada | `AXN CONSTRUÇÕES E PARTICIPAÇÕES LTDA` | contrato, página 1 | alta |
| Domínio do cliente | `weg.net` (papel CLIENT) | `project_email_ingestion_domains` e identificador de relevância | alta |
| Código interno de projeto | `356-WEG LINHARES` | identificador de relevância `PROJECT_CODE` (força forte) | média: confirmar se é o código oficial |

**O que continua sem fonte:** o número do contrato no formato que a Axion usa (a ficha está vazia, e `PEDIDO 4518243191 - 10055` é o que o texto traz), e qualquer dado de aditivos além do título do documento.

## 3. Correção preparada (NÃO executada)

Arquivo: `scripts/sql/piloto-weg-corrigir-rotulos.sql`.
- Altera **só** `name`, `client`, `contract_number` (se informado) e `location` (se informado) de **uma** linha de `public.projects`. O `code` fica como está, a menos que o responsável peça. Chaves estrangeiras apontam pelo UUID, que não muda.
- **Guarda:** recusa se o projeto não estiver no estado `[DEV]` esperado, se o novo nome tiver `[DEV]`, ou se o novo cliente tiver "fictício" ou "DEV".
- **Simulação por padrão:** termina em `ROLLBACK`. Só grava com `-v commit=1`.
- **Provado em banco descartável:** simulação não grava; gravação altera só os 4 campos mantendo o ID; histórico preservado (710 e-mails, 161 documentos, 43 casos de risco e 25 ações de SLA antes e depois); reexecução e cliente fictício são recusados; outro projeto não é tocado.

**Dependência no código:** `scripts/configure-weg-project-relevance.mjs` tem o nome `[DEV] WEG - Fábrica de Fios - Linhares` fixo (linha 35). Reexecutá-lo **desfaria** a correção. Ajustar essa constante junto com a correção (a decisão e o valor são do responsável).

## 4. Autorizações e conferências necessárias
1. Conferir, no contrato assinado, a razão social, o CNPJ e o número do instrumento que a Axion usa como "número do contrato".
2. Autorizar a execução da correção no operacional, com os valores conferidos.
3. Decidir se o `code` `AXION-DEV-001` muda (recomendação: não, é chave única sem efeito funcional).
4. Ajustar `configure-weg-project-relevance.mjs` junto com a correção.
