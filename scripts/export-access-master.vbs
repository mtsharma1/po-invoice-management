Option Explicit

Const acQuery = 1
Const acForm = 2
Const acModule = 5

Dim accessApp, fso, outDir, sourceDb, createdApp, currentDb
sourceDb = "E:\My Client\Teakwood\PO & Invoice Managemnt\PO and Invoice Management V1.03.accdb"
outDir = "E:\My Client\Teakwood\PO & Invoice Managemnt\Web Version\po-invoice-management\access-reference"
createdApp = False
Set accessApp = Nothing

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
  currentDb = accessApp.CurrentProject.FullName
  If LCase(currentDb) <> LCase(sourceDb) Then
    If LCase(currentDb) = LCase(Replace(sourceDb, ".accdb", "_Local.accdb")) Then
      WScript.Echo "INFO|Using active local working copy: " & currentDb
    Else
      WScript.Echo "ERROR|Active Access database is not the requested application: " & currentDb
      WScript.Quit 2
    End If
  End If
End If

ExportObject accessApp, acForm, "frmMaster", outDir & "\frmMaster.txt"
ExportObject accessApp, acForm, "frmPODetails", outDir & "\frmPODetails.txt"
ExportObject accessApp, acForm, "frmMainMenu", outDir & "\frmMainMenu.txt"
ExportObject accessApp, acModule, "SaveMasterItem", outDir & "\SaveMasterItem.bas"
ExportObject accessApp, acModule, "modFactoryDispatchDate", outDir & "\modFactoryDispatchDate.bas"
ExportObject accessApp, acModule, "modFormFunction", outDir & "\modFormFunction.bas"
ExportObject accessApp, acQuery, "qryMaster", outDir & "\query_qryMaster.txt"

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
