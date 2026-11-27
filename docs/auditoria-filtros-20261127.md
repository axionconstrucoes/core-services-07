# Auditoria — correção dos filtros (piloto WEG, 27/11/2026)

Ocorrência de homologação registrada pelo proprietário: os filtros da tela Auditoria
(`/[projectId]/auditoria?tipo=...`) não apresentavam os registros corretos.

## Reprodução (produção, antes da correção)

Projeto WEG `00000000-0000-4000-8000-000000000001`, 4.519 registros em `audit_log_entries`.

| Filtro | Linhas exibidas antes | Observação |
|---|---|---|
| Todos | 1.000 | corte do PostgREST (`max-rows`); nada anterior a 18/11 aparecia |
| Projetos e versões | 36 | continha alterações de cadastro e congelamento de escrita |
| Atas de reunião | 2 | `SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED` ("DATA " casava com "ATA ") |
| Relatórios e RDO | 5 | alertas de risco por palavra no detalhe |
| Medições | 0 | — |
| E-mails | 846 | 824 sincronizações Gmail |
| Ações e SLA | 38 | incluía cancelamento de convites |
| SSMA/ESG | 44 | incluía processamento de documentos |
| Integrações e falhas | 29 | — |

Horários exibidos em UTC (ex.: 15:33 em vez de 12:33 de Brasília). A faixa de supervisão contava
"2 registros de falha" dentro do recorte de 1.000, sem distinguir falhas recuperadas ou antigas.

## Causa raiz

1. `getAuditLog` lia a tabela inteira numa única requisição sem paginação; o PostgREST devolve no
   máximo 1.000 linhas. A classificação e os filtros eram aplicados depois, sobre esse recorte.
2. `classifyLog` usava expressões regulares sobre ação + entidade + **detalhe livre**, com ordem de
   teste arbitrária e substrings ambíguas ("DATA " → ATA; "SSMA" citado em detalhe; "AÇÃO" contido em
   "INFORMAÇÃO", "CONFIGURAÇÃO"); o que não casava caía em "Projetos e versões".
3. `formatDateTime` não define fuso; no servidor (Vercel, UTC) o horário saía em UTC.

RLS, permissões e travas de módulos foram verificadas e não interferem (política
`is_project_member(project_id)`; leitura pelo cliente da sessão).

## Correção

- `apps/web/lib/audit/audit-catalog.ts`: catálogo explícito por código de ação/entidade, com
  identificador da regra; tradução em português de todos os códigos existentes; código sem regra vai
  para **Não catalogados** (filtro exibido quando houver algum) — nunca some. Eventos transversais
  (cadastro, permissões, congelamento de escrita, travas de módulos, termos de conformidade) ganharam a
  categoria **Segurança e permissões**. Toda falha (`_FAILED`, `_UNAVAILABLE`, `_DISCREPANCY`,
  `_ERROR`) fica em **Integrações e falhas**.
- `apps/web/lib/audit/audit-query-core.ts`: filtros de data (dia de Brasília), responsável e
  palavra-chave no banco; varredura leve paginada em blocos de 1.000 para classificar e contar todos os
  registros autorizados; leitura completa só da página (50 por página).
- Faixa de supervisão: falhas agrupadas por ação + entidade, classificadas em ativa (&lt; 24 h, sem
  recuperação), aguardando investigação (24 h–30 dias), recuperada (sucesso posterior da mesma
  entidade) e histórica (&gt; 30 dias), com evidência por ocorrência; o link aplica "Integrações e falhas".
- Tela: "FILTRAR REGISTROS DE AUDITORIA", contagem por filtro, data inicial/final, responsável,
  palavra-chave, limpar filtros, filtros na URL (persistem e acompanham o histórico do navegador),
  estado "Carregando registros…", paginação e "Nenhum registro encontrado para os filtros selecionados.";
  coluna "Data/Hora — Brasília" (UTC original no title; banco inalterado).

Nenhum registro foi alterado ou apagado. Sem migração.

## Outros horários da suíte (registrado, fora do escopo deste PR)

`formatDateTime` (`apps/web/lib/labels.ts`) é usado em 53 arquivos `.tsx` sem fuso explícito; em
componentes de servidor exibe UTC. Correção recomendada em PR próprio: `timeZone: "America/Sao_Paulo"`.

## Rollback

Reverter o merge deste PR (somente código; não há alteração de dados).
