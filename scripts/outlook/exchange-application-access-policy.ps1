<#
  Fase 6/H3 - Application Access Policy (Exchange Online) para limitar o app 'ACC Outlook Reader' (Mail.Read de aplicativo)
  SOMENTE as caixas autorizadas. NAO EXECUTAR sem a aprovacao do responsavel e do administrador do tenant.
  Este script NAO foi executado por ninguem. Por padrao roda em modo SIMULACAO (-WhatIf) e RECUSA executar sem confirmacao explicita.

  Pre-requisitos: modulo ExchangeOnlineManagement; papel Organization Management; a caixa precisa ser EXCHANGE ONLINE
  (caixa hospedada no Google - ex.: MX aspmx.l.google.com - NAO e alcancavel pelo Graph; ver docs/outlook-achado-crm-axion-mx-google.md).
  Propagacao da politica: ate ~30 min a 1 h.
  Alternativa moderna e preferivel quando disponivel: RBAC for Applications (Exchange) com escopo por grupo/unidade administrativa.

  Uso (simulacao):  pwsh ./exchange-application-access-policy.ps1 -AppId <GUID do app> -GroupEmail acc-outlook-reader@<dominio> -Mailboxes crm@axion.com.br
  Uso (aplicar):    $env:ACC_OUTLOOK_POLICY_CONFIRMED='SIM'; pwsh ./exchange-application-access-policy.ps1 ... -Apply
#>
param(
  [Parameter(Mandatory = $true)][string]$AppId,
  [Parameter(Mandatory = $true)][string]$GroupEmail,
  [Parameter(Mandatory = $true)][string[]]$Mailboxes,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'AppId invalido (esperado GUID).' }
if ($Apply -and $env:ACC_OUTLOOK_POLICY_CONFIRMED -ne 'SIM') { throw 'Recusado: defina ACC_OUTLOOK_POLICY_CONFIRMED=SIM somente apos aprovacao do responsavel e do administrador.' }

Write-Host "Modo: $(if ($Apply) { 'APLICAR' } else { 'SIMULACAO (nada sera alterado)' })"
Write-Host "App: $AppId | Grupo: $GroupEmail | Caixas: $($Mailboxes -join ', ')"

if (-not $Apply) {
  Write-Host '[simulacao] Connect-ExchangeOnline'
  Write-Host "[simulacao] New-DistributionGroup -Name 'ACC Outlook Reader Scope' -Type Security -PrimarySmtpAddress $GroupEmail"
  foreach ($m in $Mailboxes) { Write-Host "[simulacao] Add-DistributionGroupMember -Identity $GroupEmail -Member $m" }
  Write-Host "[simulacao] New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $GroupEmail -AccessRight RestrictAccess -Description 'ACC leitura restrita'"
  Write-Host "[simulacao] Test-ApplicationAccessPolicy -AppId $AppId -Identity <caixa autorizada>   # esperado: Granted"
  Write-Host "[simulacao] Test-ApplicationAccessPolicy -AppId $AppId -Identity <caixa NAO autorizada> # esperado: Denied"
  return
}

Connect-ExchangeOnline
New-DistributionGroup -Name 'ACC Outlook Reader Scope' -Type Security -PrimarySmtpAddress $GroupEmail | Out-Null
foreach ($m in $Mailboxes) { Add-DistributionGroupMember -Identity $GroupEmail -Member $m }
New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $GroupEmail -AccessRight RestrictAccess -Description 'ACC leitura restrita' | Out-Null
foreach ($m in $Mailboxes) { Test-ApplicationAccessPolicy -AppId $AppId -Identity $m }
Write-Host 'Verifique manualmente que uma caixa NAO listada retorna Denied antes de habilitar a coleta.'
# ROLLBACK: Remove-ApplicationAccessPolicy -Identity <id da politica>; Remove-DistributionGroup -Identity $GroupEmail
