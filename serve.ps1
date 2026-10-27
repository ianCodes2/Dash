param(
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\')
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
}

try {
  $listener.Start()
  Write-Host "Northstar is running at http://localhost:$Port/"
  Write-Host "Press Ctrl+C to stop."
} catch {
  Write-Host "Could not start the server: $($_.Exception.Message)"
  exit 1
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = [Uri]::UnescapeDataString($request.Url.AbsolutePath)
      if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }

      $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $response.Close()
        continue
      }

      if (Test-Path -LiteralPath $full -PathType Container) {
        $full = Join-Path $full 'index.html'
      }

      if (Test-Path -LiteralPath $full -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($full)
        $extension = [IO.Path]::GetExtension($full).ToLowerInvariant()
        $response.ContentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { 'application/octet-stream' }
        $response.ContentLength64 = $bytes.Length
        $response.Headers['Cache-Control'] = 'no-store'
        if ($request.HttpMethod -ne 'HEAD') {
          $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $response.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes('Not found')
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.ContentLength64 = $body.Length
        if ($request.HttpMethod -ne 'HEAD') {
          $response.OutputStream.Write($body, 0, $body.Length)
        }
      }
    } catch {
      $response.StatusCode = 500
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
