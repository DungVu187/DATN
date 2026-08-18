param(
    [string]$TaskName = "NovaEcomWeb MongoDB Daily Backup",
    [string]$RunAt = "04:00",
    [string]$DbName = "Ecom",
    [int]$KeepDays = 14,
    [string]$RunAsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupScript = Join-Path -Path $PSScriptRoot -ChildPath "backup_db.ps1"

if (!(Test-Path -LiteralPath $BackupScript)) {
    throw "Backup script not found: $BackupScript"
}

$ArgumentParts = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$BackupScript`"",
    "-KeepDays", $KeepDays
)

$ArgumentParts += @("-DbName", "`"$DbName`"")

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument ($ArgumentParts -join " ") `
    -WorkingDirectory $ProjectRoot

$Trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# S4U: chay ca khi user KHONG dang logon (khong luu mat khau).
# Can quyen "Log on as a batch job" cho user - mac dinh Administrator co san.
$Principal = New-ScheduledTaskPrincipal `
    -UserId $RunAsUser `
    -LogonType S4U `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Daily MongoDB backup for NovaEcomWeb" `
    -Force | Out-Null

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Runs daily at: $RunAt"
Write-Output "Runs as user: $RunAsUser (S4U - chay ca khi khong logon)"
Write-Output "Backup script: $BackupScript"
