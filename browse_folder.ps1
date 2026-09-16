Add-Type -AssemblyName System.Windows.Forms

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.Opacity = 0
$form.ShowInTaskbar = $false
$form.Width = 1
$form.Height = 1
$form.StartPosition = 'CenterScreen'
$form.Show()
$form.BringToFront()
$form.Activate()

$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select Destination Folder for Video Downloads"
$f.ShowNewFolderButton = $true

$result = $f.ShowDialog($form)
$form.Close()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $f.SelectedPath
}
