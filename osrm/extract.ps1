# SafeStep OSRM Data Extraction Script
# Run this whenever you update safestep.lua or download a new .osm.pbf file
# Requires Docker to be running

$ErrorActionPreference = "Stop"
$OSRM_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$DATA_FILE = "london.osm.pbf"
$PROFILE = "safestep.lua"

Write-Host "SafeStep OSRM Extraction" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host "Data:    $OSRM_DIR\$DATA_FILE"
Write-Host "Profile: $OSRM_DIR\$PROFILE"
Write-Host ""

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "ERROR: Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check source files exist
if (-not (Test-Path "$OSRM_DIR\$DATA_FILE")) {
    Write-Host "ERROR: $DATA_FILE not found in $OSRM_DIR" -ForegroundColor Red
    Write-Host "Download London OSM data from: https://download.geofabrik.de/europe/great-britain/england/greater-london.html"
    exit 1
}

Write-Host "Step 1/3: Extracting OSM data with SafeStep profile..." -ForegroundColor Yellow
docker run --rm -t -v "${OSRM_DIR}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract `
    -p /data/$PROFILE /data/$DATA_FILE
if ($LASTEXITCODE -ne 0) { Write-Host "Extraction failed." -ForegroundColor Red; exit 1 }

Write-Host "Step 2/3: Partitioning..." -ForegroundColor Yellow
docker run --rm -t -v "${OSRM_DIR}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition `
    /data/london.osrm
if ($LASTEXITCODE -ne 0) { Write-Host "Partition failed." -ForegroundColor Red; exit 1 }

Write-Host "Step 3/3: Customising..." -ForegroundColor Yellow
docker run --rm -t -v "${OSRM_DIR}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize `
    /data/london.osrm
if ($LASTEXITCODE -ne 0) { Write-Host "Customise failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Extraction complete. Run osrm/serve.ps1 to start the routing server." -ForegroundColor Green
