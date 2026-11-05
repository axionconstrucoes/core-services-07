# Estado e pendências — AXIA, autorização de e-mail, endurecimento de banco e WhatsApp simulado

> Nada neste documento contém credenciais, dados de clientes, anexos ou caminhos pessoais. Nomes e números são exemplos.

> **Atualização de 04/11/2026:** a Fase 1 foi **publicada e encerrada** (PR #129, `751fe2f`, deploy Ready em `acc.axion.com.br`, migration do histórico jurídico aplicada). Registro, checagens e pendências em `docs/fase-1-encerramento.md`. As seções abaixo descrevem o estado anterior e não foram reescritas.

## 1. Concluído (testado em ambiente descartável)
- **AXIA (assistente)**: botão "Fale com a AXIA", ajuda contextual, cabeçalho nos e-mails enviados pelo ACC, voz via ElevenLabs
  **desativada por padrão** (fail-closed; reserva de crédito antes de cada leitura).
- **Autorização de acesso por e-mail por projeto** (RLS + histórico imutável) e página de confirmação.
- **Guarda de destinatário único** (`ACC_EMAIL_ONLY_RECIPIENT`), aplicada antes de qualquer chamada de rede.
- **Endurecimento de banco**: `search_path` vazio em 12 funções SECURITY DEFINER; `EXECUTE` revogado de `anon` em 22 funções;
  estados consistentes na resposta do orçamento do Construmanager; descarte de foto SSMA pela API do Storage (com checagem de origem).
- **WhatsApp simulado** (desativado por padrão): só alerta CRÍTICO que chega à Diretoria, contato e autorização por pessoa.
- **Guards e runners** de PostgreSQL real (alvo descartável obrigatório) e documentação da stack local completa.

## 2. Incompleto / decisões pendentes
- Redesign escuro v2: só especificação (`.claude/ui-redesign-axion.md`); etapa 1 não iniciada.
- A sincronização do Gmail ainda não consulta as autorizações de e-mail (`docs/vera-autorizacao-email-e-voz.md`).
- Migrations novas **não aplicadas em produção** (ver `docs/plano-implantacao-vera-hardening.md`).
- WhatsApp real: não existe provedor; fica para etapa futura.
- Imagem da AXIA: usa um ícone neutro da marca até que origem e direitos da arte definitiva sejam comprovados.

## 3. Testes
Comandos do CI (`.github/workflows/ci-pr-checks.yml`): `lint`, `build`, `npm test`, `test:scripts`, `test:email`, `test:sql`, `test:ssma`
(Chrome real obrigatório). Runners de PostgreSQL real e de stack completa são manuais: ver `docs/banco-de-teste-local.md` e
`docs/stack-local-completa-descartavel.md`. Relatório do teste controlado de alertas: `docs/teste-controlado-alertas-criticos.md`.

## 4. Versão publicada
A versão em produção não contém nada desta integração. Registre o identificador do deploy no sistema de deploy, não neste repositório.

## 5. Próximos passos
1. Revisar e abrir o PR de integração (só com autorização).
2. Aplicar as migrations primeiro em ambiente descartável e, depois, em produção, **antes** do deploy do código (ver plano de implantação).
3. Retomar o redesign pela etapa 1 da especificação.

## 6. O que nunca é versionado
Arquivos `.env*`, credenciais OAuth (`client_secret*.json`), scripts pessoais de autorização, `.claude/settings.local.json`,
contratos e extrações de clientes, logs de servidor de desenvolvimento, backups e arquivos temporários de patch.
