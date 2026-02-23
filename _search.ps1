$body = @{query=[char]0x732A; max_results=5; search_depth='basic'} | ConvertTo-Json -Compress
$headers = @{
    'Authorization' = "Bearer $env:TAVILY_API_KEY"
    'Content-Type'  = 'application/json'
}
$resp = Invoke-RestMethod -Uri 'https://api.tavily.com/search' -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
$resp | ConvertTo-Json -Depth 5
