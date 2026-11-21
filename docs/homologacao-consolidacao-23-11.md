# Consolidação da homologação com documentos sintéticos (21/11/2026) e preparação de 23/11/2026

Base: branch `integration/acc-noturna`, commit `4f6a579` (sobre `b16964b`). Ambiente: `http://localhost:3000` (SISTEMA EM TESTE) + Supabase `acc-homolog` (`gtadbeaevxglrqkhcwfz`). Nada foi aplicado em produção: sem migration, sem deploy, sem envio real, sem DNS. Detalhe dos casos: `docs/homologacao-autenticada-roteiro.md` (seções 15 e 16). Roteiro por pessoa: `docs/homologacao-roteiro-perfis-segunda-23-11.md`.

**Conclusão honesta: Seguros, Garantias e Qualidade (RNC) NÃO estão integralmente homologados.** Só foram vistos, como ADMINISTRADOR, os bloqueios e os fluxos que o perfil permite. Nenhuma das 36 verificações está concluída de ponta a ponta.

## 1. Correções integradas (verificadas no código da branch)

| Id | Correção | Onde | Verificação |
|---|---|---|---|
| D6 | Data de emissão do endosso sem recuar um dia | `formatIssuedAt` em `lib/insurance-ui/format.ts`, usado em `components/insurance/panel-instruments.tsx` | Visto na tela: "em 21/11/2026" |
| D7 | Mensagem de entrada inválida de Competências/Aprovações sem texto fora de contexto | `lib/governance/governance-errors.ts` | Vista na tela |
| D3 | "erros ?" e frase de falhas de fotos sem falha | `lib/integrations/user-integration-matrix.ts` | Visto na tela ("erros: não informado") |
| D4 (parcial) | Identificador técnico no aviso da aba Cobertura | `lib/garantias/coverage-form.ts` | Texto novo no código; aviso não reaberto na tela depois da correção |

## 2. Regressão e build (reexecutados nesta consolidação)

- `tsc --noEmit` em apps/web: 0 erro. `eslint .` em apps/web: 0 erros, 14 avisos antigos (variáveis não usadas, fora do escopo).
- `next build` em apps/web: concluído com sucesso (rotas geradas). Rodado só com URL pública do acc-homolog e uma chave pública de enchimento; sem segredo, sem produção. O servidor da 3000 foi parado para o build e subido de novo com `scripts/homolog/executar-app-homolog.ps1`.
- Testes (todos 0 falha): seguros-ui 27, garantias-ui 18, quality-ui 17, user-integration-matrix 27, f6-h2a-governanca 15, help-catalog 10, help-coverage 4, help-reconcile 4, contrast-audit 12, contrast-system 10, theme-contrast 8, select-contrast 6, homolog-guard 39, insurance-domain 20, f4b-garantias-seguros 13, quality-insurance-experts 36, competencias 9, destinatarios-externos 17, permissoes-tier 8.
- Não reexecutados nesta consolidação: os `*-realpg` (Postgres local) e os `*-browser` (Chrome com fixture).

## 3. As seis evidências salvas (`C:\VIBE\PROJETOS\axion-backups\homologacao\evidencias\f8-docs\`)

| Arquivo | Caso | Resultado |
|---|---|---|
| seguros-painel-pos-docs-aprovado.jpg | Painel de Seguros após cadastro dos documentos (1 endosso pendente, 1 apólice) | APROVADO |
| seguros-endosso-emissor-nao-confere-aprovado.jpg | Endosso emitido com documento; "0 de 2"; emissor bloqueado de conferir | APROVADO (bloqueio) |
| seguros-endosso-data-emissao-D6-reprovado-antes.jpg | D6 antes da correção ("20/11/2026 21:00") | REPROVADO (antes); corrigido |
| competencias-solicitacao-pendente-e-mensagem-D7-corrigida-aprovado.jpg | Solicitação pendente de competência + mensagem D7 corrigida | APROVADO |
| garantias-cobertura-exige-competencia-bloqueio-aprovado.jpg | "Mover para Coberta" recusado por falta de competência | APROVADO (bloqueio) |
| aprovacoes-externas-aprovada-uso-unico-nada-enviado-aprovado.jpg | Aprovação de uso único; "NADA foi enviado" | APROVADO |

## 4. Resultados separados

**4.1 Testes aprovados** (automáticos): a seção 2. **Ressalva:** não substituem tela autenticada.

