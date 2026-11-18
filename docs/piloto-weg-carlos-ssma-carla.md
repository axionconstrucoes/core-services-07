# Piloto WEG — Carlos Evandro (alertas e SSMA) e Carla (alertas)

Preparação **sem publicação nem ativação de envios**. O objetivo é preservar a entrega direta ao responsável com cópia para `crm@axion.com.br`.

## Carlos Evandro

- Identidade: `carlos.evandro@axion.com.br`, já integrante da lista fixa do piloto.
- Alertas: entrega direta ao destinatário lógico, sem ampliação da distribuição para outros usuários.
- SSMA: o aplicativo de campo deve permitir relatórios diários, ocorrências, fotos/evidências e acompanhamento de ações **conforme perfil e vínculo ativo no projeto WEG**. A inclusão no piloto de e-mail não altera permissões de SSMA.
- Respostas SSMA por e-mail: o fluxo de ação corretiva reconhece o responsável e exige correlação da mensagem; casos ambíguos/não autorizados não devem avançar automaticamente.
- OAuth Gmail pessoal: desnecessário para receber alertas, responder a notificações ou operar o aplicativo. É outra permissão, exigida apenas para leitura/importação da caixa pessoal.

## Carla

- Identidade encontrada no código para avisos administrativos: `carla@axion.com.br`.
- Adicionada à allowlist estática do perfil de e-mail WEG nesta branch; **não significa liberação para produção**.
- Antes de habilitar alertas, confirmar no banco o cadastro `profiles.email`, vínculo ativo com a WEG, permissões e se Carla realmente deve receber notificações operacionais. Nenhum vínculo é criado ou alterado por este PR.
- Não conceder leitura do Gmail pessoal nem permissão de SSMA por esta alteração.

## Condições de homologação

1. CI verde, incluindo `node scripts/test-project-pilot-profile.mjs` e `node scripts/test-ssma-corrective-scope.mjs`.
2. Conferir o perfil/participação de Carla e Carlos em **ambiente correto**, preservando o escopo da WEG.
3. Simular (sem enviar) alertas para cada usuário. Confirmar `To` lógico e `Cc: crm@axion.com.br`, isolamento de outros projetos e bloqueio de destinatários externos.
4. Testar login de Carlos no formulário de SSMA, envio de registro e fotos, persistência e permissões; nada disso foi comprovado por uma mudança de allowlist.
5. Somente após homologação e autorização de publicação, avaliar merge/deploy e ativação controlada. Sem alterar cron, segredos, migrations, SLAs ou configuração de alertas WEG neste PR.
