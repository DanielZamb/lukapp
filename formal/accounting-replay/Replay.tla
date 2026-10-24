------------------------------ MODULE Replay ------------------------------
EXTENDS Integers, Sequences, FiniteSets, RealLedger

CONSTANTS MaxIntents, MaxAttempts
VARIABLES db, phase, command, attempts, chosen
vars == <<db, phase, command, attempts, chosen>>
Clients == {1, 2}

Init == /\ db = 0
        /\ phase = [c \in Clients |-> "idle"]
        /\ command = [c \in Clients |-> 0]
        /\ attempts = [c \in Clients |-> 0]
        /\ chosen = 0

Choose(c, q) == /\ phase[c] = "idle"
                /\ chosen < MaxIntents
                /\ phase' = [phase EXCEPT ![c] = "queued"]
                /\ command' = [command EXCEPT ![c] = q]
                /\ attempts' = [attempts EXCEPT ![c] = 0]
                /\ chosen' = chosen + 1
                /\ UNCHANGED db

Dispatch(c) == /\ phase[c] = "queued"
               /\ attempts[c] < MaxAttempts
               /\ phase' = [phase EXCEPT ![c] = "inflight"]
               /\ attempts' = [attempts EXCEPT ![c] = @ + 1]
               /\ UNCHANGED <<db, command, chosen>>

Commit(c) == /\ phase[c] = "inflight"
             /\ db' = Successors[db + 1][command[c] + 1]
             /\ phase' = [phase EXCEPT ![c] = "reply"]
             /\ UNCHANGED <<command, attempts, chosen>>

LoseReply(c) == /\ phase[c] = "reply"
                /\ attempts[c] < MaxAttempts
                /\ phase' = [phase EXCEPT ![c] = "queued"]
                /\ UNCHANGED <<db, command, attempts, chosen>>

Receive(c) == /\ phase[c] = "reply"
              /\ phase' = [phase EXCEPT ![c] = "idle"]
              /\ UNCHANGED <<db, command, attempts, chosen>>

Next == \E c \in Clients:
          (\E q \in 0..(Len(CommandNames) - 1): Choose(c, q))
          \/ Dispatch(c) \/ Commit(c) \/ LoseReply(c) \/ Receive(c)
Spec == Init /\ [][Next]_vars

Entries == Ledgers[db + 1]
Indices == 1..Len(Entries)
RECURSIVE Sum(_)
Sum(values) == IF Len(values) = 0 THEN 0 ELSE Head(values) + Sum(Tail(values))

OneJournalPerKey == Cardinality({Entries[i].key : i \in Indices}) = Len(Entries)
BalancedJournals == \A i \in Indices:
  LET lines == Entries[i].lines IN
    /\ Len(lines) >= 2
    /\ \A n \in 1..Len(lines):
         /\ lines[n].debit \in Nat
         /\ lines[n].credit \in Nat
         /\ (lines[n].debit > 0) # (lines[n].credit > 0)
    /\ Sum([n \in 1..Len(lines) |-> lines[n].debit]) =
       Sum([n \in 1..Len(lines) |-> lines[n].credit])

Mirrored(reversal, original) ==
  /\ original.original = ""
  /\ Len(reversal.lines) = Len(original.lines)
  /\ \A n \in 1..Len(original.lines):
       /\ reversal.lines[n].account = original.lines[n].account
       /\ reversal.lines[n].categories = original.lines[n].categories
       /\ reversal.lines[n].primary = original.lines[n].primary
       /\ reversal.lines[n].debit = original.lines[n].credit
       /\ reversal.lines[n].credit = original.lines[n].debit

UniqueMirroredReversal ==
  /\ \A i \in Indices: Entries[i].original # "" =>
       \E j \in Indices: Entries[j].key = Entries[i].original /\ Mirrored(Entries[i], Entries[j])
  /\ \A i, j \in Indices:
       (Entries[i].original # "" /\ Entries[i].original = Entries[j].original) => i = j

RequestIntegrity == Integrity[db + 1]
TypeOK == /\ db \in 0..(Len(Ledgers) - 1)
          /\ chosen \in 0..MaxIntents
          /\ phase \in [Clients -> {"idle", "queued", "inflight", "reply"}]
          /\ command \in [Clients -> 0..(Len(CommandNames) - 1)]
          /\ attempts \in [Clients -> 0..MaxAttempts]
=============================================================================
