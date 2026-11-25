# Guarda os SEGREDOS do projeto de HOMOLOGAÇÃO acc-homolog de forma CRIPTOGRAFADA (DPAPI: só o seu usuário do Windows lê, só nesta máquina).
# EXECUTE VOCÊ MESMO, em uma janela normal do PowerShell (NÃO pelo Claude, NÃO colando a senha na conversa):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\homolog\salvar-segredos-homolog.ps1
# Pede (sem eco): 1) a SENHA DO BANCO do acc-homolog (a definida na criação do projeto; se esqueceu, redefina em
# Project Settings > Database > Reset database password — é do projeto de HOMOLOGAÇÃO) e 2) a chave SECRETA (service_role/secret) do acc-homolog
# (Project Settings > API Keys). Nada é impresso nem gravado em texto puro. Pasta de destino: %SystemDrive%\vibe\homolog\secret (fora do repositório).
$ErrorActionPreference = 'Stop'
$ref = 'gtadbeaevxglrqkhcwfz'
$dir = Join-Path $env:SystemDrive 'vibe\homolog\secret'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Save-Secret([string]$prompt, [string]$file) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  if ($s.Length -lt 8) { throw "valor curto demais; nada foi gravado" }
  $s | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $dir $file) -Encoding ascii
  Write-Host "gravado (criptografado): $file"
}

Write-Host "Projeto de HOMOLOGAÇÃO: $ref (NUNCA use dados do projeto operacional)"
Save-Secret "Senha do BANCO do acc-homolog" 'db.dpapi'
$sk = Read-Host -Prompt "Chave SECRETA (service_role/secret) do acc-homolog [Enter para pular]" -AsSecureString
if ($sk.Length -ge 20) { $sk | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $dir 'sk.dpapi') -Encoding ascii; Write-Host "gravado (criptografado): sk.dpapi" } else { Write-Host "chave secreta não informada (necessária só para o APP de homologação)" }
Write-Host "Pronto. Avise o Claude: ele usará scripts\homolog\executar-homolog.ps1 sem nunca ver os valores."
