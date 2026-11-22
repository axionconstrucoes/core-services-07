# Guarda a chave service_role EXCLUSIVA do projeto acc-homolog (gtadbeaevxglrqkhcwfz) criptografada com DPAPI (so o seu usuario do Windows,
# so esta maquina). EXECUTE VOCE MESMO, em uma janela normal do PowerShell (NAO pelo Claude, NAO cole a chave na conversa):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\homolog\salvar-service-role-homolog.ps1
# Onde achar a chave: painel do Supabase > projeto acc-homolog > Project Settings > API Keys > "service_role" (legacy, formato eyJ...)
#   ou a chave secreta (sb_secret_...). Use SOMENTE a do acc-homolog. NUNCA a de producao (plbcvwostmdmdmrziwmd) nem de outro projeto.
# O que o script faz: (1) pede a chave SEM ECO; (2) recusa se for JWT de outro projeto ou de outro papel; (3) valida AO VIVO contra o host do
# acc-homolog (leitura de 1 linha de projects, que so a service_role consegue por causa do RLS) sem colocar a chave na linha de comando;
# (4) so entao grava em <SystemDrive>\vibe\homolog\secret\service-role.dpapi (arquivo NOVO; o sk.dpapi antigo nao e tocado; se o novo ja existir, vira .bak-<data>).
# Nada e impresso: nem a chave, nem parte dela. A chave nunca e gravada em texto puro.
$ErrorActionPreference = 'Stop'
$ref = 'gtadbeaevxglrqkhcwfz'
$operacionais = @('plbcvwostmdmdmrziwmd', 'jawaqwtcukrexnisogzo', 'asaraykwyhmdiyrlaupq')
if ($operacionais -contains $ref) { throw 'ref operacional: recusado' }
$dir = Join-Path $env:SystemDrive 'vibe\homolog\secret'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$destino = Join-Path $dir 'service-role.dpapi'

Write-Host "Projeto de HOMOLOGACAO: $ref (NUNCA use a chave do projeto operacional)"
$sec = Read-Host -Prompt 'Chave service_role do acc-homolog (sem eco)' -AsSecureString
if ($sec.Length -lt 20) { throw 'valor curto demais; nada foi gravado' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $k = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  # (2) conferencia local do formato
  $ehJwt = $k.StartsWith('eyJ')
  if ($ehJwt) {
    $partes = $k.Split('.')
    if ($partes.Count -ne 3) { throw 'JWT malformado; nada foi gravado' }
    $p64 = $partes[1].Replace('-', '+').Replace('_', '/'); while ($p64.Length % 4) { $p64 += '=' }
    $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p64)) | ConvertFrom-Json
    if ($payload.ref -ne $ref) { throw 'esta chave NAO e do acc-homolog (ref diferente); nada foi gravado' }
    if ($payload.role -ne 'service_role') { throw 'esta chave NAO e service_role (papel diferente); nada foi gravado' }
  } elseif (-not $k.StartsWith('sb_secret_')) {
    throw 'formato nao reconhecido (esperado eyJ... legacy service_role ou sb_secret_...); nada foi gravado'
  }

  # (3) validacao ao vivo: a chave vai por config no STDIN do curl (nao aparece na lista de processos)
  $cfg = "url = `"https://$ref.supabase.co/rest/v1/projects?select=id&limit=1`"`nsilent`nmax-time = 30`nwrite-out = `"\n%{http_code}`"`nheader = `"apikey: $k`"`n"
  if ($ehJwt) { $cfg += "header = `"Authorization: Bearer $k`"`n" }
  $saida = $cfg | & curl.exe -K - 2>$null
  $cfg = $null
  $linhas = @($saida -split "`n")
  $status = $linhas[-1].Trim()
  $corpo = ($linhas[0..($linhas.Count - 2)] -join "`n").Trim()
  if ($status -ne '200') { throw "validacao ao vivo falhou (HTTP $status): chave invalida para o acc-homolog; nada foi gravado" }
  if ($corpo -eq '[]' -or $corpo -eq '') { throw 'a chave autenticou mas NAO ignora o RLS (leitura vazia): nao e service_role; nada foi gravado' }

  # (4) gravar (arquivo novo; backup do anterior, se houver)
  if (Test-Path -LiteralPath $destino) { Move-Item -LiteralPath $destino -Destination "$destino.bak-$(Get-Date -Format yyyyMMddHHmmss)" }
  $sec | ConvertFrom-SecureString | Set-Content -LiteralPath $destino -Encoding ascii
  Write-Host 'OK: chave validada contra o acc-homolog e gravada (criptografada): service-role.dpapi'
  Write-Host 'Pronto. Avise o Claude: ele usara scripts\homolog\executar-homolog.ps1 sem nunca ver o valor.'
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $k = $null; $payload = $null; $saida = $null; $corpo = $null
  [GC]::Collect()
}