**4.2 Bloqueios de segurança aprovados (vistos na tela, como ADMINISTRADOR único)**
- Emissor do endosso não confere nem recusa a conferência (com mensagem).
- Envio de minuta sem canal oficial ("SEM CANAL cadastrado"); nada é enviado.
- Cobertura de garantia (Coberta) exige competência profissional que o ADM não tem.
- Solicitação de competência não concede poder; o solicitante não vê controle de validar a própria.
- Designação de si mesmo como validador: o seletor não oferece o próprio ADM.
- Reenvio de documento idêntico recusado (duplicata).
- RNC: encerramento bloqueado sem ação executada e sem eficácia; Confirmar NC exige evidência NC comprovada.
- Obra TESTE-2: 404 em seguros, qualidade, competências, aprovações externas e garantias (mesmo para o TENANT_ADMIN).
- Aprovação externa: ADM decide, nada é enviado, uso único não consumido.

**4.3 Fluxos positivos NÃO executados** (pendentes)
- Seguros: 1ª e 2ª conferência do endosso; efeito de cobertura; aprovação de minuta; coerência CONTRATO/APOLICE/MINUTA com divergência e justificativa; fiança/caução; adiantamentos; sinistro (aviso, fundamentação, decisão, indenização); RCC.
- Garantias: Coberta, reparo, REPARADA, aceite INFORMADO × COMPROVADO (com manifestante externo), verificação e encerramento.
- Qualidade: confirmação de NC, eficácia, encerramento, laudo técnico, conflito de versão (Q-09), demais abas.
- Competências: validação independente, designação de Ricardo/Carlos/Jaime, revalidação.
- Aprovações externas: divergência de hash após alteração e consumo de uso único (este último fora do alcance da interface).
- Permissões e menu por nível de COLABORADOR/GESTOR; isolamento por contas inativa, pendente e de outra obra.
- Responsividade 390 px.

**4.4 Evidências ausentes** (vistas na tela, imagem não salva por falha intermitente de captura): duplicata de documento; recusa de Coberta (a imagem salva mostra a recusa por competência); RNC em investigação com evidência e CAPA; 404 de TESTE-2; erro de entrada de Competências antes da correção; designação própria sem opções.

## 5. Estado preservado no acc-homolog (verificado por SELECT em 21/11)

6 documentos sintéticos (6 versões, nada excluído); endosso #1 EMITIDO; solicitação de competência SEGUROS PENDING (vence 21/12/2026); GAR-0001 EM ANÁLISE; RNC-0001 EM INVESTIGAÇÃO com evidência e 1 CAPA; 2 preparações externas (uma APPROVED sem consumo, uma PREPARED); convites de Carlos, Jaime e Ricardo ainda PENDING. Nenhum INSERT/UPDATE por SQL. **Não apagar nem reiniciar o ambiente antes de segunda.** Atenção: a confirmação da preparação APPROVED vale 24 h; no dia 23 ela já terá expirado: preparar uma nova para o teste de decisão de Jaime/Ricardo.

## 6. Roteiro objetivo de 23/11 (cada pessoa só na PRÓPRIA sessão Google)

Regra: o agente não autentica, não digita senha e não cria sessão por ninguém. Cada pessoa entra com sua conta `@axion.com.br`, em janela anônima/perfil separado (não derrubar a sessão do reynaldo). Antes e depois do 1º login: SELECT do roteiro `homologacao-roteiro-perfis-segunda-23-11.md` (convite PENDING antes; perfil + membership ACTIVE depois; nenhum vínculo com TESTE-2). Ordem sugerida:
1. **Jaime (GESTOR), manhã:** J1 a J14 do roteiro. Dados já prontos: endosso #1 EMITIDO, GAR-0001, RNC-0001 em investigação, solicitação de competência pendente do reynaldo, 6 documentos.
2. **Carlos (COLABORADOR), manhã:** C1 a C12.
3. **Ricardo (GESTOR), sem data:** R1 a R4 (2ª conferência, reconferência negada, conflito de versão com Jaime).
4. Reynaldo (ADM), em paralelo na própria sessão: designar validadores (com a ata sintética (e)), registrar canal oficial de seguradora sintético se necessário, depois conferir os resultados por SELECT.
5. Atualizar a seção 9 do roteiro principal só com o que for visto.

