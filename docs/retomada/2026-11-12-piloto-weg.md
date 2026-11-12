# Retomada — piloto WEG (estado em 2026-11-12, fim da tarde)

Documento SANITIZADO (repositório público): sem nomes, e-mails, ids de usuário/caso, segredos ou conteúdo de documentos. Detalhes e evidências completas estão no pacote privado (ver "Onde está o resto").

## Regras vigentes (não mudam sem decisão humana)
- WEG é o piloto; escopo de remetentes @weg.net; histórico, permissões e autorizações preservados.
- `risk_alerts_enabled=false` na WEG; geração recorrente e AXIA desligadas; crons inalterados.
- Nenhuma migration, nenhuma exclusão (exceção única já feita: logs de 1 run do GitHub que expuseram dados), nenhuma ampliação de acesso, nenhum novo apply de recuperação de anexos Gmail.
- Envio único de alerta: **desarmado** (variável `ACC_PILOT_SINGLE_ALERT_CASE_ID` ausente). Não criar o caso de teste nem enviar sem aprovação final do plano.
- Repositório é PÚBLICO: logs de workflows não podem conter nomes, e-mails ou ids.

## PRs (main = 49dc30b quando escrito)
| PR | Assunto | Estado |
|---|---|---|
| #157 | Grupo de entrega das 4 caixas + respostas por identidade própria | mesclado, deploy READY |
| #158–#163, #165–#168, #170–#174 | Matriz, 404 como pendência, diagnóstico/reconciliação de anexos, Construmanager, XLSX, envio único, semanais (diagnóstico) | mesclados |
| #164 | Semanais: abas esperadas (consultivo) | ABERTO, CI verde; merge **negado pelo classificador automático** ("Destructive or Unwanted Actions"); não repetir por outro agente/ferramenta. Ação manual: abrir o PR, conferir diff (3 arquivos), "Squash and merge" |
| #175 | Identificação/exclusão do caso de TESTE + bloqueio de envio tardio | ABERTO, CI verde no HEAD `1f0ae57`; não mesclar sem aprovação |
| #176, #177 | Comparação de fidelidade XLSX (somente leitura) | mesclados (o #176 foi mesclado com o check Build ainda falhando por falha de CI não relacionada; a reexecução passou depois — desvio do processo registrado) |
| #137 | Protocolo de sincronização entre PCs (rascunho antigo) | não avaliado; não usado |

