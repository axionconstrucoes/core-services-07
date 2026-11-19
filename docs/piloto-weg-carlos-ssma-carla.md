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

## Evidência de homologação (19/11/2026, consulta somente leitura à produção)

| Item | Resultado |
|---|---|
| Carlos Evandro | `profiles` presente; vínculo WEG `ACTIVE`, permissão `ADMINISTRADOR`, área `ADMINISTRATIVO`; usuário de autenticação existente. |
| Carla | **Sem linha em `profiles` e sem vínculo com a WEG.** Nenhum nome ou e-mail iniciado por "carla" foi encontrado. |
| Vínculos ativos da WEG | 7 (Carlos, CRM, Jaime, Marcio, Reynaldo, Ricardo, Victor). Carla não consta. |
| Testes | `test-project-pilot-profile` 13/13, `test-ssma-corrective-scope` 15/15, `test-pilot-single-alert` 24/24 (merge com a `main` de 19/11). |

Pendências humanas (decisão do Reynaldo, nenhuma executada por este PR):
1. Decidir se a Carla deve receber alertas e qual permissão/área ela terá na WEG.
2. Se sim, ela precisa entrar no ACC ao menos uma vez (cria o usuário de autenticação e o perfil) e só então receber o vínculo `ACTIVE` pelo fluxo administrativo normal.
3. Teste físico: login do Carlos no app de campo, registro de SSMA com foto e conferência da persistência.
Sem essas ações a Carla continua na allowlist de código, mas **sem destinatário resolvível**: nenhum alerta é enviado a ela.
