# Piloto WEG — Carlos Evandro (alertas e SSMA); Carla fora desta fase

Documento de critérios. **Não altera código, credenciais, banco, SLA, cron nem envios.**

## Decisão de 19/11/2026 (Reynaldo)
- **Carla fica fora desta fase do piloto.** Ela não consta da allowlist de código (`PILOT_PARTICIPANT_ADDRESSES`), não recebe alertas e não tem vínculo com a WEG.
  Em produção ela também não possui linha em `profiles` nem vínculo (consulta somente leitura de 19/11). Nenhum cadastro foi criado.
- Para incluí-la em uma fase futura será preciso: decisão do Reynaldo sobre permissão e área; primeiro acesso dela ao ACC (cria usuário e perfil);
  vínculo `ACTIVE` pelo fluxo administrativo; só então a inclusão na allowlist de código e no banco, com teste específico.

## Carlos Evandro
- Identidade: `carlos.evandro@axion.com.br`, já integrante da lista fixa do piloto.
- Produção (19/11): perfil presente, usuário de autenticação existente, vínculo WEG `ACTIVE`, permissão `ADMINISTRADOR`, área `ADMINISTRATIVO`.
- Alertas: entrega direta ao destinatário lógico, sem ampliar a distribuição.
- SSMA: o aplicativo de campo permite relatórios, ocorrências, fotos/evidências e acompanhamento **conforme perfil e vínculo ativo na WEG**.
- Respostas SSMA por e-mail: o fluxo de ação corretiva reconhece o responsável e exige correlação; casos ambíguos/não autorizados não avançam.
- OAuth Gmail pessoal: desnecessário para alertas, respostas ou uso do app.

## Teste físico do Carlos (a cargo do Carlos)
1. Entrar no app de campo com a própria conta.
2. Registrar **uma ocorrência SSMA com foto** na WEG.
3. Conferir que a ocorrência e a foto persistiram e aparecem no ACC (o Reynaldo confere a evidência).
4. Registrar o horário e o identificador da ocorrência para rastrear o fluxo de aviso e resposta.

## Condições de homologação
1. CI verde, incluindo `node scripts/test-project-pilot-profile.mjs` e `node scripts/test-ssma-corrective-scope.mjs`.
2. Teste físico do Carlos concluído e conferido.
3. Alertas simulados (sem enviar) para os participantes atuais, com `To` lógico e `Cc: crm@axion.com.br`.
