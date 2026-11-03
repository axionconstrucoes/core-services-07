# Teste controlado de alertas críticos — projeto de exemplo ("Obra Exemplo – Ambiente de Teste")

Resultado: **aprovado em ambiente isolado**; **nada foi criado, alterado ou enviado em produção**.
Os nomes de projeto, pessoas e contagens abaixo são exemplos: descrevem o método, não dados reais.

## O que foi real e o que foi simulado
| Item | Real | Simulado |
|---|---|---|
| Projeto | Existência e matriz SLA críticas do projeto de teste confirmadas por leitura | O teste rodou numa **cópia isolada** (banco descartável) com o mesmo nome e a mesma matriz SLA crítica; dados fictícios |
| Envio de e-mail | **5 e-mails reais**, todos para a caixa institucional de teste (`crm@axion.com.br`), pelo provedor Gmail em modo piloto | — |
| Banco / registros | — | Banco descartável (descartado ao final) |
| Relógio | — | Prazos deslocados no banco isolado (lembrete +24 h, SLA +10 min / +75 min / +4 h). Nada global foi alterado |
| Voz | — | (outra frente) |

## Proteções usadas antes de cada envio
1. Leitura do código: em modo piloto o destino efetivo é **sempre** a caixa institucional de teste (constante), com assunto `[TESTE CONTROLADO] …`, para alerta inicial, lembrete, escalonamento e qualquer outro e-mail; `ACC_PILOT_RECIPIENT` ausente ou diferente **bloqueia** o envio.
2. Prova antes de enviar: 5 destinatários pretendidos diferentes → todos resolvem para a caixa de teste.
3. Trava opcional `ACC_EMAIL_ONLY_RECIPIENT`: recusa qualquer outro destino antes de rede; o log do servidor confirmou "destino efetivo conferido" nos 5 envios.
4. Servidor de teste apontado para o banco descartável (as 3 variáveis do Supabase remoto foram sobrescritas); produção não foi tocada. Um erro (ver abaixo) mostrou que o isolamento funcionou: nenhum lote foi criado.

## Sequência e resultados
Participantes de exemplo: Responsável A, Gerente B, Diretoria C e um administrador de teste.

| # | Passo | Resultado |
|---|---|---|
| 1 | Alerta inicial (evento `[TESTE] …`, risco crítico) enviado pela tela do evento | Lote `SENT`, acompanhamento aberto (responsável A), 1º lembrete previsto em 24 h; destino pretendido → efetivo na caixa de teste |
| 2 | Abrir o link do e-mail (GET) | Não registra nada (estado idêntico) |
| 3 | EM ANDAMENTO (confirmação explícita) | Registrado: autor = quem está logado (administrador de teste); responsável continua A; lote → `RESPONDED`; reabrir o link mostra "já foi respondido" |
| 4 | Lembrete (relógio +24 h) | Enviado à caixa de teste (e-mail real nº 2); idempotente (2ª execução imediata: 0); continua EM ANDAMENTO; próximo +24 h |
| 5 | ENVIADO P/ (A → B) | Responsável trocado; **prazo não reiniciou**; nenhum e-mail no ato; histórico `FORWARDED` com autor |
| 6 | Lembrete ao novo responsável | Pretendido B → efetivo caixa de teste (e-mail real nº 3) |
| 7 | Quem não é responsável nem administrador (A) abre o link | "Este link não existe ou seu usuário não tem acesso" — sem botão; nada alterado |
| 8 | RESOLVIDO (administrador, pelo link) | `RESOLVED`, próximo lembrete vazio, autor registrado |
| 9 | 2 execuções do ciclo de lembretes depois | 0 enviados, 0 lotes novos — **lembretes interrompidos** |
| 10 | Escalonamento crítico (ação SLA `[TESTE]`, ENGENHARIA): antes do prazo | Nada escala (0 e-mails) |
| 11 | +10 min após o prazo de assumir | `RESPONSAVEL → ESCALAO_1` (Nível 2, Gerência — B): e-mail real nº 4 |
| 12 | +75 min | `ESCALAO_1 → DIRETORIA` (C): e-mail real nº 5 |
| 13 | +4 h | Limite atingido; **sem novo e-mail**; histórico final registrado |

Critérios do escalonamento crítico (matriz CRITICAL do projeto de teste): relógio corrido; **1 h** para assumir; Nível 2 após vencer; Diretoria **+1 h** (regra genérica; uma regra por área pode definir prazos maiores); limite da Diretoria **+2 h** (os "+4 h" do passo 13 são a soma acumulada 1 + 1 + 2 h desde a abertura). O escalonamento é disparado pelo botão "Verificar escalonamentos" e pelo ciclo horário dos alertas de risco (depende de `ACC_WEEKLY_REPORTS_ENABLED`).

## Defeito encontrado e corrigido durante o teste
Numa rodada anterior, o contexto da AXIA foi inserido por engano no `insert` de duas tabelas (lote de alertas e notificação de ação) em vez da chamada de envio; isso faria falhar **lotes semanais e lembretes** (coluna inexistente). O teste real pegou na primeira tentativa de lembrete (nenhum e-mail saiu e nenhum lote foi criado); a correção moveu o campo para a chamada de envio e o teste de inventário agora verifica o lugar do campo.

## Identidade ao responder pela caixa de teste
A ação por link exige **login no ACC**; o autor registrado é a pessoa logada (`auth.uid()`), não o endereço da caixa institucional. Quem monitora essa caixa precisa de conta ativa na obra: administrador (pode agir sobre qualquer alerta) ou o responsável atual. O responsável do alerta é um campo separado (`alert_followups.responsible_user_id`). Resposta por e-mail (Reply-To) só vale para conversas de alertas de risco com a caixa de entrada configurada; não foi exercitada.

## Execução em produção (não feita)
Exigiria uma sessão autenticada de administrador na produção e conviveria com os registros e rotinas vivos do projeto (ações SLA e casos de risco abertos, lembretes a cada 30 min, motor horário de risco). Alternativa segura: repetir os passos acima pela tela com um evento `[TESTE]` novo e encerrá-lo com RESOLVIDO; só após aval explícito.

## Encerrar os registros de teste
Nada foi gravado em produção. O banco isolado e o servidor de teste foram descartados. Os 5 e-mails na caixa de teste podem ser arquivados; os links deles apontavam para `localhost` (ambiente isolado já encerrado) e não funcionam mais.