## 7. Fluxos que ainda exigem outra pessoa, validador independente ou profissional habilitado

| Fluxo | Exige | Quem pode no ambiente |
|---|---|---|
| 1ª e 2ª conferência do endosso crítico (sem classificação é tratado como crítico) | 2 conferentes distintos, diferentes do emissor (reynaldo), com competência SEGUROS ou JURÍDICO (quem solicitou só com competência) | Jaime e Ricardo, depois de terem competência validada. Sem Ricardo, a 2ª conferência fica impossível |
| Validar competência (reynaldo, Jaime, Ricardo) | Pessoa independente: "segundo administrador ou validador designado ativo". Em obra com 1 administrador: designação por ata (documento (e)), prazo até 180 dias e aceite da própria pessoa | Jaime ou Ricardo como validador designado. Inferência pelo texto da tela: GESTOR sem designação não valida; confirmar na segunda |
| Aprovar minuta de Seguros | ADMINISTRADOR com competência SEGUROS/JURÍDICO (+ canal oficial cadastrado) | Reynaldo, só depois de a competência dele ser validada por outra pessoa |
| Decisão/indenização de sinistro | Gestão com competência JURÍDICO + fundamentação com fonte | Jaime/Ricardo com competência validada |
| Cobertura de garantia (Coberta / Não coberta) | Competência profissional registrada | Idem |
| Laudo técnico da RNC | Competência TECNICO_RESPONSAVEL | Habilitação sintética validada por independente |
| Aceite COMPROVADO de garantia | Manifestante externo (não membro, não o registrante) com e-mail externo; só em REPARADA/VERIFICADA | Depende de a cobertura avançar; e-mail sintético em domínio permitido pelo sistema (domínios reservados são recusados) |
| Conflito de versão (Q-09) | Duas sessões simultâneas | Jaime e Ricardo |
| Menu/isolamento por nível, inativo, convite pendente, ADM de outra obra | Contas que ainda não existem | Carlos, Jaime, Ricardo; contas extras (H4 ampliado) |

Todo documento de habilitação é fictício e "SEM VALIDADE JURÍDICA": a competência concedida em acc-homolog é só de teste, sem relação com registro profissional real.

## 8. Defeitos

| Id | Estado |
|---|---|
| D3 | RESOLVIDO (corrigido e visto na tela) |
| D4 | PARCIAL: resolvido o identificador no aviso de Cobertura. ABERTOS: `SEGURO_GARANTIA_EXECUTANTE` no seletor do endosso; rótulos "Função deste campo: ..." com nome técnico do campo |
| D5 | ABERTO (língua da validação nativa vem do navegador; corrigir exige validação própria) |
| O1 | ABERTO (não reproduzido na execução de 21/11; a lista de Garantias não foi reexercitada; reconfirmar) |
| Outros abertos | O3 (seletor de obra do ESG), O4 (tipo documental sem apólice/minuta/habilitação; exige migration, não criada), O5 (texto de recusa de Garantias dirigido a quem já é Administrador), O6 (captura de tela intermitente) |

Conclusão: **D3 resolvido; D4 parcial; D5 e O1 permanecem abertos.**

## 9. Estado consolidado das 36 verificações (quadro da seção 9 do roteiro principal)

| Situação | Linhas | Observação |
|---|---|---|
| Aprovadas integralmente (tela autenticada, todos os passos, todos os perfis) | **0** | Nenhuma |
| Reprovadas | **0** | Só D6 foi reprovado antes e corrigido; nenhuma linha reprovada |
| Aprovadas PARCIALMENTE em tela autenticada (ADM), ainda pendentes de outros perfis/pessoas | **12** | Qualidade (Dashboard e RNC), Garantias (lista e detalhe), Seguros (Painel, Apólices, Endossos, Minutas, Canais), Quatro Pilares, Solicitações, ESG |
| Só banco real, sem tela vista | 10 | Pendentes de tela |
| Só fixture/harness, sem tela autenticada | 7 | Pendentes de tela |
| Bloqueadas (sem tela nem harness) | 7 | Pendentes de tela |
| **Pendentes de homologação completa** | **36 de 36** | 12 com parte vista; 24 sem tela autenticada |

Resumo: **0 aprovadas, 0 reprovadas, 36 pendentes** (12 delas parcialmente vistas). Nenhuma linha deve ser marcada como homologada antes dos fluxos completos de segunda-feira.
