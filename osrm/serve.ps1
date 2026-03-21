# SafeStep OSRM Server Script
# Starts the OSRM routing server on port 5000
# Requires Docker to be running and data to be extracted first (run extract.ps1)

$ErrorActionPreference = "Stop"
$OSRM_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PORT = 5000
$CONTAINER_NAME = "safestep-osrm"

Write-Host "SafeStep OSRM Server" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "ERROR: Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check extracted data exists
if (-not (Test-Path "$OSRM_DIR\london.osrm.properties")) {
    Write-Host "ERROR: Extracted data not found. Run osrm/extract.ps1 first." -ForegroundColor Red
    exit 1
}

# Stop and remove any existing container with the same name
$existing = docker ps -aq --filter "name=$CONTAINER_NAME" 2>$null
if ($existing) {
    Write-Host "Stopping existing container..." -ForegroundColor Yellow
    docker stop $CONTAINER_NAME | Out-Null
    docker rm $CONTAINER_NAME | Out-Null
}

Write-Host "Starting OSRM server on port $PORT..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop."
Write-Host ""

docker run --rm `
    --name $CONTAINER_NAME `
    -p "${PORT}:5000" `
    -v "${OSRM_DIR}:/data" `
    ghcr.io/project-osrm/osrm-backend osrm-routed `
    --algorithm mld `
    --max-table-size 10000 `
    /data/london.osrm

Write-Host "Server stopped." -ForegroundColor Yellow
