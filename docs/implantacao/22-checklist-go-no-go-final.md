# 22 - Checklist GO/NO-GO final da publicação do piloto WEG

Substitui, para a janela de publicação, o checklist por bloco do `06` (que continua como histórico). Papéis: **Dono** = diretoria AXION (aprova); **Eng.** = engenharia/TI do ACC (executa); **Área** = responsável da área que valida o bloco (SSMA, Jurídico, Planejamento, Qualidade). Regra de decisão: **qualquer "NÃO" nos blocos marcados P0 (P0, segurança, dados, isolamento) é NO-GO imediato**; os demais são condicionais, com decisão do Dono.

Status em 22/11/2026: **PRONTO** = evidência existe e foi conferida; **PENDENTE** = depende de ação ainda não feita; **DECISÃO** = depende exclusivamente do Dono.

## G0 - Decisões do Dono (indispensáveis)
| # | Decisão | Recomendação | Status |
|---|---|---|---|
| D1 | Registro do histórico: (b) pela versão do arquivo, atômico, via executor | (b) (doc 19, seção 2) | DECISÃO |
| D2 | Migration de SLA `20261121177000`: manter adiada no go-live | manter adiada (doc 19, seção 3) | DECISÃO |
| D3 | Data e hora da janela (60 min de manutenção, ACC sem uso) e se o congelamento de escrita é aplicado | aplicar | DECISÃO |
| D4 | Criar o token pessoal do Supabase e autorizar o ensaio do transporte do executor no homolog | autorizar (ou escolher a alternativa `psql`) | DECISÃO |
| D5 | Flags de produção: `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` no go-live; pipeline de e-mail em simulação | conforme doc 19, seção 6 | DECISÃO |
| D6 | Autorizar push da branch de integração e abertura do PR (CI) | autorizar; **merge só na janela** | DECISÃO |
| D7 | Designar as pessoas e a data da aceitação com usuários reais | doc 20 | DECISÃO |

## G1 - Código e CI (P0 para o merge)
| Item | Responsável | Evidência | Critério de aprovação | Status |
|---|---|---|---|---|
| PR da integração contra a `main` com revisão | Eng. + Dono | link do PR; doc 21 (mapa de revisão) | revisão feita por área; 0 comentários bloqueantes | PENDENTE |
| CI `ci-pr-checks` verde (guards, typecheck, lint, unitários, scripts, e-mail, SQL, SSMA com Chrome, build) | Eng. | execução do GitHub Actions | todos os jobs verdes; nenhum teste PULADO | PENDENTE (nunca rodou em PR; ver doc 21, seção 4) |
| Nenhuma migration existente alterada | Eng. | 0 blobs da `main` ausentes; 7 renomeações R100; 69 novas | confirmado no diff | PRONTO |
| Sem segredos/`.env`/script de envio real versionado | Eng. | job `guards` da CI + testes locais | passa | PRONTO local |

## G2 - Banco: backup, ensaio e recuperação (P0)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Ensaio das 14 ondas em cópia de produção | Eng. | `14c` (70 itens, P0 ok em cada onda, hash do histórico por onda) | 70 aplicados, 0 falhas, P0 `930f6d75...` | PRONTO |
| Dados de produção intactos no ensaio | Eng. | contagens das 130 tabelas pré-existentes; 9 ações de SLA com mesmo hash | só `sla_matrix_rules` (+4 QUALIDADE) e auditoria mudam | PRONTO |
| Backup lógico e de Storage de produção na véspera e na porta de entrada | Eng. | pastas com `SHA256SUMS`, cópia no disco externo | SHA ok; origem estável durante o dump | PENDENTE (feito em 22/11; refazer) |
| Restauração local do backup de produção | Eng. | `restaurar-validar.ps1` | 13/13 categorias iguais | PENDENTE: 12/13 em 22/11 (`storage_objetos`, ver doc 19, seção 7) |
| Sem PITR: perda possível desde o backup | Dono | decisão registrada | aceita, mitigada por congelamento | DECISÃO |

## G3 - Executor e transporte (P0)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Guardas do executor (produção só com `--producao` e frase digitada) | Eng. | `test-executor-ondas` 36 OK; `test-executor-ondas-realpg` 12 OK | passa | PRONTO |
| Atomicidade (falha no fim, bloco DO, timeout, compensação) | Eng. | ensaio no homolog: 4 OK, histórico igual | passa | PRONTO |
| Transporte via Management API contra API real | Eng. | `--alvo homolog --verificar` e `--ensaio-homolog` com PAT | passa, latência medida | PENDENTE (D4) |

