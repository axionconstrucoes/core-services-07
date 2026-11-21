# Executor GUARDADO do kit de homologação. Lê a senha do banco do acc-homolog de um arquivo DPAPI (criado por salvar-segredos-homolog.ps1),
# monta HOMOLOG_DATABASE_URL SOMENTE para o processo filho e NUNCA a imprime. O próprio kit (guard.mjs) ainda recusa qualquer alvo que não seja o
# acc-homolog (ref gtadbeaevxglrqkhcwfz) e qualquer ref/host operacional.
# Uso (da raiz do repositório, pelo Git Bash ou PowerShell):
#   powershell -NoProfile -File scripts\homolog\executar-homolog.ps1 -Etapa <etapa> [-Pooler aws-0-sa-east-1.pooler.supabase.com]
# Etapas: ping | apply-dry | init-marker | apply | verify | seed-dry | seed-apply
param(
  [Parameter(Mandatory = $true)][ValidateSet('ping', 'apply-dry', 'init-marker', 'apply', 'verify', 'seed-dry', 'seed-apply')][string]$Etapa,
  [string]$Pooler = ''
)
$ErrorActionPreference = 'Stop'
$ref = 'gtadbeaevxglrqkhcwfz'
$operacionais = @('plbcvwostmdmdmrziwmd', 'jawaqwtcukrexnisogzo', 'asaraykwyhmdiyrlaupq')
if ($operacionais -contains $ref) { throw 'ref operacional: recusado' }

$dir = Join-Path $env:SystemDrive 'vibe\homolog\secret'
$dbFile = Join-Path $dir 'db.dpapi'
if (-not (Test-Path -LiteralPath $dbFile)) { throw "senha do banco não encontrada. O responsável deve rodar scripts\homolog\salvar-segredos-homolog.ps1 (veja o cabeçalho)." }
$sec = (Get-Content -LiteralPath $dbFile -Raw).Trim() | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$enc = [Uri]::EscapeDataString($pw)

if ($Pooler) { $user = "postgres.$ref"; $dbHost = $Pooler } else { $user = 'postgres'; $dbHost = "db.$ref.supabase.co" }
$env:HOMOLOG_DATABASE_URL = "postgresql://${user}:${enc}@${dbHost}:5432/postgres"
$env:HOMOLOG_TARGET_REF = $ref
$env:HOMOLOG_I_UNDERSTAND_ISOLATED = 'true'
$env:NODE_NO_WARNINGS = '1'
if (-not $env:ACC_REALPG_PKG_DIR) { $env:ACC_REALPG_PKG_DIR = Join-Path $env:SystemDrive 'vibe\pgtest\node' }
$pw = $null; $enc = $null

# Contas de teste (seed): arquivo FORA do repositório, uma por linha, CODIGO=email@axion.com.br (ver env-template/contas-teste.template.txt).
$contas = Join-Path $env:SystemDrive 'vibe\homolog\contas-teste.txt'
if (Test-Path -LiteralPath $contas) {
  $linhas = Get-Content -LiteralPath $contas | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') -and $_ -match '^P-[A-Z0-9]+=' }
  if ($linhas) { $env:HOMOLOG_TEST_ACCOUNTS = ($linhas -join ';') }
}

$map = @{
  'ping'        = @('scripts/homolog/apply-migrations.mjs');
  'apply-dry'   = @('scripts/homolog/apply-migrations.mjs');
  'init-marker' = @('scripts/homolog/apply-migrations.mjs', '--init-marker');
  'apply'       = @('scripts/homolog/apply-migrations.mjs', '--apply');
  'verify'      = @('scripts/homolog/apply-migrations.mjs', '--verify');
  'seed-dry'    = @('scripts/homolog/seed-e-perfis.mjs');
  'seed-apply'  = @('scripts/homolog/seed-e-perfis.mjs', '--apply')
}
$args2 = $map[$Etapa]
node --no-warnings @args2
exit $LASTEXITCODE
