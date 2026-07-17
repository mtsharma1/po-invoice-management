Option Explicit

Dim app, db, rs

On Error Resume Next
Set app = GetObject(, "Access.Application")
If app Is Nothing Then
  WScript.Echo "ERROR|Microsoft Access is not currently open."
  WScript.Quit 2
End If
On Error GoTo 0

WScript.Echo "DATABASE|" & app.CurrentProject.FullName

PrintEval app, "SuitCaseTotalPendingOrders()"
PrintEval app, "SuitCaseDispatchAvgLastMonth()"
PrintEval app, "SuitCaseDaysOrderInHnad(1000)"
PrintEval app, "BPTotalPendingOrders()"
PrintEval app, "BPDispatchAvgLastMonth()"
PrintEval app, "BPDaysOrderInHnad(1000)"

Set db = app.CurrentDb
Set rs = db.OpenRecordset( _
  "SELECT Category, Sum(PendingQty) AS TotalPending " & _
  "FROM qryPendingQty GROUP BY Category ORDER BY Category")
Do Until rs.EOF
  WScript.Echo "PENDING|" & rs.Fields("Category").Value & "|" & NzText(rs.Fields("TotalPending").Value)
  rs.MoveNext
Loop
rs.Close

Set rs = db.OpenRecordset( _
  "SELECT Category, Sum(DispatchQty) AS TotalDispatch " & _
  "FROM qryDispatch " & _
  "WHERE Month([DispatchDate])=Month(Date()) " & _
  "GROUP BY Category ORDER BY Category")
Do Until rs.EOF
  WScript.Echo "CURRENT_MONTH_DISPATCH|" & rs.Fields("Category").Value & "|" & NzText(rs.Fields("TotalDispatch").Value)
  rs.MoveNext
Loop
rs.Close

Sub PrintEval(accessApp, expression)
  Dim value
  On Error Resume Next
  Err.Clear
  value = accessApp.Eval(expression)
  If Err.Number <> 0 Then
    WScript.Echo "EVAL_ERROR|" & expression & "|" & Err.Number & "|" & Err.Description
    Err.Clear
  Else
    WScript.Echo "EVAL|" & expression & "|" & NzText(value)
  End If
  On Error GoTo 0
End Sub

Function NzText(value)
  If IsNull(value) Then
    NzText = "0"
  Else
    NzText = CStr(value)
  End If
End Function
