# ACC — Operação integral por e-mail — contrato de homologação WEG

## Diretriz
O colaborador e o responsável por providências devem operar por resposta de e-mail, sem necessidade de login no ACC. Coordenação, Gerência e Diretoria usam a suíte como plataforma de gestão, auditoria e decisão.

## Aceite obrigatório (teste de ponta a ponta, com conta real controlada)
1. Receber alerta individual, com caso identificável e destinatário autorizado.
2. Responder EM ANDAMENTO com previsão; ALTO/CRÍTICO exigem data e horário; MÉDIO/BAIXO, data.
3. Atualizar previsão sem reverter para uma resposta mais antiga.
4. Reportar impedimento e justificativa; manter histórico e escalonamento aplicável.
5. Encaminhar a responsabilidade para outro membro autorizado, com registro da aceitação/identidade e notificação.
6. Incluir fotos e documentos; associar os anexos ao caso com controle de tipo/tamanho, integridade e permissões.
7. Resolver/concluir a pendência sem abrir a suíte, observando permissões e evidências obrigatórias.
8. Receber confirmação de resultado (sucesso, rejeição ou necessidade de complementação) por e-mail, sem falso sucesso.

## Invariantes
- Correspondência do caso via In-Reply-To/References/token; sem correlação inequívoca, revisão.
- Validar remetente, domínio corporativo, membership ativo, destinatário lógico e allowlist, além de autenticação Gmail.
- Idempotência por ID do provedor, sem reaplicar mensagens ou reemissão histórica.
- Texto recebido é dado não confiável, nunca instrução de execução ou de SQL.
- Não suspender prazos automaticamente por "EM ANDAMENTO" ou previsão.
- Distinguir resposta antiga de previsão atual; não perder histórico.
- Nenhum envio real em testes sem armamento explicitamente aprovado.
- Retenção e processamento de evidências devem seguir as políticas já existentes, sem criar acesso público.
- SLAs WEG (6 h úteis, 12 h úteis, 2 dias úteis, 5 dias úteis) ainda requerem decisão sobre etapas e migração separada.

## Estado deste PR (atualizado em 19/11/2026)
Segunda etapa: além da proteção, os comandos explícitos **RESOLVIDO** e **ENVIAR PARA** de remetente já autorizado são aplicados pela
máquina de estados única (a mesma da tela, origem `EMAIL`), com confirmação ao autor — de sucesso ou de **rejeição** (nunca falso sucesso).

Como escrever (primeira linha do texto novo; o texto citado é ignorado):
- `RESOLVIDO: descrição e evidência` (também `CONCLUÍDO` e `FINALIZADO`). ALTO/CRÍTICO exigem justificativa e evidência no texto; conforme a Matriz,
  o resultado pode ser "resolução proposta, aguardando revisão humana".
- `ENVIAR PARA: nome@axion.com.br instrução opcional`. O alvo precisa ser membro ACTIVE com e-mail corporativo e diferente do remetente.
- Dois comandos, negação ("não resolvido"), combinação ("resolvido e encaminho…") ou comando fora da primeira linha vão para **revisão humana**.

### Situação dos oito critérios de aceite
| # | Critério | Situação |
|---|---|---|
| 1 | Alerta individual a destinatário autorizado | Já operacional (7 enviados em produção, aceite pelo Gmail comprovado). |
| 2 | EM ANDAMENTO com previsão (data+horário em ALTO/CRÍTICO) | Já existente (`test-risk-alert-forecast`). |
| 3 | Atualizar previsão sem reverter para resposta antiga | Já existente (resposta fora de ordem fica só no histórico). |
| 4 | Impedimento e justificativa | **Pendente**: segue para revisão humana (etapa C). |
| 5 | Encaminhar a outro membro autorizado, com notificação | **Implementado e testado offline** (`ENVIAR PARA`). Falta teste com Gmail real. |
| 6 | Fotos/documentos vinculados ao caso | **Pendente** (etapa B): exige leitura de anexos do Gmail, armazenamento, tipo/tamanho/integridade e possivelmente migração. Não implementado. |
| 7 | Resolver/concluir sem abrir a suíte | **Implementado e testado offline** (`RESOLVIDO`), com evidência em texto. Evidência por anexo depende do item 6. |
| 8 | Confirmação de resultado (sucesso, rejeição, complementação) | **Implementado e testado offline** para RESOLVIDO e ENVIAR PARA; já existia para EM ANDAMENTO. |

Testes: `node scripts/test-operational-email-intents.mjs` (10 casos) e `node scripts/test-operational-email-commands.mjs` (14 cenários: aplicação autorizada,
evidência obrigatória, destinatário inelegível, remetente sem permissão, ambiguidade, texto citado, duplicada, alerta já resolvido, reprocessamento após falha),
além de `npm run test:alerts` e `npm run test:email`. Nenhum teste usa Gmail, banco ou rede.

### Ainda depende de Gmail real autorizado
Resposta real de um participante do piloto a um alerta real (RESOLVIDO e ENVIAR PARA), recebimento e leitura do e-mail de confirmação na caixa e formatação em Gmail/Outlook/celular.
Sem isso o critério E2E real (item 8 do contrato) **não está homologado**. O PR deve seguir em rascunho.

## Próximas implementações (PRs separados)
B. Pipeline de anexos de respostas (Gmail attachments.list/get), vínculo e verificação de segurança no caso, confirmação.
C. Impedimentos e justificativas como eventos auditáveis e atualização de previsão, com e-mails de confirmação.
D. Homologação E2E real em Gmail, Outlook e celular, com testes negativos de autorização, replay, anexos e entrega.
