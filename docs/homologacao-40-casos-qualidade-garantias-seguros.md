# Homologação local — 40 casos (Qualidade, Garantias, Seguros e Sinistros)

Gerado em 20/11/2026 sobre `integration/acc-noturna`. Tudo local: nenhuma migration aplicada ao Supabase operacional, nenhuma IA real, nenhum e-mail, aviso ou endosso real enviado.

## Níveis de prova

- **BANCO**: Postgres 17 real local (`test-quality-realpg`: 30 OK; `test-insurance-realpg`: 19 OK), com replay de todas as migrations em base descartável.
- **DOMÍNIO**: funções puras (`test-quality-domain` 20 OK; `test-insurance-domain` 20 OK; `test-quality-insurance-experts` 36 OK).
- **UI-ESTÁTICO**: análise do código das telas e actions com cliente simulado (`test-quality-ui` 17 OK; `test-garantias-ui` 18 OK; `test-seguros-ui` 27 OK; `test-pilares-dashboard` 15 OK; `test-quality-sources-ingestion` 16 OK).
- **CHROME**: navegador real (`test-seguros-browser` 8 OK; `test-help-browser --sweep` 50 OK, 1.490 painéis).

## Matriz

| Caso | Tema | Testes que o nomeiam | Nível |
|---:|---|---|---|
| 1 | Falha estrutural em execução | quality-domain, quality-realpg, quality-sources-ingestion, quality-ui | BANCO + DOMÍNIO |
| 2 | NC em foto do SSMA | idem | BANCO + DOMÍNIO |
| 3 | Reclamação de cliente por e-mail | quality-realpg, quality-ui | BANCO |
| 4 | Reclamação por e-mail AXION | quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 5 | Indício em diário de obra | quality-domain, quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 6 | Relatório de fiscalização | quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 7 | Defeito pós-entrega | garantias-ui, quality-insurance-experts, quality-realpg | BANCO + DOMÍNIO |
| 8 | Pintura | idem | BANCO + DOMÍNIO |
| 9 | Impermeabilização | idem | BANCO + DOMÍNIO |
| 10 | Máquina em garantia | garantias-ui, quality-insurance-experts | DOMÍNIO |
| 11 | Máquina após término contratual | garantias-ui, quality-insurance-experts | DOMÍNIO |
| 12 | Vício oculto | garantias-ui, quality-insurance-experts, quality-realpg | BANCO + DOMÍNIO |
| 13 | Solidez e segurança | idem | BANCO + DOMÍNIO |
| 14 | Ausência de comprovantes de manutenção | garantias-ui, quality-insurance-experts, quality-realpg, quality-sources-ingestion | BANCO |
| 15 | Performance Bond por inadimplemento | insurance-domain, insurance-realpg, seguros-ui | BANCO |
| 16 | Performance Bond por atraso | idem | BANCO |
| 17 | Adiantamento não amortizado | idem | BANCO |
| 18 | Fiança bancária | idem | BANCO |
| 19 | RCC entre subcontratadas | insurance-domain, seguros-ui | DOMÍNIO (sem banco) |
| 20 | Danos à própria obra | insurance-domain, seguros-ui | DOMÍNIO (sem banco) |
| 21 | Segurado incorreto | insurance-domain, insurance-realpg, seguros-ui | BANCO |
| 22 | Beneficiário final não identificado | idem | BANCO |
| 23 | Endosso solicitado e pendente | idem | BANCO |
| 24 | Endosso efetivamente emitido | idem | BANCO |
| 25 | Aviso de sinistro | idem | BANCO |
| 26 | Expectativa de sinistro | insurance-realpg (CASO 25/26/27/28 agrupados), insurance-domain, seguros-ui | BANCO |
| 27 | Regulação | insurance-realpg (CASO 25-28 agrupados: linha do tempo completa), insurance-domain, seguros-ui | BANCO |
| 28 | Negativa de cobertura | insurance-realpg (negativa e contestação), insurance-domain, quality-insurance-experts, seguros-ui | BANCO |
| 29 | Apólice ausente | insurance-domain, insurance-realpg, quality-insurance-experts, seguros-ui | BANCO |
| 30 | Seguradora indisponível | + quality-sources-ingestion | BANCO |
| 31 | Usuário sem autorização | garantias-ui, insurance-realpg, quality-realpg, seguros-browser e outros | BANCO + CHROME |
| 32 | Envio real bloqueado | insurance-domain, insurance-realpg, seguros-ui, quality-sources-ingestion | BANCO |
| 33 | Dados insuficientes | 10 testes (quality, insurance, garantias, pilares, seguros) | BANCO + DOMÍNIO |
| 34 | Impactos simultâneos nos 4 pilares | pilares-dashboard, quality-domain, quality-realpg, quality-ui | BANCO + DOMÍNIO |
| 35 | RNC com encerramento indevido | idem | BANCO + DOMÍNIO |
| 36 | Reabertura de RNC | quality-domain, quality-realpg, quality-ui | BANCO |
| 37 | Auditoria | insurance-realpg, quality-realpg, seguros-ui, quality-ui, insurance-domain | BANCO |
| 38 | Concorrência | 8 conexões simultâneas: exatamente uma vence (insurance-realpg, quality-realpg); UI com conflito de versão (seguros-browser) | BANCO + CHROME |
| 39 | Isolamento entre projetos | insurance-realpg, quality-realpg (RLS + FK composta), demais por análise estática | BANCO |
| 40 | Regressão completa do ACC | `test:scripts` 1.606 OK (98+ scripts), `test:sql` 677, `test:email` 753, `test:alerts` 519, `test:ssma` 186, `test:alert-sim` 62, lint, `tsc`, build, Chrome 50/50 | REGRESSÃO |

## Limites que esta matriz NÃO esconde

- **Casos 19 e 20 (RCC, danos à própria obra)** têm prova só no domínio: a análise é checklist e regra, não há tabela de respostas (o checklist RCC não é persistido).
- **Casos 25 a 28** estão agrupados em um único teste de banco real (`insurance-realpg`), com a máquina de estados completa (expectativa só com base contratual da própria apólice, aviso, reclamação, regulação, negativa, contestação, decisão, indenização, encerrado).
- **Casos 10 e 11 (máquina)**: a conclusão é derivada por regra a partir de sinais preenchidos por humano; não há IA real nem fatos reais por trás, e o banco só constata fatos (não conclui exclusão de garantia).
- **Nenhum caso foi executado com IA real** nem com dados operacionais. A triagem usa provedor simulado, desligado por padrão.
- **Telas de Qualidade, Garantias e Pilares não foram exercitadas em sessão autenticada** com Supabase real; a verificação é estática, com cliente simulado e, no módulo de Seguros, harness Chrome com stubs.
- **Isolamento entre projetos** está provado em banco real para as tabelas de Qualidade e Seguros; nas telas, por análise estática (filtro por `project_id`, sem service role).
- **Vigência e texto oficial** de Lei 15.040/2024, Circular SUSEP 662/2022, NBR 14037 e NBR 15575 não foram confirmados no texto oficial; os testes verificam que o sistema declara isso, não que as normas estejam aplicadas corretamente. Exige parecer jurídico humano.
