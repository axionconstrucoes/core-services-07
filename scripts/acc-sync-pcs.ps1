# ACC — sincronizacao segura entre PCs (Windows PowerShell 5.1+)
# Somente leitura por padrao. Nunca usa reset --hard, clean, stash automatico ou force push.
[CmdletBinding()]
param(
  [ValidateSet('status','inicio','encerrar')][string]$Acao = 'status',
  [switch]$Atualizar,
  [switch]$Publicar
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Git([string[]]$ArgsList) {
  $result = & git @ArgsList 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($ArgsList -join ' ') falhou: $($result -join ' ')" }
  if ($null -eq $result) { return }
  return $result
}
try {
  $root = (Git -ArgsList @('rev-parse','--show-toplevel'))[0]
  Set-Location $root
  $branch = (Git -ArgsList @('branch','--show-current'))[0]
  $head = (Git -ArgsList @('rev-parse','--short','HEAD'))[0]
  $origin = (Git -ArgsList @('remote','get-url','origin'))[0]
  $porcelain = @(Git -ArgsList @('status','--porcelain=v1','--untracked-files=all'))
  $dirty = $porcelain.Count -gt 0
  Write-Host "ACC | Acao: $Acao | Pasta: $root | Branch: $branch | SHA: $head"
  Write-Host "Origin: $origin"
  if ($origin -notmatch '^((https://|git@)github\.com[:/])axionconstrucoes/(core-services-07|axion-contract-intelligence)(\.git)?$') {
    Write-Warning 'Origin nao corresponde ao repositorio ACC esperado. Nenhuma sincronizacao automatica sera feita.'
    $safeOrigin = $false
  } else { $safeOrigin = $true }
  Write-Host 'Worktrees:'
  Git -ArgsList @('worktree','list') | ForEach-Object { Write-Host "  $_" }
  Write-Host 'Stashes (apenas listagem):'
  Git -ArgsList @('stash','list','--format=%gd %s') | ForEach-Object { Write-Host "  $_" }
  if ($dirty) {
    Write-Warning "Existem $($porcelain.Count) alteracoes locais (incluindo arquivos nao rastreados). Nao serao descartadas."
    $porcelain | ForEach-Object { Write-Host "  $_" }
  } else { Write-Host 'Worktree limpo.' }
  if ($Acao -eq 'inicio' -and $safeOrigin) {
    Git -ArgsList @('fetch','--prune','origin') | Out-Null
    Write-Host 'Fetch concluido; nenhuma alteracao local foi sobrescrita.'
  }
  $upstream = (& git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>$null)
  $hasUpstream = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($upstream -join ''))
  if ($hasUpstream) {
    $counts = ((Git -ArgsList @('rev-list','--left-right','--count','HEAD...@{upstream}'))[0] -split '\s+')
    $ahead = [int]$counts[0]; $behind = [int]$counts[1]
    Write-Host "Upstream: $upstream | Ahead: $ahead | Behind: $behind"
  } else {
    $ahead = 0; $behind = 0
    Write-Warning 'Branch sem upstream. Verifique manualmente antes de publicar.'
  }
  if ($Atualizar) {
    if ($Acao -ne 'inicio' -or -not $safeOrigin -or $dirty -or -not $hasUpstream -or $ahead -ne 0 -or $behind -le 0) {
      throw 'Atualizacao negada: requer -Acao inicio, origin correto, worktree limpo, upstream, ahead=0 e behind>0.'
    }
    Git -ArgsList @('merge','--ff-only','@{upstream}') | ForEach-Object { Write-Host $_ }
    Write-Host 'Atualizacao fast-forward concluida.'
  }
  if ($Publicar) {
    if ($Acao -ne 'encerrar' -or -not $safeOrigin -or $dirty -or -not $hasUpstream -or $behind -ne 0 -or $ahead -le 0) {
      throw 'Push negado: requer -Acao encerrar, origin correto, worktree limpo, upstream, behind=0 e ahead>0.'
    }
    if ($branch -in @('main','master','production','deploy/render-20261016')) {
      throw 'Publicacao direta de branch protegida proibida; use PR.'
    }
    Write-Warning 'Revise commits para garantir que nao contenham segredos ou dados privados.'
    Git -ArgsList @('log','--oneline','@{upstream}..HEAD') | ForEach-Object { Write-Host "  $_" }
    Git -ArgsList @('push','origin','HEAD') | ForEach-Object { Write-Host $_ }
    Write-Host 'Push concluido. Abra PR para incorporar o trabalho; este script nunca faz merge/deploy.'
  }
  if ($Acao -eq 'encerrar' -and -not $Publicar) {
    Write-Host 'Encerramento apenas auditado: commits e alteracoes nao foram enviados automaticamente.'
    Write-Host 'Para sincronizar: revise as alteracoes, crie commits seguros e use -Acao encerrar -Publicar.'
  }
  Write-Host 'Concluido. Nao houve reset, clean, stash ou force push.'
} catch {
  Write-Error $_
  exit 1
}
