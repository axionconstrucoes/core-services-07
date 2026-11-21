# Roteiro de homologação por perfil — segunda-feira 23/11/2026 (manhã)

Ambiente: SOMENTE `http://localhost:3000` (SISTEMA EM TESTE) apontando ao Supabase `acc-homolog` (ref `gtadbeaevxglrqkhcwfz`). Obra base: TESTE (`723b7467-24e9-4401-80d3-3dbc6ee4d57e`); TESTE-2 não tem vínculo com ninguém.
Rota base: `http://localhost:3000/723b7467-24e9-4401-80d3-3dbc6ee4d57e/...` (abaixo `<obra>`).

## Regras comuns (valem para todos)

1. **O agente NÃO autentica em nome de ninguém.** Cada pessoa faz o PRÓPRIO login Google (`@axion.com.br`) na janela Chrome controlada ou no navegador dela, e só então o agente (ou a pessoa) executa os passos. Nunca compartilhar senha, nunca digitar senha para outra pessoa, nunca criar sessão artificial.
2. Não conceder permissões OAuth além das que o login Google já pede; não fazer logout do reynaldo na janela compartilhada (usar janela anônima/perfil separado para a outra pessoa).
3. Nada de e-mail real: ações de envio devem aparecer BLOQUEADAS. Dados criados com prefixo `[HOMOLOG]`.
4. Evidência: print (com a URL e o perfil visível) salvo em `C:\VIBE\PROJETOS\axion-backups\homologacao\evidencias\f8-<perfil>\<modulo>-<caso>-<resultado>`. Não versionar imagens.
5. Falha em passo de AUTORIZAÇÃO (A-) ou de ENVIO é crítica: parar e registrar.

### Pré-requisito de checagem (SELECT somente leitura no acc-homolog, `project_id` gtadbeaevxglrqkhcwfz)

Antes do 1º login de cada pessoa (convite deve estar PENDING) e depois (deve estar ACTIVE com membership). Rodar com o MCP Supabase `execute_sql` (apenas SELECT). Conferir os nomes das colunas no esquema se a consulta falhar; não alterar nada.

```sql
-- convites/pré-cadastros (esperado antes: PENDING; depois do 1º login: ACTIVE)
select * from public.project_member_invitations
 where lower(email) in ('carlos.evandro@axion.com.br','jaime.ramos@axion.com.br','ricardo.martins@axion.com.br');
-- vínculos ativos e nível
select m.*, p.email from public.project_memberships m
  join public.profiles p on p.id = m.user_id
 where lower(p.email) in ('carlos.evandro@axion.com.br','jaime.ramos@axion.com.br','ricardo.martins@axion.com.br');
-- perfil criado pelo trigger handle_new_user (aparece só após o 1º login)
select id, email, created_at from public.profiles
 where lower(email) in ('carlos.evandro@axion.com.br','jaime.ramos@axion.com.br','ricardo.martins@axion.com.br');
```
Esperado: antes do login 0 linhas em `profiles` e convite PENDING; depois do login 1 `profiles`, convite ACTIVE/aceito e 1 membership ACTIVE na obra TESTE com o papel certo (COLABORADOR/REGISTER ou GESTOR/MANAGE) e NENHUM vínculo com TESTE-2. Se o convite não virar ACTIVE: parar e avisar o responsável (não ativar manualmente por SQL).

---

## 1. Carlos Evandro — COLABORADOR (P-COL, nível REGISTER) — 23/11 manhã

Ordem: (1) Carlos faz o 1º login Google → (2) o trigger cria o perfil e ativa o convite → (3) rodar o pré-requisito de checagem → (4) executar os passos.

| # | URL | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| C1 | `/` (login) | 1º login Google do Carlos | Entra; cai na obra TESTE; sem erro | `login-carlos-APROVADO` |
| C2 | menu lateral | Conferir itens | Vê Dashboard, Quatro Pilares, Qualidade, Garantias, Seguros etc.; NÃO vê Eventos, Integrações, Usuários, Autorizações, Reemissão, Start-up | `menu-colaborador` |
| C3 | `<obra>/qualidade?aba=rnc` | Registrar RNC `[HOMOLOG]` com origem + referência | Criada com código; sem origem/referência é recusada | `qualidade-rnc-registro` |
| C4 | detalhe da RNC | Registrar evidência (Fato); avançar até triagem/investigação | Etapas operacionais ok | `qualidade-evidencia` |
| C5 | detalhe da RNC | Tentar CONFIRMAR / ENCERRAR / Cancelar / Duplicada | Botão indisponível ("exige perfil de gestão") ou recusa clara; nada gravado | `qualidade-decisao-negada` |
| C6 | `<obra>/action-requests` | Registrar solicitação `[HOMOLOG]` | Registrada; destinatário externo só com confirmação de gestão (recusa para COLABORADOR) | `solicitacao-colab` |
| C7 | `<obra>/competencias` | Abrir; solicitar competência (permitido) | Vê a tela; NÃO consegue validar/decidir; sem competência ativa por conta própria | `competencias-colab` |
| C8 | `<obra>/aprovacoes-externas` | Abrir; preparar conteúdo se permitido | Só prepara; botões Aprovar/Decidir indisponíveis ou recusados; NUNCA envia | `aprovacoes-colab-negado` |
| C9 | `<obra>/integracoes` e `<obra>/usuarios`, `<obra>/ledger`, `<obra>/startup` (colar a URL) | Tentar abrir | Negado/404 ou redirecionamento; nenhum dado | `rota-restrita-negada` |
| C10 | URL de TESTE-2 (id da obra TESTE-2) | Tentar abrir | Negado; nenhum dado | `isolamento-obra2` |
| C11 | Seguros (`<obra>/seguros`) | Solicitar endosso; tentar decisão de sinistro / conferir endosso / aprovar minuta | Solicitar ok; decidir/conferir/aprovar recusados | `seguros-colab-negado` |
| C12 | `<obra>/integracoes/contatos-externos` (colar) | Abrir | Sem formulário de dado global (só consulta/solicitação, se a tela permitir) | `contatos-colab` |

