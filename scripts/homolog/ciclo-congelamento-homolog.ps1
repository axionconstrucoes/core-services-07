# Ciclo completo de congelamento de escrita SOMENTE no acc-homolog (gtadbeaevxglrqkhcwfz), com REVERSAO GARANTIDA e verificacao de integridade.
#   antes (API real) -> pausar jobs -> congelar banco -> congelar Storage -> verificar -> congelado (API real) -> [SEMPRE: descongelar Storage,
#   reverter banco, retomar jobs] -> integridade (fingerprints antes x depois) -> depois (API real)
# Garantias: (1) o bloco de reversao roda em `finally`: acontece mesmo se um passo falhar ou lancar excecao; (2) a pausa dos jobs so e desfeita
# se foi feita; (3) no fim, 8-verificar-integridade.sql e comparado com o estado de ANTES da janela; qualquer divergencia = saida 1;
# (4) cada passo passa pela guarda do kit (ref != operacional, marcador acc_homolog_marker). Nao toca producao, nao liga/desliga a Data API.
# Uso: powershell -NoProfile -File scripts\homolog\ciclo-congelamento-homolog.ps1 -Publicavel <chave publicavel> -Evidencias <pasta fora do repositorio>
param(
  [Parameter(Mandatory = $true)][string]$Publicavel,
  [Parameter(Mandatory = $true)][string]$Evidencias,
  [switch]$SemApi,   # roda so a parte SQL (sem os testes pela API real)
  [string]$InjetarFalhaApos = ''   # SO PARA TESTE: apos executar de verdade o passo com este nome, trata-o como falho (prova que a reversao ocorre diante de erro)
)
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $raiz
New-Item -ItemType Directory -Force -Path $Evidencias | Out-Null
$runner = 'scripts\homolog\executar-homolog.ps1'
$cong = 'docs/implantacao/congelamento'
$resumo = New-Object System.Collections.ArrayList
$prog = Join-Path $Evidencias '10-ciclo-progresso.txt'

function Passo([string]$nome, [string]$etapa, [string]$extra = '', [string]$arquivo = '') {
  $log = Join-Path $Evidencias "10-$nome.log"
  $cmd = "powershell -NoProfile -File $runner -Etapa $etapa"
  if ($arquivo) { $cmd += " -Arquivo $arquivo" }
  if ($etapa -eq 'jwt') { $cmd += " -Publicavel $Publicavel" }
  if ($extra) { $cmd += " -Extra `"$extra`"" }
  cmd /c "$cmd > `"$log`" 2>&1"
  $rc = $LASTEXITCODE
  if ($InjetarFalhaApos -and $nome -eq $InjetarFalhaApos) { $rc = 1; "[$(Get-Date -Format HH:mm:ss)] FALHA INJETADA apos $nome (teste da reversao garantida)" | Out-File $prog -Append -Encoding utf8 }
  [void]$resumo.Add("$nome=$rc")
  "[$(Get-Date -Format HH:mm:ss)] $nome exit=$rc" | Out-File $prog -Append -Encoding utf8
  return $rc
}
function Impressao([string]$nome) {
  [void](Passo $nome 'sql' '--transacao' "$cong/8-verificar-integridade.sql")
  $linha = Get-Content (Join-Path $Evidencias "10-$nome.log") -Encoding UTF8 | Where-Object { $_.StartsWith('[{') } | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha | ConvertFrom-Json)
}

$falhou = $false; $pausou = $false; $congelou = $false
"[$(Get-Date -Format HH:mm:ss)] INICIO ciclo (ref gtadbeaevxglrqkhcwfz)" | Out-File $prog -Append -Encoding utf8
$antes = Impressao 'a-integridade-antes'
if (-not $antes) { "ABORTADO: nao foi possivel obter a impressao digital inicial (nada foi alterado)"; exit 2 }
if ([int]$antes.residuo_gatilhos_guarda -ne 0 -or [int]$antes.residuo_tabelas_auxiliares -ne 0 -or [int]$antes.residuo_politicas_storage -ne 0) { "ABORTADO: ja existe congelamento/pausa aplicados (residuos); reverta antes. Nada foi alterado."; exit 2 }
if ([int]$antes.cron_ativos -ne 11) { "ABORTADO: esperados 11 jobs ativos antes do ciclo (encontrados $($antes.cron_ativos)). Nada foi alterado."; exit 2 }
try {
  if (-not $SemApi) { if ((Passo 'b-jwt-antes' 'jwt' '--fase=antes') -ne 0) { $falhou = $true } }
  if (-not $falhou) { $pausou = $true; if ((Passo 'c-cron-pausar' 'sql' '--transacao' "$cong/6-pg-cron-pausar.sql") -ne 0) { $falhou = $true } }
  if (-not $falhou) { $congelou = $true; if ((Passo 'd-congelar-banco' 'sql' '--transacao' "$cong/1-aplicar-congelamento.sql") -ne 0) { $falhou = $true } }
  if (-not $falhou) { if ((Passo 'e-storage-congelar' 'sql' '--transacao' "$cong/4-storage-congelar.sql") -ne 0) { $falhou = $true } }
  if (-not $falhou) {
    [void](Passo 'f-verificar-congelado' 'sql' '--transacao' "$cong/3-verificar-congelamento.sql")
    if (-not $SemApi) { if ((Passo 'g-jwt-congelado' 'jwt' '--fase=congelado') -ne 0) { $falhou = $true } }
  }
} catch {
  $falhou = $true
  "[$(Get-Date -Format HH:mm:ss)] EXCECAO: $($_.Exception.Message)" | Out-File $prog -Append -Encoding utf8
} finally {
  # REVERSAO GARANTIDA (ordem inversa; todos os scripts sao idempotentes)
  [void](Passo 'h-storage-descongelar' 'sql' '--transacao' "$cong/5-storage-descongelar.sql")
  [void](Passo 'i-congelamento-reverter' 'sql' '--transacao' "$cong/2-reverter-congelamento.sql")
  if ($pausou) { [void](Passo 'j-cron-retomar' 'sql' '--transacao' "$cong/7-pg-cron-retomar.sql") }
}
$depois = Impressao 'k-integridade-depois'
$divergentes = @()
if ($depois) {
  foreach ($k in 'acl_funcoes', 'acl_tabelas', 'politicas', 'gatilhos', 'cron', 'historico', 'p0', 'cron_ativos', 'n_migrations') { if ("$($antes.$k)" -ne "$($depois.$k)") { $divergentes += $k } }
  foreach ($k in 'residuo_tabelas_auxiliares', 'residuo_politicas_storage', 'residuo_gatilhos_guarda', 'residuo_funcao_guarda') { if ([int]$depois.$k -ne 0) { $divergentes += $k } }
} else { $divergentes += 'sem-impressao-depois' }
if (-not $SemApi) { if ((Passo 'l-jwt-depois' 'jwt' '--fase=depois') -ne 0) { $falhou = $true } }
$linhasAuditoria = if ($depois) { [int]$depois.n_audit - [int]$antes.n_audit } else { -1 }
$final = "FIM falhou=$falhou | divergencias_de_integridade=[$($divergentes -join ',')] | auditoria +$linhasAuditoria linhas (esperado: 2 por obra) | $($resumo -join ' ')"
$final | Out-File $prog -Append -Encoding utf8
$final
if ($falhou -or $divergentes.Count -gt 0) { exit 1 } else { exit 0 }