## Concluído e comprovado
- Matriz de fontes em produção (papéis "fornece informação" × "recebe alertas"; coleta atual só para a caixa autenticada pelo coletor OAuth). Validação visual completa e celular: **parcial** (medida por texto/iframe a 390 px; páginas inteiras ultrapassam 390 px por listas "Origem da fonte" do SSMA, não pela matriz).
- Reconciliação das 192 partes de anexos: 157 já recuperadas (hash), 14 duplicadas no mesmo e-mail, 21 bloqueadas por MIME do bucket, 0 ausentes recuperáveis. Falhas do apply coincidem e-mail a e-mail com as bloqueadas (causa inferida, não registrada por parte). Outro apply gravaria 0.
- Documentos: 50 do lote, todos com texto (45 + 5 XLSX corrigidos pelo #167); 12 PDFs com cobertura PARCIAL (45 de 243 páginas ausentes: 38 OCR de baixa confiança, 7 gráficos) — proposta de OCR preparada, nada pago ativado.
- Construmanager: causa de "Sessão não autenticada" comprovada (função de conclusão exige `auth.uid()`; worker usa service_role) e corrigida (#166). Rodada de 10 itens executada: 10 armazenados (24,4 MB), conclusão comprovada no banco. Estado: ARMAZENADO 12, PENDENTE 186, ERRO 1 (item antigo + objeto órfão no Storage, ainda não regularizados), REFERÊNCIA_EXTERNA 4. Nada extraído; DWG/IFC/RVT/NWD são só armazenáveis.
- Semanais: diagnóstico estrutural dos 8 arquivos (run no GitHub, log mascarado). Parser defasado confirmado EM PARTE (Histograma e Curva S passariam a extraídos se reprocessados); Linha de Base continua não reconhecida em layouts antigos. Alias estreito para "resumo financeiro(s)" é só proposta testada.
- Envio único (#168 + #172): dry-run executado e conferido (3 destinatários lógicos, grupo de 4 caixas, nada enviado). Log do run excluído (autorizado) após evidência sanitizada.
- Incremental pós-#162: 1 ciclo com sucesso, 0 mensagens novas ⇒ idempotência com e-mail novo **não** comprovada.

## Fidelidade do extrator XLSX novo (#167)
- O novo lê valores de fórmula que o leitor antigo devolvia vazios (explica 258×196 e similares: 311, 464, 73 e 100 células a mais em 4 arquivos); consistente com os dados, não conferido linha a linha.
- Lacuna ABERTA: 79 células de fórmula com resultado-objeto (provável data calculada) saem vazias no novo (44, 1, 33 e 1 por arquivo) — corrigir e só então reprocessar.
- Células ilegíveis: novo = 0 nos 6 arquivos; as falhas do antigo (265, 313, 32) eram células escravas de mesclagem nulas, sem relevância.
- Os 2 arquivos grandes só o novo lê (o antigo estoura memória).

## Melhorias técnicas comprovadas × dúvidas de conteúdo (semanais)
- Técnicas (comprovadas): extrator XLSX (#167), diagnóstico estrutural (#170), parser atual extrai mais que o gravado em W14–W16, W20 e W34 (reprocessamento aguarda decisão).
- Dúvidas de CONTEÚDO (humanas; não assumir obrigatoriedade): (1) W12–W33: Curva S/Financeiro eram exigidos no modelo da época? (2) W34 um arquivo com 17 abas de outro modelo: é o arquivo correto? (3) W12: "RESUMO FINANCEIROS" corresponde ao Financeiro? (4) W14–W16: aba SSMA era obrigatória/foi enviada em outro arquivo?

## Pendências técnicas
- Item Construmanager em ERRO + objeto órfão: incluir numa rodada futura (precisa aprovação).
- 12 PDFs parciais, 301 imagens, 63 `.mpp`, 56 xlsx semanais sem vínculo/extrator: decisões de OCR/visão/extrator (sem custo ativado).
- Segundo HTTP 404 do worker de atas (e-mail de setembro com 10 anexos já registrados): causa não determinada; registro preservado. 404 original da recuperação (e-mail sem anexos): idem.
- SSMA: faltam `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` no Vercel de produção (escopo mínimo `drive.metadata.readonly` para validar; `drive.readonly` para ler bytes; conta do token membro do Drive compartilhado). Prova real = abrir uma foto SSMA pelo ACC com usuário autorizado. Não preencher variáveis ≠ acesso comprovado.
- Ciclo incremental com mensagens novas ainda não observado.
- Dados públicos: e-mails corporativos dos 4 destinatários estão no código/testes/docs por desenho (#157); descrição do #157 cita os participantes; cache local do `gh` guarda o log excluído (somente nesta máquina).

## Plano do envio único (aguarda aprovação final)
1. Etapa 1 (entrega e identificação): enviar às 4 caixas, 3 mensagens (uma por destinatário lógico da allowlist). Cada participante responde SÓ à mensagem cujo banner mostra o código com os 8 primeiros caracteres do seu usuário (consulte o pacote privado), em texto neutro que o classificador não trata como ação (ex.: "Identificação da caixa que recebeu este teste de entrega do piloto."). Não clicar em botões. Respostas ficam REVIEW_REQUIRED — não provam botões.
2. Etapa 2 (botões): somente num caso de TESTE isolado (referência `TESTE-PILOTO`, título `[TESTE PILOTO]`), criado por inserção de dados após aprovação, com #175 mesclado e publicado. Caso real e seu responsável original não são tocados; não usar "Tomando providências", "Encaminhar" ou "Resolver" no caso real.
3. Armar: definir a variável de armamento no Vercel, redeploy; disparar `pilot-single-alert.yml` com `mode=send` e `confirm=ENVIAR-UMA-VEZ`; desarmar ao final. Linhas PENDING de caso de teste ficam bloqueadas no ciclo normal (#175).

## Processos ativos
Nenhum processo local necessário. Nenhum workflow agendado novo foi criado. Crons existentes inalterados.

## Onde está o resto
- Pacote privado (Google Drive do dono, pasta `ACC-transferencia-2026-11-12`): evidências completas, relatórios, propostas, patch do stash, bundle de commits locais, inventário de alterações não commitadas, manifesto com repositório/branch/commit-base.
- Branches de backup (não mesclar): `backup/menu-eventos-admin-only-2026-11-12`, `backup/gmail-ata-404-2026-11-12`.
- Para retomar: `git fetch --all`, `git checkout main`, ler este arquivo e o manifesto do pacote privado.
