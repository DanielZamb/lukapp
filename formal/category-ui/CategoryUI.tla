--------------------------- MODULE CategoryUI ---------------------------
EXTENDS Naturals, Sequences, RealUI

VARIABLES ui, prior, action
vars == <<ui, prior, action>>
Init == /\ ui \in InitialStates /\ prior = ui /\ action = "Init"
Next == \E edge \in Edges:
  /\ ui = edge.from /\ ui' = edge.to /\ prior' = ui /\ action' = edge.event
Spec == Init /\ [][Next]_vars
Current == Observations[ui]
Before == Observations[prior]
TypeOK == /\ ui \in 1..Len(Observations) /\ prior \in 1..Len(Observations)

OriginalComposerPreserved == Current.facts = Current.original

IndependentSetup ==
  /\ \A n \in 1..Len(Current.commands):
       LET cmd == Current.commands[n] IN cmd.kind = "setup" =>
         /\ cmd.amount = 0 /\ cmd.name = "Reserve" /\ cmd.target = Current.initialSource
  /\ Len(Current.commands) > Len(Before.commands) => action \in {"SubmitSetup", "PostOriginal"}
  /\ action = "ChooseSetupKind" => Current.setupKind =
       IF Current.answer = "payDebt" THEN "loan" ELSE "savingsAccount"
  /\ action = "DoorConfirm" =>
       /\ Current.entryType = "transfer" /\ Current.destination = ""
       /\ Current.categories = <<>> /\ Current.source = Before.source
       /\ Current.hasSetup /\ Current.setupAmount = "0"
       /\ Current.setupSource = Before.source
       /\ Current.answer = "payDebt" => Current.setupKind = ""
       /\ Current.commands = Before.commands

SetupCommands == SelectSeq(Current.commands, LAMBDA cmd: cmd.kind = "setup")
FrozenSetupRetry ==
  /\ \A n \in 1..Len(SetupCommands): SetupCommands[n] = SetupCommands[1]
  /\ action = "FrozenCallbacks" => Current.lockFacts = Before.lockFacts

SeparatePairConfirmation ==
  /\ (Current.entryType = "transfer" /\ ~Current.hasSetup /\ ~Current.pending
       /\ ~Current.busy /\ Current.canPost) => Current.reviewed = Current.pair
  /\ \A n \in (Len(Before.commands) + 1)..Len(Current.commands):
       Current.commands[n].kind = "transfer" =>
         /\ ~Before.hasSetup /\ Before.reviewed = Before.pair
         /\ Current.commands[n].source = Before.source
         /\ Current.commands[n].destination = Before.destination
         /\ Current.commands[n].amount = 1000
         /\ Current.commands[n].date = Before.original[3]
         /\ Current.commands[n].description = Before.original[2]
         /\ Current.commands[n].categories = <<>>

NativeDismissAcknowledged ==
  /\ (action = "NativeDismiss" /\ ~Before.pending /\ ~Before.busy) =>
       /\ Current.dismisses = Before.dismisses
       /\ Before.hasSetup => ~Current.hasSetup
  /\ action = "DoorConfirm" =>
       /\ Current.sheetVisible /\ ~Current.sheetClosing
       /\ Current.presents = Before.presents + 1
=======================================================================
