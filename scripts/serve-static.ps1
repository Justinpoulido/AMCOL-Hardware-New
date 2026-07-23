$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$port = 3000
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)

$contentTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".js" = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg" = "image/svg+xml"
    ".webp" = "image/webp"
    ".png" = "image/png"
    ".jpg" = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif" = "image/gif"
    ".ico" = "image/x-icon"
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [byte[]]$Body,
        [string]$ContentType = "text/plain; charset=utf-8"
    )

    $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

function Get-SafePath {
    param([string]$RequestPath)

    $pathOnly = ($RequestPath -split "\?")[0]
    if ([string]::IsNullOrWhiteSpace($pathOnly) -or $pathOnly -eq "/") {
        $pathOnly = "/index.html"
    }

    $decoded = [System.Uri]::UnescapeDataString($pathOnly).TrimStart("/")
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $decoded))
    if (-not $candidate.StartsWith($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $candidate
}

function Get-FallbackPath {
    param([string]$RequestPath)

    $pathOnly = [System.Uri]::UnescapeDataString(($RequestPath -split "\?")[0])
    if ($pathOnly -match "^/products/?$") {
        return Join-Path $root "products.html"
    }
    if ($pathOnly -match "^/brand-[a-z0-9-]+\.html$") {
        return Join-Path $root "products.html"
    }
    if ($pathOnly -match "^/.+-[0-9]+\.html$") {
        return Join-Path $root "product-detail.html"
    }
    return $null
}

try {
    $listener.Start()
    Write-Host "AMCOL dev server running at http://127.0.0.1:3000/index.html"

    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $buffer = New-Object byte[] 8192
            $read = $stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) {
                continue
            }

            $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
            $requestLine = ($request -split "`r?`n")[0]
            $parts = $requestLine -split " "
            $requestPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
            $filePath = Get-SafePath $requestPath

            if ($null -eq $filePath) {
                Send-Response $stream 403 "Forbidden" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden"))
                continue
            }

            if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $fallbackPath = Get-FallbackPath $requestPath
                if ($null -eq $fallbackPath -or -not (Test-Path -LiteralPath $fallbackPath -PathType Leaf)) {
                    Send-Response $stream 404 "Not Found" ([System.Text.Encoding]::UTF8.GetBytes("Not found"))
                    continue
                }
                $filePath = $fallbackPath
            }

            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = if ($contentTypes.ContainsKey($extension)) { $contentTypes[$extension] } else { "application/octet-stream" }
            $body = [System.IO.File]::ReadAllBytes($filePath)
            Send-Response $stream 200 "OK" $body $contentType
        }
        catch {
            try {
                Send-Response $stream 500 "Internal Server Error" ([System.Text.Encoding]::UTF8.GetBytes("Server error"))
            }
            catch {
            }
        }
        finally {
            $client.Close()
        }
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    $listener.Stop()
}
