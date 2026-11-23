# Guarda o TOKEN PESSOAL (PAT) do Supabase criptografado com DPAPI, para o ENSAIO do transporte do executor de migrations
# (Management API) SOMENTE no acc-homolog (gtadbeaevxglrqkhcwfz). EXECUTE VOCE MESMO, em uma janela normal do PowerShell
# (NAO pelo Claude, NAO cole o token na conversa, em arquivo ou em log):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\homolog\salvar-token-supabase.ps1
#
# ATENCAO DE SEGURANCA: um token pessoal do Supabase age com os poderes da SUA conta, em TODOS os projetos da organizacao, inclusive
# o de PRODUCAO. O executor so aceita o ref do acc-homolog neste modo, mas o token em si nao e restrito. Por isso:
#   - crie um token NOVO e exclusivo para este ensaio (nome sugerido: acc-executor-ensaio-homolog) e, se o painel oferecer, com a MENOR validade;
#   - REVOGUE-O no painel assim que o ensaio terminar (o script lembra no final);
#   - para a janela de producao, crie OUTRO token na hora; nunca reutilize este.
# O que o script faz: (1) pede o token SEM ECO; (2) confere o formato (sbp_...); (3) valida AO VIVO apenas contra o acc-homolog
# (GET /v1/projects/<ref do homolog>; a chave vai por stdin do curl, nunca na linha de comando; NAO consulta nenhum outro projeto);
# (4) so entao grava em <SystemDrive>\vibe\homolog\secret\supabase-pat.dpapi (arquivo NOVO; se ja existir, vira .bak-<data>).
# Nada e impresso: nem o token, nem parte dele. O token nunca e gravado em texto puro.
$ErrorActionPreference = 'Stop'
$ref = 'gtadbeaevxglrqkhcwfz'
$operacionais = @('plbcvwostmdmdmrziwmd', 'jawaqwtcukrexnisogzo', 'asaraykwyhmdiyrlaupq')
if ($operacionais -contains $ref) { throw 'ref operacional: recusado' }
$dir = Join-Path $env:SystemDrive 'vibe\homolog\secret'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$destino = Join-Path $dir 'supabase-pat.dpapi'

Write-Host "Ensaio do transporte do executor: projeto de HOMOLOGACAO $ref"
Write-Host 'Crie o token em: painel do Supabase > Account (seu avatar) > Access Tokens > Generate new token'
$sec = Read-Host -Prompt 'Token pessoal do Supabase (sem eco)' -AsSecureString
if ($sec.Length -lt 40) { throw 'valor curto demais; nada foi gravado' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $t.StartsWith('sbp_')) { throw 'formato nao reconhecido (esperado sbp_...); nada foi gravado' }

  # validacao ao vivo: SO o projeto de homologacao; token por config no stdin do curl
  $cfg = "url = `"https://api.supabase.com/v1/projects/$ref`"`nsilent`nmax-time = 30`nwrite-out = `"\n%{http_code}`"`nheader = `"Authorization: Bearer $t`"`nheader = `"Accept: application/json`"`n"
  $saida = $cfg | & curl.exe -K - 2>$null
  $cfg = $null
  $linhas = @($saida -split "`n")
  $status = $linhas[-1].Trim()
  $corpo = ($linhas[0..($linhas.Count - 2)] -join "`n").Trim()
  if ($status -eq '401' -or $status -eq '403') { throw "o Supabase recusou o token (HTTP $status); nada foi gravado" }
  if ($status -ne '200') { throw "validacao ao vivo falhou (HTTP $status); nada foi gravado" }
  $proj = $corpo | ConvertFrom-Json
  if ($proj.id -ne $ref -and $proj.ref -ne $ref) { throw 'a resposta nao e do acc-homolog; nada foi gravado' }
  Write-Host "Token aceito pelo Supabase para o projeto: $($proj.name) ($ref)"

  if (Test-Path -LiteralPath $destino) { Move-Item -LiteralPath $destino -Destination "$destino.bak-$(Get-Date -Format yyyyMMddHHmmss)" }
  $sec | ConvertFrom-SecureString | Set-Content -LiteralPath $destino -Encoding ascii
  Write-Host 'OK: token validado e gravado (criptografado): supabase-pat.dpapi'
  Write-Host 'Avise o Claude: ele rodara o ensaio com scripts\homolog\executar-homolog.ps1 -Etapa executor-api, sem nunca ver o valor.'
  Write-Host 'LEMBRETE: depois do ensaio, REVOGUE este token no painel (Account > Access Tokens).'
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $t = $null; $saida = $null; $corpo = $null; $proj = $null
  [GC]::Collect()
}
