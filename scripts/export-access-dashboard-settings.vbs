Option Explicit

Const acQuery = 1
Const acForm = 2
Const acModule = 5

Dim accessApp, fso, outDir, sourceDb, createdApp, currentDb
sourceDb = "E:\My Client\Teakwood\PO & Invoice Managemnt\PO and Invoice Management V1.03.accdb"
outDir = "E:\My Client\Teakwood\PO & Invoice Managemnt\Web Version\po-invoice-management\access-reference"
createdApp = False

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(outDir) Then fso.CreateFolder(outDir)

On Error Resume Next
Set accessApp = GetObject(, "Access.Application")
On Error GoTo 0

If accessApp Is Nothing Then
  Set accessApp = CreateObject("Access.Application")
  createdApp = True
  accessApp.OpenCurrentDatabase sourceDb, False
Else
  On Error Resume Next
  currentDb = accessApp.CurrentProject.FullName
  On Error GoTo 0
  If LCase(currentDb) <> LCase(sourceDb) Then
    If LCase(currentDb) = LCase(Replace(sourceDb, ".accdb", "_Local.accdb")) Then
      WScript.Echo "INFO|Using active local working copy: " & currentDb
    Else
      WScript.Echo "ERROR|Active Access database is not the requested application: " & currentDb
      WScript.Quit 2
    End If
  End If
End If

ExportObject accessApp, acForm, "frmSettings", outDir & "\frmSettings.txt"
ExportObject accessApp, acForm, "frmDashboard", outDir & "\frmDashboard.txt"
ExportObject accessApp, acForm, "frmUsers", outDir & "\frmUsers.txt"
ExportObject accessApp, acForm, "frmUsers_Edit", outDir & "\frmUsers_Edit.txt"
ExportObject accessApp, acModule, "modDashboard", outDir & "\modDashboard.bas"
ExportObject accessApp, acModule, "User", outDir & "\User.bas"
ExportObject accessApp, acModule, "AccessType", outDir & "\AccessType.bas"

Dim queryDef, queryOut
For Each queryDef In accessApp.CurrentDb.QueryDefs
  If Left(queryDef.Name, 1) <> "~" Then
    queryOut = outDir & "\query_" & SafeName(queryDef.Name) & ".txt"
    On Error Resume Next
    accessApp.SaveAsText acQuery, queryDef.Name, queryOut
    If Err.Number = 0 Then WScript.Echo "OK|Query|" & queryDef.Name
    Err.Clear
    On Error GoTo 0
  End If
Next

If createdApp Then
  accessApp.CloseCurrentDatabase
  accessApp.Quit
End If

WScript.Echo "DONE|" & outDir

Sub ExportObject(app, objectType, objectName, filePath)
  On Error Resume Next
  app.SaveAsText objectType, objectName, filePath
  If Err.Number <> 0 Then
    WScript.Echo "ERROR|" & objectName & "|" & Err.Number & "|" & Err.Description
    Err.Clear
  Else
    WScript.Echo "OK|" & objectName & "|" & filePath
  End If
  On Error GoTo 0
End Sub

Function SafeName(value)
  Dim result
  result = Replace(value, "\\", "_")
  result = Replace(result, "/", "_")
  result = Replace(result, ":", "_")
  result = Replace(result, "*", "_")
  result = Replace(result, "?", "_")
  result = Replace(result, Chr(34), "_")
  result = Replace(result, "<", "_")
  result = Replace(result, ">", "_")
  result = Replace(result, "|", "_")
  SafeName = result
End Function
