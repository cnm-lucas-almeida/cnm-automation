$GLPI_URL = 'http://glpi.internal.com'
$APP_TOKEN = 'AjvccQ5Ct8PasGsuIbi245vbeIdgB6kFABZlmZiw'
$USER_TOKEN = 'StNTL7SGIbgUCJvrbWl5gXtedYNXfLcp1QqRtwvO'

$headers = @{ 'App-Token' = $APP_TOKEN; 'Authorization' = "user_token $USER_TOKEN"; 'Content-Type' = 'application/json' }
$session = (Invoke-RestMethod -Uri "$GLPI_URL/apirest.php/initSession" -Headers $headers).session_token
Write-Host "Session: $session"

$patchHeaders = @{ 'App-Token' = $APP_TOKEN; 'Session-Token' = $session; 'Content-Type' = 'application/json' }

$classifications = @{
  31=17; 33=17; 34=8; 41=13; 46=13; 55=12; 56=7; 58=22; 61=28; 62=4;
  63=7; 77=5; 81=12; 82=5; 83=5; 88=12; 90=12; 98=3; 100=4; 102=22;
  103=16; 105=5; 106=16; 107=8; 113=21; 150=12; 262=3; 266=13; 269=3; 273=5;
  289=5; 304=5; 327=4; 329=3; 336=12; 337=16; 338=13; 339=4; 340=22; 342=12;
  343=16; 345=12; 346=3; 348=12; 350=22; 351=12; 358=3; 363=12; 365=12; 368=13;
  372=11; 373=3; 374=12; 380=12; 381=12; 383=3; 385=12; 387=7; 388=12; 393=16;
  400=4; 402=28; 403=12; 404=28; 406=3; 407=17; 408=13; 410=17; 411=24; 413=6;
  415=12; 416=12; 418=5; 419=12; 420=24; 421=12; 423=12; 424=3; 426=3; 428=9;
  429=22; 430=3; 431=3; 433=4; 438=5; 440=16; 442=12; 446=12; 447=16; 448=12;
  449=3; 450=8; 452=12; 453=13; 454=5; 455=4; 456=16; 458=25; 459=4
}

$ok = 0; $fail = 0
foreach ($entry in $classifications.GetEnumerator()) {
  $ticketId = $entry.Key
  $catId = $entry.Value
  $body = '{"input":{"id":' + $ticketId + ',"itilcategories_id":' + $catId + '}}'
  try {
    $res = Invoke-RestMethod -Uri "$GLPI_URL/apirest.php/Ticket/$ticketId" -Method Put -Headers $patchHeaders -Body $body
    $ok++
    Write-Host "OK  #$ticketId -> cat $catId"
  } catch {
    $fail++
    Write-Host "ERR #$ticketId -> $($_.Exception.Message)"
  }
}

Invoke-RestMethod -Uri "$GLPI_URL/apirest.php/killSession" -Headers $patchHeaders -Method Get | Out-Null
Write-Host "`nConcluido: $ok OK, $fail falhos"