## G4 - Congelamento e trava (P0)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Congelamento aplicado/revertido com fingerprints idênticos | Eng. | homolog: 219/219 gatilhos, 0 escritas; reversão idêntica; falha injetada revertida | passa | PRONTO |
| Worker (`service_role`) segue gravando e usuário é recusado | Eng. | 24/25/24 OK pela API real | passa | PRONTO |
| Trava das 35 RPCs: 280/280 recusas, 6 liberadas | Eng. | `01` (homolog) | passa | PRONTO |
| Alertas por e-mail não afetados pela trava | Eng. | 5 suítes iguais com e sem trava | passa | PRONTO |
| Data API desligada/religada | Eng. | homolog 24 OK/0 FAIL | passa (decisão de usar em produção: D3) | PRONTO |

## G5 - P0, RLS, auditoria (P0)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Corpo de `record_risk_alert_action` = `930f6d75...` antes, durante (por arquivo) e depois | Eng. | executor; ensaios | idêntico | PRONTO (ensaio); executar na janela |
| RLS ativo nas 218 tabelas de `public`; isolamento entre obras | Eng. | homolog e cópia de produção; API real (RLS, JWT) | 0 tabelas sem RLS; usuário sem vínculo não lê | PRONTO |
| Auditoria preservada e imutável | Eng. | `audit_log_entries` só cresce; reversões registradas | sem perda | PRONTO |

## G6 - SLA (P0 para alertas)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Regras da WEG intactas após as ondas | Eng. | cópia de produção: 6 regras existentes iguais | iguais | PRONTO |
| Prazos CRÍTICO 1 h / ALTO 4 h úteis / MÉDIO 1 d.u. / BAIXO 3 d.u. na WEG | Dono + Área | doc 19, seção 3.2 | confirmados pelo Dono | DECISÃO (D2) |
| AXIA não afirma 2/5 | Eng. | testes da AXIA | passa | PENDENTE (agente em andamento; doc 21) |

## G7 - Aplicativo e Vercel
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Variáveis de produção revisadas (seção 6 do doc 19) | Eng. + Dono | lista conferida antes do merge | todas definidas; defaults inseguros fechados | PENDENTE |
| Banco concluído **antes** do merge | Eng. | fases 3 a 5 do doc 19 | G5 verde | PENDENTE (janela) |
| Rollback do app disponível | Eng. | deployment anterior marcado `isRollbackCandidate` | existe | PRONTO |
| Preview sem credenciais de produção | Eng. | variáveis do Supabase só no alvo `production` | confirmado | PRONTO |

## G8 - E-mail (P0 para envio)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Trava de saída do piloto (`pilot-outbound-guard`) | Eng. | `test-pilot-outbound-guard` 31 OK | passa | PRONTO |
| Nenhum envio real na janela sem autorização do Dono | Dono | decisão registrada; jobs pausados até a fase 7 | respeitado | DECISÃO |
| Pipeline de classificação em simulação | Eng. | flags não definidas | simulação | PENDENTE (D5) |

## G9 - Aceitação com usuários reais
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| Blocos A a K do doc 20 | Áreas + Eng. | formulário preenchido com evidências | todos aprovados; falha P0 = NO-GO | PENDENTE (D7) |

## G10 - Interface
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| AXIA sem detalhes internos e sem prazos de Médio/Baixo afirmados | Eng. | teste de varredura | passa | PENDENTE (em andamento) |
| TopBar azul-marinho e identificação do projeto | Eng. | medição em 360 a 1440 px | sem overflow, contraste >= 4,5:1 | PENDENTE (em andamento) |

## G11 - Módulos bloqueados (P0)
| Item | Responsável | Evidência | Critério | Status |
|---|---|---|---|---|
| RNC e Garantias G-04 a G-10 indisponíveis ao usuário | Qualidade + Eng. | trava aplicada; AXIA e manual dizem "bloqueada" | 35 RPCs com 42501; sem erro cru na tela | PRONTO (mecanismo); PENDENTE na janela |

## G12 - Observação e rollback
Gatilhos de rollback (qualquer um): P0 divergente; falha de job repetida em 2 execuções; erro 5xx contínuo na Vercel; usuário vendo dado de outra obra; e-mail real enviado fora da trava; divergência de contagem de linhas. Decisor: Dono. Procedimento: doc 19, seção 8. Janela de observação: T+2 h a T+24 h.

## Parecer atual
**NO-GO para executar a janela hoje**, por pendências que dependem de ação humana ou de execução na própria janela: D1 a D7, CI do PR, transporte do executor, aceitação com usuários reais, backup e restauração do dia. **Não há defeito técnico conhecido** nos mecanismos ensaiados.
