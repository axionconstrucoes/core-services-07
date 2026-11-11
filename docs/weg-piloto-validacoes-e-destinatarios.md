# WEG — condições para início dos testes com e-mail

O piloto só começa depois da validação das fontes. Até lá, `risk_alerts_enabled=false` na configuração da WEG. Recuperação de dados e diagnóstico não enviam e-mails.

## Destinatários definidos

| Caixa | Endereço |
|---|---|
| CRM | crm@axion.com.br |
| Reynaldo Duarte | reynaldo@axion.com.br |
| Jaime Ramos | jaime.ramos@axion.com.br |
| Carlos Evandro | carlos.evandro@axion.com.br |

Remetente: `crm@axion.com.br`. Mensagens identificadas como `[PILOTO]`; sem cópias originais e sem destinatários WEG ou de outras empresas.

O grupo de entrega é fixo no código e só vale para o projeto WEG `00000000-0000-4000-8000-000000000001`. A configuração futura é `ACC_PROJECT_PILOT_TEST_GROUP=WEG_INTERNAL_FOUR`, tanto no servidor quanto nos executores que enviam e-mail. Ausência da variável preserva o roteamento anterior; valor inválido bloqueia. Esta mudança, por si, não define a variável nem ativa envios.

Os três usuários humanos estão ACTIVE na WEG e constam da allowlist do piloto. CRM é uma caixa institucional de entrega, não um novo usuário nem uma ampliação de permissões. A lista de entrega recebe cópias de teste; destinatário lógico e permissões das ações permanecem separados.

## Validações antes do GO

- E-mails: conciliar a janela histórica com a caixa autorizada; separar o histórico completo do recorte de remetentes `@weg.net`; confirmar corpos, anexos, ausências justificadas e idempotência.
- Anexos/documentos: conferir persistência, integridade, extração e acesso ao conteúdo; distinguir recuperado de processado e tratar falhas/pêndencias.
- Diários: comprovar importação, datas cobertas, atualizações e execução automática; sucesso sem registros novos não comprova cobertura integral.
- Relatórios semanais: verificar planilhas, cronogramas, extrações e atualização efetiva do executor.
- Construmanager: separar catálogo/metadados de arquivos armazenados e conteúdo extraído; conciliar revisões e pendências.
- SSMA/Drive: validar registro real da WEG, salvamento, sincronização e acesso à evidência.
- E-mails de teste: conferir destinatários finais e MIME com provedor simulado; garantir somente as quatro caixas, ausência de CC/BCC externos e identificação de piloto. Conferir também respostas, deduplicação e os vínculos/permissões de quem usa os botões.

Não liberar o piloto enquanto houver pendência que comprometa o cenário a testar. Documentar qualquer exclusão e sua consequência. Confirmar a configuração efetiva em cada executor antes de habilitar o envio.

## Estado desta preparação

- Alertas de risco WEG desabilitados no banco e allowlist dos três usuários atualizada.
- Roteamento atual de produção ainda usa o perfil institucional anterior; a entrega às quatro caixas está preparada neste PR e não foi ativada.
- Nenhum envio real faz parte desta preparação.