## 2. Jaime Ramos — GESTOR (P-GES2, nível MANAGE) — 23/11 manhã

Mesma ordem de login/checagem. Jaime é o 2º gestor (independência de conferentes).

| # | URL | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| J1 | `/` | 1º login Google do Jaime | Entra na obra TESTE | `login-jaime-APROVADO` |
| J2 | menu | Conferir | Mesmo menu do COLABORADOR (restritos só para ADMINISTRADOR) | `menu-gestor` |
| J3 | `<obra>/qualidade/rnc/<id>` | Confirmar RNC, registrar CAPA, verificação de eficácia (evidência FATO); tentar encerrar sem eficácia | Confirmar/CAPA/eficácia aceitos; encerrar sem requisitos impedido com lista do que falta | `qualidade-gestor-fluxo` |
| J4 | `<obra>/garantias` | Aceite INFORMADO × COMPROVADO | Só o COMPROVADO (evidência FATO) encerra | `garantias-aceite` |
| J5 | `<obra>/seguros` > Endossos | Conferir endosso EMITIDO por outra pessoa | 1ª conferência = "1 de 2"; mesma pessoa não confere duas vezes; emissor não confere | `seguros-endosso-conferencia-1` |
| J6 | `<obra>/seguros` > Sinistros | Decisão com fundamentação e fontes | Aceita só com fundamento | `seguros-sinistro-decisao` |
| J7 | `<obra>/seguros` > Minutas | Tentar APROVAR minuta | Recusado (só ADMINISTRADOR aprova minuta) | `seguros-minuta-negada` |
| J8 | `<obra>/action-requests` | Destinatário externo sem confirmação / com confirmação+motivo válidos | Sem confirmação recusado; com ambos segue e fica na auditoria | `destinatario-externo-gestor` |
| J9 | `<obra>/integracoes/contatos-externos` | Solicitar alteração de dado global (organização/domínio) | Gestor SOLICITA mas NÃO altera dado global (sem gravação direta) | `contatos-gestor-solicita` |
| J10 | `<obra>/integracoes/sinais-email` | Confirmar/descartar um sinal (se houver; senão registrar SEM DADOS) | Confirma/descarta com motivo; ou estado vazio SEM DADOS | `sinais-gestor` |
| J11 | `<obra>/aprovacoes-externas` | Decidir aprovação externa preparada (exceto minuta de Seguros) | Decide; hash do conteúdo conferido; divergência bloqueia; NUNCA envia | `aprovacoes-gestor-decide` |
| J12 | `<obra>/competencias` | Validar competência solicitada por OUTRA pessoa (ex.: do reynaldo) | Validador independente aceito; não valida a própria solicitação | `competencias-validador` |
| J13 | rotas restritas (Integrações, Usuários, Eventos, Start-up) | Colar URL | Negado | `rota-restrita-negada-gestor` |
| J14 | `/<id TESTE-2>/...` | Colar URL | Negado | `isolamento-obra2-gestor` |

## 3. Ricardo Martins — GESTOR (P-GES, nível MANAGE) — SEM DATA (sessão legítima disponível)

Mesmo quadro do Jaime (J1–J14) com os acréscimos de independência, que exigem OUTRA pessoa distinta de Jaime e do emissor:

| # | Ação | Resultado esperado | Evidência |
|---|---|---|---|
| R1 | Todos os passos J1–J14 como Ricardo | Idem Jaime | `*-ricardo` |
| R2 | Seguros: 2ª conferência do endosso (a 1ª foi do Jaime) | Endosso CONFERIDO com efeito conforme o texto EMITIDO | `seguros-endosso-conferencia-2` |
| R3 | Tentar conferir de novo | Recusado (já conferiu) | `seguros-endosso-reconferencia-negada` |
| R4 | Q-09: abrir a mesma RNC com Jaime e gravar juntos | Um grava; o outro recebe conflito de versão e o texto digitado é preservado | `qualidade-conflito-versao` |

## 4. Como executar depois

1. Responsável confirma que a PESSOA está presente e fará o próprio login (agente não digita nada). Preferir janela anônima do Chrome para não derrubar a sessão do reynaldo.
2. Rodar o pré-requisito SQL (convite PENDING antes; membership ACTIVE depois do login).
3. Passar a rota e o perfil ao agente; ele navega, captura as telas, lê console/rede (`read_console_messages` com pattern `error|Error|Unhandled`; `read_network_requests` buscando 4xx/5xx e erros RPC/RLS) e registra no roteiro (seções 9 e 15) como APROVADO/REPROVADO.
4. Casos que só aparecem com 2+ pessoas (R2–R4, J5) ficam PENDENTE até as duas sessões existirem.
5. Em seguida, reconciliar o quadro da seção 9 e anexar os nomes dos arquivos de evidência.
