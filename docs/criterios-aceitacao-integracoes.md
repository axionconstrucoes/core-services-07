# Fase 7 / H6c — Matriz de aceite das integrações (e-mail, contatos, Experts)

Data: 21/11/2026 · Todos os testes abaixo foram EXECUTADOS em 21/11/2026 (`node --import ./scripts/lib/block-live-ai.mjs <teste>`), todos verdes.
Legenda: SATISFEITO = provado por teste automatizado (lógica real, dados sintéticos); SATISFEITO-FIXTURE = provado só com fixtures/transporte
falso; LACUNA = não provado (menor ajuste indicado). Contagem = verificações `OK` do script. Os testes `*-realpg` (Postgres real) estão na
lista de testes e rodam no runner local; não foram reexecutados nesta frente.

| # | Critério | Teste(s) (contagem) | Status | Observação |
| --- | --- | --- | --- | --- |
| 1 | Clientes finais | `test-f5-b-classificacao-email.mjs` (25: casos 1, 10, 28, 24) e `test-f5-c-contatos.mjs` (11) | SATISFEITO | Oficialidade do cliente, reclamação como INDÍCIO; encaminhamento interno não vira oficial do cliente. |
| 2 | Gerenciadoras contratualmente designadas | `test-f5-b-classificacao-email.mjs` (casos 2, 3, 4, 4b, 4c) e `test-f5-g-pipeline.mjs` (15) | SATISFEITO | Dentro da delegação (RNC/OS) versus fora da competência; oficialidade não é poder de alterar contrato. |
| 3 | Fornecedores e subcontratados | `test-f5-b-classificacao-email.mjs` (casos 5, 5b, 6, 7, 8, 9, 19) | SATISFEITO | Atraso, cancelamento, reajuste, renegociação, paralisação; sem OC conhecida vira SEM DADOS. |
| 4 | Domínio WEG (weg.net) e subdomínios | `test-f5-a-monitoramento.mjs` (19) e `test-f5-g-pipeline.mjs` (caso `@weg.net`) | SATISFEITO (coleta e classificação) | `sub.weg.net` entra; `evilweg.net` e `weg.net.exemplo` são excluídos. Ressalva de desenho, não lacuna: a resolução de contato por domínio é por casamento exato (`test-f5-c-contatos.mjs`); subdomínio só é "conhecido" se registrado na organização. Cobertura real do Gmail: docs/relatorio-cobertura-gmail.md. |
| 5 | Mensagens oficiais | `test-f5-b-classificacao-email.mjs` (casos 1, 4, 28) e `test-f5-d-email-alerts.mjs` (12) | SATISFEITO | NOTIFICACAO_OFICIAL sem reconhecer procedência. |
| 6 | Descoberta automática de contatos | `test-f5-g-pipeline.mjs` (contato novo vira candidato UMA vez) e `test-f5-c-contatos.mjs` (CANDIDATE não é conhecido) | SATISFEITO | Candidato nunca ganha autoridade; confirmação humana por RPC (`test-f5-c-contatos-realpg.mjs`). |
| 7 | Riscos nos quatro pilares | `test-f6-h2b-sinais-pilares.mjs` (11), `test-f5-b-classificacao-email.mjs` (casos 29 e 30) | SATISFEITO | Pilares: PRAZO, CUSTO, SEGURANÇA, QUALIDADE; Jurídico e Comercial são áreas, não pilares. |
| 8 | Especialistas específicos | `test-lote4-experts.mjs` (25), `test-quality-insurance-experts.mjs` (36), `test-experts-engineering-routing.mjs` (23), `test-f6-h2c-experts-qualidade.mjs` (12), `test-f7-experts-ia-real.mjs` (10) | SATISFEITO-FIXTURE | Provedor fake; 7 Experts independentes, roteamento por área/assunto, rótulo SIMULADA. Resposta de IA real NÃO provada (docs/experts-ia-real-verificacao.md). |
| 9 | Ações de e-mail auditáveis | `test-f5-d-email-alerts.mjs` (itens 5 a 9: quatro ações em 10 áreas) e `test-lote4-experts.mjs` (4.1 a 4.5, trilha) | SATISFEITO | Entrega provada só com transporte falso (SATISFEITO-FIXTURE para envio real). |
| 10 | Nenhum encerramento indevido de RNC, garantia ou sinistro | `test-f5-d-email-alerts.mjs` (item 9), `test-f4b-garantias-seguros.mjs` (13: F4-B-01 e 03), `test-quality-insurance-experts.mjs` (casos 27, 28, 32) | SATISFEITO | RESOLVIDO encerra só o caso/ação SLA; garantia só encerra com aceite COMPROVADO; minutas nunca são enviadas. |

Resultado: nenhuma LACUNA encontrada; nenhum ajuste de código foi necessário. Pendências que não são lacunas de teste, e sim de homologação
real: IA real dos Experts (docs/experts-ia-real-verificacao.md), entrega real de e-mail e defasagem do Gmail (H6b).
