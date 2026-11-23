# 36 - Reconciliação da CAIXA-1 (Gmail) para o piloto WEG

Fonte: cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC), somente leitura, por agregados (sem corpo de mensagem, sem endereços). Os números do Gmail vêm do registro de auditoria das execuções (`audit_log_entries`). **Nenhum APPLY foi repetido e nenhum cursor foi tocado nesta reconciliação.**

## 1. Histórico das execuções (14 registros de auditoria; 13 execuções do workflow manual)
| Data | Modo | Janela | Resultado |
|---|---|---|---|
| 20/08 (2 execuções do script legado) | APPLY | janela da configuração | 364 e depois 116 inseridas (480 no total), 364 duplicadas, rejeitadas 524 e 440 |
| 11/11 11:03 | DRY-RUN | 11/05/2025 a 11/11/2026 | 890 candidatas, 219 já existentes, 642 rejeitadas |
| 11/11 11:10 e 11:16 | APPLY | 01/12/2025 a 11/11/2026 | 599 candidatas; 10 inseridas e depois 0 (idempotência confirmada); 370 rejeitadas |
| 11/11 11:24 | APPLY | 11/05/2025 a 11/11/2026 | 890 candidatas; **19 inseridas**; 229 existentes; 642 rejeitadas |
| 21/11 (janelas de teste de 1 a 18 h) | DRY-RUN e APPLY | 08/06 e 18/11 | 4 e 1 candidatas; 2 e 1 inseridas; 0 rejeitadas |
| 23/11 (execução 13) | DRY-RUN | 22/05/2025 a 22/11/2026 | **concluída com sucesso; contagens por mês ainda não lidas** (o log não abre no navegador) |
Não há "checkpoint por mês": o backfill é por janela fixa, idempotente por (projeto, provedor, caixa, id); o "fim congelado" impede reexecutar o mesmo início com outro fim.

## 2. Conciliação dos números de 11/11
- 890 = 229 (já existentes antes do APPLY final) + 19 (inseridas) + 642 (rejeitadas pelo perímetro). **Fecha.**
- **A diferença de 29** entre os 219 do dry-run e os 248 depois = **10 + 19 inseridas** pelos dois APPLY de 11/11. No banco: 29 mensagens criadas em 11/11, todas IN_SCOPE, INBOUND, obra WEG, com corpo.
- Mais 3 mensagens criadas em 21/11 (janelas de teste), todas IN_SCOPE com corpo.
- O banco tem 681 mensagens da CAIXA-1 (480 do lote de 20/08 + 32 de 11/11 e 21/11 + 169 incrementais). **0 duplicidades** por (provedor, caixa, id da mensagem); 0 sem id.

## 3. Rejeições: o que se sabe e o que não se sabe
- As **642 rejeitadas não são gravadas**; o script conta por domínio e por escopo mas, no banco, só ficam as contagens do registro. **Não é possível, hoje, listar os motivos individuais.**
- **Alerta de validade:** o dry-run de 890/642 foi executado em 11/11 11:03 **antes** de duas mudanças da regra do perímetro (11/11 11:46-11:47, para um remetente confirmado e depois todos os remetentes `weg.net`; 21/11, qualquer participante From/To/Cc/Bcc e subdomínios). **Esses 642 foram avaliados com uma regra superada** e não são comparáveis com a regra vigente: parte pode passar a ser elegível. A execução 13 usa a regra vigente.
- Preservadas no banco: 389 mensagens OUT_OF_SCOPE (motivo "sem evidência suficiente de vínculo", exclusão auditada, corpo conservado) e 292 IN_SCOPE (244 com vínculo confirmado, 48 sem motivo gravado: a conferir).

## 4. Disponível para análise no ACC
| Item | Quantidade |
|---|---|
| Mensagens da CAIXA-1 | 681 (513 recebidas, 168 enviadas) |
| Elegíveis (IN_SCOPE) | 292, mais 32 sem caixa de origem, também IN_SCOPE |
| Com corpo gravado | 631 de 681 |
| Meses com dados | 09/2025 a 11/2026 (05 a 08/2025: nenhuma mensagem) |
| Anexos | 573 (153 processados, **420 pendentes**, 333 deles em mensagens elegíveis) |

Mensagens por mês (CAIXA-1): 09/2025: 2; 10: 11; 11: 6; 12: 10; 01/2026: 54; 02: 67; 03: 71; 04: 60; 05: 57; 06: 74; 07: 58; 08: 78; 09: 91; 10: 39; 11: 3.

## 5. Conclusões e pendências
1. Os APPLY anteriores produziram registros **válidos e sem duplicidade**; reexecutar é seguro (idempotente), mas **não foi feito**.
2. Antes de qualquer novo APPLY: ler os números por mês da execução 13 (regra vigente) e comparar com as 681 armazenadas. Pendência: obter o log (download do arquivo de log ou leitura somente leitura da linha de auditoria; **aguarda decisão**).
3. 05 a 08/2025 vazios nas duas fontes (banco e dry-run de 11/11 desde 11/05): provável ausência real na caixa; a confirmação depende da execução 13.
4. 48 mensagens IN_SCOPE sem motivo gravado: investigar a origem.
5. Os 6 colaboradores sem caixa e o Outlook seguem NÃO CONECTADOS.
