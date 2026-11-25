# 26 - SLA aplicado à WEG x valores definitivos aprovados: verificação e efeito operacional

Fonte da verificação: **cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC)**, restaurada em PostgreSQL local descartável. Nada foi consultado nem alterado em produção. Decisão D2 (22/11/2026): a migration irreversível de SLA `20261121177000` **permanece adiada**.

## 1. Verificação: os valores são diferentes
Obra WEG (código `AXION-DEV-001`; no banco aparece como "[DEV] WEG - Fábrica de Fios - Linhares"). Regras **ativas** da matriz (`sla_matrix_rules`), prazo para **assumir**:

| Risco | Unidade | Aplicado hoje na WEG | Definitivo aprovado | Igual? |
|---|---|---|---|---|
| CRÍTICO | horas corridas | 1 | 1 | sim |
| ALTO | horas úteis | 4 | 4 | sim |
| MÉDIO | dias úteis | **1** | **2** | **não** |
| BAIXO | dias úteis | **3** | **5** | **não** |

Intervalos de escalonamento (Nível 2 / Diretoria), em unidades do risco:

| Risco | Aplicado hoje | Aprovado | Igual? |
|---|---|---|---|
| CRÍTICO | +1 / +2 | +1 / +2 | sim |
| ALTO | +4 / +4 | +4 / +4 | sim |
| MÉDIO | +1 / +1 | +1 / +1 | sim |
| BAIXO | +3 / +2 | +3 / +2 | sim |

Só o **prazo para assumir** de MÉDIO e BAIXO difere; todo o resto coincide. Há uma regra ativa por nível (0 duplicidades ativas; as duplicatas históricas de CRÍTICO e ALTO estão inativas).

## 2. Efeito operacional da diferença
Linha do tempo acumulada (dias úteis, a partir da criação da ação):

| Risco | Assumir | Nível 2 | Diretoria |
|---|---|---|---|
| MÉDIO aplicado hoje | 1 | 2 | 3 |
| MÉDIO aprovado | 2 | 3 | 4 |
| BAIXO aplicado hoje | 3 | 6 | 8 |
| BAIXO aprovado | 5 | 8 | 10 |

1. **O sistema é mais exigente do que o aprovado**: o responsável tem 1 dia útil a menos em MÉDIO (50%) e 2 a menos em BAIXO (40%) para assumir, e os marcos de escalonamento chegam 1 e 2 dias úteis mais cedo. **Nenhum alerta é tratado com mais folga do que a política permite.**
2. **CRÍTICO e ALTO**, os que importam para a segurança do piloto, **não mudam**.
3. **Alcance prático no piloto:** no código de planejamento de alertas (`plan-risk-alerts.ts`), LOW e MEDIUM **nunca geram e-mail individual**: entram só no consolidado semanal. Portanto, a diferença afeta principalmente quando a ação aparece como **vencida** (painéis, lista de ações e resumo semanal) e quando a varredura de escalonamento a considera. Além disso, enquanto a trava de saída do piloto estiver ativa, os e-mails vão só para o destinatário de teste (no código a trava é fail-closed: apenas o valor exato `production` em `ACC_OUTBOUND_MODE` libera os destinatários originais). O valor atual dessa variável em produção está cifrado na Vercel e **não foi lido**; conferi o comportamento pelo código e pelo teste `test-pilot-outbound-guard`.
4. **O que não reverifiquei no código:** se o ciclo automático de escalonamento inclui MÉDIO e BAIXO. O texto aprovado da AXIA diz que "no ciclo automático, só Alto e Crítico sobem por prazo"; a varredura manual ("Verificar escalonamentos") considera todas as ações abertas (`docs/sla-escalation.md`). A diferença de efeito por esse caminho deve ser conferida na aceitação (doc 20, bloco F).
5. **Ações já abertas não mudam, qualquer que seja a decisão.** Há 9 ações MÉDIO/BAIXO abertas (6 MÉDIO e 3 BAIXO; 8 `PENDING` e 1 `ESCALATED`). Todas foram criadas entre 28/08 e 09/10/2026 e **todas já estavam vencidas** no backup (prazos entre 02/09 e 10/10). O prazo é gravado na criação e nunca é recalculado ao editar a matriz (confirmado no código: `assume_due_at` só é escrito no `INSERT`).
6. **Área Qualidade:** a onda L cria 4 regras **novas** da área QUALIDADE com os valores aprovados (MÉDIO 2 e BAIXO 5; CRÍTICO e ALTO nunca mais frouxos que a regra geral). Isso gera uma diferença **entre áreas** na mesma obra (WEG geral 1/3; Qualidade 2/5). Efeito prático no go-live: nulo, porque o módulo de Qualidade está parcialmente bloqueado.

## 3. Por que manter adiada é correto para o go-live
- É o lado conservador da diferença (mais cedo, não mais tarde).
- A migration é prospectiva, não recalcula nada e pode ser aplicada depois, em janela própria, com o mesmo efeito.
- Aplicá-la agora acrescentaria uma alteração irreversível por script (a reversão exige reconstruir as regras) a uma janela que já altera 69 migrations.
- A AXIA, a ajuda das telas e o manual **não afirmam 2 e 5**: Médio e Baixo remetem à matriz da obra (decisão técnica, item 5 do plano).

## 4. Quando reabrir a decisão
Se o Dono preferir que a WEG siga a política aprovada (2 e 5), aplicar `20261121177000` depois do go-live, em janela própria, com o doc 19 (seções 3 e 8). Até lá, informar a equipe da WEG de que **MÉDIO vale 1 dia útil e BAIXO 3 dias úteis** (é o que a aceitação mede, doc 20, bloco F).

## 5. Como reproduzir (somente leitura, em cópia local do backup)
```sql
select p.code, r.risk_level, r.time_unit, r.assume_deadline_value, r.escalation_2_after_value, r.board_after_value
  from public.sla_matrix_rules r join public.projects p on p.id = r.project_id
 where p.code = 'AXION-DEV-001' and r.active order by r.risk_level;
select risk_level, status, created_at::date, assume_due_at::date from public.sla_actions
 where risk_level in ('LOW','MEDIUM') and status not in ('COMPLETED','CANCELLED') order by 1, 3;
```
