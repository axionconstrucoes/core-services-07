# Sobe o APP de homologação localmente (npm run dev, http://localhost:3000) SOMENTE com variáveis do acc-homolog.
# Lê o dotenv público %SystemDrive%\vibe\homolog\.env.homolog e a chave secreta da homologação do arquivo DPAPI sk.dpapi (nunca impressa).
# RECUSA se: o ref da URL não for o do acc-homolog; houver ref/host/chave do operacional em QUALQUER variável do processo;
# houver integrações reais (Gmail, Construmanager, CRON, IA); ou ACC_OUTBOUND_MODE for 'production'.
# Uso (da raiz do repositório): powershell -NoProfile -File scripts\homolog\executar-app-homolog.ps1 [-Porta 3000] [-SoVerificar]
param([int]$Porta = 3000, [switch]$SoVerificar)
$ErrorActionPreference = 'Stop'
$ref = 'gtadbeaevxglrqkhcwfz'
$operacionais = @('plbcvwostmdmdmrziwmd', 'jawaqwtcukrexnisogzo', 'asaraykwyhmdiyrlaupq')
$dir = Join-Path $env:SystemDrive 'vibe\homolog'
$envFile = Join-Path $dir '.env.homolog'
if (-not (Test-Path -LiteralPath $envFile)) { throw "dotenv de homologação ausente: $envFile" }

# 0) o processo NÃO pode carregar nada do operacional nem integrações reais
$proibidosPrefixos = @('GOOGLE_GMAIL_', 'CONSTRUMANAGER_', 'AXIA_CHAT_', 'AXION_AI_PROVIDER', 'ANTHROPIC_', 'OPENAI_')
$proibidosNomes = @('CRON_SECRET', 'ACC_RISK_ALERTS_CRON_SECRET', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
foreach ($e in Get-ChildItem Env:) {
  $n = $e.Name
  if ($proibidosNomes -contains $n -or ($proibidosPrefixos | Where-Object { $n.StartsWith($_) })) { throw "variável '$n' já presente no shell: use um shell limpo (nada do operacional/integrações)" }
  foreach ($op in $operacionais) { if ($e.Value -and $e.Value.Contains($op)) { throw "variável '$n' contém referência a projeto operacional: recusado" } }
}

# 1) carrega o dotenv público
foreach ($l in Get-Content -LiteralPath $envFile) {
  $t = $l.Trim()
  if (-not $t -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
  $i = $t.IndexOf('='); $k = $t.Substring(0, $i).Trim(); $v = $t.Substring($i + 1).Trim()
  if ($v) { Set-Item -Path "Env:$k" -Value $v }
}
if ($env:NEXT_PUBLIC_SUPABASE_URL -ne "https://$ref.supabase.co") { throw 'NEXT_PUBLIC_SUPABASE_URL não é a do acc-homolog' }
if ($env:HOMOLOG_TARGET_REF -ne $ref) { throw 'HOMOLOG_TARGET_REF diferente do acc-homolog' }
foreach ($op in $operacionais) { foreach ($e in Get-ChildItem Env:) { if ($e.Value -and $e.Value.Contains($op)) { throw "referência operacional em '$($e.Name)'" } } }
if ($env:ACC_OUTBOUND_MODE -and $env:ACC_OUTBOUND_MODE -ne 'pilot') { throw 'ACC_OUTBOUND_MODE só pode ficar ausente ou "pilot" na homologação' }

# 2) chave secreta da homologação (DPAPI), apenas em memória do processo
$sk = Join-Path $dir 'secret\sk.dpapi'
if (-not (Test-Path -LiteralPath $sk)) { throw 'chave secreta da homologação ausente (rode salvar-segredos-homolog.ps1 e informe a chave)' }
$sec = (Get-Content -LiteralPath $sk -Raw).Trim() | ConvertTo-SecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $env:SUPABASE_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
if ($env:SUPABASE_SECRET_KEY.Length -lt 20) { throw 'chave secreta da homologação inválida' }
$env:AXION_APP_BASE_URL = "http://localhost:$Porta"
$env:NODE_NO_WARNINGS = '1'

Write-Host "Ambiente de HOMOLOGAÇÃO verificado: $($env:NEXT_PUBLIC_SUPABASE_URL) | URL do app: $($env:AXION_APP_BASE_URL) | nenhum valor operacional | envio real: bloqueado (modo piloto)"
if ($SoVerificar) { Write-Host 'Somente verificação: o app NÃO foi iniciado.'; exit 0 }
Set-Location (Join-Path (Get-Location) 'apps\web')
npm run dev -- --port $Porta
