# Shows one Windows notification for Nurse's Log (lib/toast.js). The text comes in
# through env vars: NL_TOAST_TITLE, NL_TOAST_BODY, NL_TOAST_LAUNCH (nurseslog: link)
# and NL_TOAST_APPID. "reminder" keeps it on screen until it is dismissed or opened.
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]

function Esc([string]$s) { [Security.SecurityElement]::Escape($s) }

$launch = Esc $env:NL_TOAST_LAUNCH
$xml = @"
<toast activationType="protocol" launch="$launch" scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>$(Esc $env:NL_TOAST_TITLE)</text>
      <text>$(Esc $env:NL_TOAST_BODY)</text>
    </binding>
  </visual>
  <actions>
    <action content="Open Nurse's Log" activationType="protocol" arguments="$launch" />
    <action content="Dismiss" activationType="system" arguments="dismiss" />
  </actions>
  <audio src="ms-winsoundevent:Notification.Reminder" />
</toast>
"@

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:NL_TOAST_APPID).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
