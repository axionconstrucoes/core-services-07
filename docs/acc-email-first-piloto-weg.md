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

## Estado deste PR
Este PR é a **primeira etapa de proteção**. Detecta intenções operacionais no texto novo e encaminha encerramento, transferência, impedimento, evidência ou comandos múltiplos para revisão, em vez de convertê-los indevidamente em TAKING_ACTION. Não implementa ainda encerramento, transferência, anexos nem resposta de confirmação completos por e-mail. Não publicar como funcionalidade homologada.

## Próximas implementações (PRs separados)
A. Contratos de comando por e-mail e aprovação transacional de RESOLVE e TRANSFER, autorizados e idempotentes, com confirmação.
B. Pipeline de anexos de respostas (Gmail attachments.list/get), vínculo e verificação de segurança no caso, confirmação.
C. Impedimentos e justificativas como eventos auditáveis e atualização de previsão, com e-mails de confirmação.
D. Homologação E2E real em Gmail, Outlook e celular, com testes negativos de autorização, replay, anexos e entrega.
