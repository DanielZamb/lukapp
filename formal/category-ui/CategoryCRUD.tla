------------------------- MODULE CategoryCRUD -------------------------
EXTENDS Naturals, Sequences, RealCRUD
VARIABLES ui, prior, action
vars == <<ui, prior, action>>
Init == /\ ui \in InitialStates /\ prior = ui /\ action = "Init"
Next == \E edge \in Edges:
  /\ ui = edge.from /\ ui' = edge.to /\ prior' = ui /\ action' = edge.event
Spec == Init /\ [][Next]_vars
Current == Observations[ui]
Before == Observations[prior]
TypeOK == /\ ui \in 1..Len(Observations) /\ prior \in 1..Len(Observations)
NewRequests == (Len(Before.requests) + 1)..Len(Current.requests)
DeleteMethod == "ZGVsZXRl"
CustomEditor == "Y3VzdG9t"
WeekendName == "V2Vla2VuZA=="
Sparkles == "4pyo"
OriginalId == "b3JpZ2luYWw="
UnavailableLabel == "VW5hdmFpbGFibGUgY2F0ZWdvcnk="

CRUDRequestIntegrity ==
  /\ Len(Current.requests) <= Len(Before.requests) + 1
  /\ \A n \in NewRequests:
       /\ Current.expectedMethod # ""
       /\ Current.requests[n].method = Current.expectedMethod
       /\ Current.requests[n].exact = Current.expectedPayload
       /\ Current.busy /\ Current.editorOpen

CRUDDeleteConfirmation == \A n \in NewRequests:
  Current.requests[n].method = DeleteMethod =>
    /\ action = "DeleteConfirm" /\ Before.confirmingDelete

CRUDFrozenEditor == action = "FrozenCallbacks" =>
  /\ Current.editor = Before.editor /\ Current.requests = Before.requests
CRUDRetryRetention == action = "ReplyFailed" =>
  /\ Current.editor = Before.editor /\ Current.editorOpen
  /\ ~Current.busy /\ Current.error # ""
CRUDDismissal == (action = "NativeDismiss" /\ ~Before.busy) =>
  /\ ~Current.editorOpen /\ ~Current.confirmingDelete
  /\ Current.requests = Before.requests
CRUDAccountHandoff ==
  /\ Current.handoff # "" =>
       /\ Current.dismissedAfterAccount /\ Current.handoff = Current.accountExpected
       /\ Current.requests = <<>>
  /\ (action = "NativeDismiss" /\ Before.accountExpected # "") =>
       Current.handoff = Before.accountExpected

HasRow(id) == \E n \in 1..Len(Current.rowIds): Current.rowIds[n] = id
DeletedSelectionRecoverable ==
  /\ \A n \in 1..Len(Current.selected):
       ~HasRow(Current.selected[n]) =>
         /\ ~Current.canClassify
         /\ \E o \in 1..Len(Current.options):
              /\ Current.options[o].id = Current.selected[n]
              /\ Current.options[o].label = UnavailableLabel
              /\ Current.options[o].selected
  /\ action = "CatalogRecreate" => Current.selected = Before.selected
  /\ action = "DeselectUnavailable" =>
       \A n \in 1..Len(Current.selected): Current.selected[n] # OriginalId

CRUDFieldIntent ==
  /\ action = "NameFinal" =>
       /\ Current.name = WeekendName
       /\ Before.editorKind = CustomEditor => Current.answer = ""
  /\ action = "AnswerFinal" => Current.answer = Current.userAnswer
  /\ action = "Style" => Current.emoji = Sparkles
=======================================================================
