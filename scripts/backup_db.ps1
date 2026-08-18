param(
    [string]$DbName = "test"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path -Path $ProjectRoot -ChildPath "wdata"
$LogFile = Join-Path -Path $BackupRoot -ChildPath "backup.log"
$MongoDumpPath = "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"

if (!(Test-Path -Path $BackupRoot)) {
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
}

function Get-LogTimestamp {
    return [DateTime]::Now.ToString("ddd MM/dd/yyyy  h:mm:ss.ff", [System.Globalization.CultureInfo]::InvariantCulture)
}

function Write-BackupLog {
    param([string]$Message)
    Write-Output $Message
    Add-Content -Path $LogFile -Value $Message
}

if (!(Test-Path -Path $MongoDumpPath)) {
    $TimeErr = Get-LogTimestamp
    Write-BackupLog "[ERROR] $TimeErr - mongodump.exe not found at `"$MongoDumpPath`". Backup stopped."
    exit 1
}

$DateString = Get-Date -Format "yyyy-MM-dd"
$BackupFileName = "${DbName}_${DateString}_ 400.archive.gz"
$BackupFile = Join-Path -Path $BackupRoot -ChildPath $BackupFileName

$Time1 = Get-LogTimestamp
Write-BackupLog "[INFO] $Time1 - Backing up database `"$DbName`" to `"$BackupFile`""
Write-BackupLog "[INFO] Database: $DbName"
Write-BackupLog "[INFO] Archive: $BackupFile"

try {
    & $MongoDumpPath --db $DbName --archive=$BackupFile --gzip 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "mongodump exited with code $LASTEXITCODE"
    }

    if (!(Test-Path -Path $BackupFile)) {
        throw "Backup archive was not created: $BackupFile"
    }

    $BackupSize = (Get-Item -Path $BackupFile).Length
    if ($BackupSize -le 0) {
        throw "Backup archive is empty: $BackupFile"
    }

    $Time2 = Get-LogTimestamp
    Write-BackupLog "[INFO] $Time2 - Backup completed! File size: $BackupSize bytes"

    $LimitDate = (Get-Date).AddDays(-7)
    Get-ChildItem -Path $BackupRoot -Filter "${DbName}_*.archive*" | Where-Object { $_.LastWriteTime -lt $LimitDate } | ForEach-Object {
        Remove-Item -Path $_.FullName -Force
    }

    $Time3 = Get-LogTimestamp
    Write-BackupLog "[INFO] $Time3 - Old backups cleaned up."
} catch {
    $TimeErr = Get-LogTimestamp
    Write-BackupLog "[ERROR] $TimeErr - Backup failed: $_"
    exit 1
}
