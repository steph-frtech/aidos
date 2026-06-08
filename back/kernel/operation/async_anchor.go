package operation

// SendReminder is the S73 async/scheduled anchor operation — the canonical scheduled
// operation the fixture mirror drives. It carries a CRON trigger (an echeance) and a
// single NOTIFICATION effect (the reminder the outbox dispatches):
//
//	operation "sendReminder" {
//	  input: "SendReminderInput"
//	  async {
//	    trigger { kind: cron, at: "2026-06-08T09:00:00Z" }
//	    effects: [
//	      { kind: notification, target: "user@example.com",
//	        payload: { subject: "Reminder", body: "Your task is due" } }
//	    ]
//	  }
//	  steps: [
//	    validate { schema: "SendReminderInput" },
//	    return   { ref: $.input }
//	  ]
//	  emits: [ "ReminderSent" ]
//	}
//
// It is a SOURCE truth above the waterline; this function only RECONSTRUCTS it in Go for
// the mirror / the Workbench projection — the authoritative row is written to
// kernel.operation by the aidos CLI through an approved ChangeSet, never from here (the
// wall, CLAUDE.md §2). The agent invents no trigger kind, no effect, no echeance beyond
// what the fixture pins.
func SendReminder() (Operation, Async) {
	op := Operation{
		Name:  "sendReminder",
		Input: "SendReminderInput",
		Steps: []Step{
			ValidateStep{Schema: "SendReminderInput"},
			ReturnStep{Ref: "$.input"},
		},
		Emits: []string{"ReminderSent"},
	}
	async := Async{
		Trigger: AsyncTrigger{Kind: TriggerCron, At: "2026-06-08T09:00:00Z"},
		Effects: []Effect{
			{
				Kind:   TriggerNotification,
				Target: "user@example.com",
				Payload: map[string]any{
					"subject": "Reminder",
					"body":    "Your task is due",
				},
			},
		},
	}
	return op, async
}
