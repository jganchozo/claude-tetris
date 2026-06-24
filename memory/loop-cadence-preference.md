---
name: loop-cadence-preference
description: User wants the autonomous /loop to run every minute, not self-paced
metadata:
  type: feedback
---

For the autonomous `/loop` (dynamic-pacing mode), the user wants it to fire every minute — use the 60s minimum `delaySeconds` on every ScheduleWakeup, do not self-pace to a longer interval.

**Why:** The user said a one-minute cadence is "exactly what I want," correcting an earlier 1800s heartbeat I picked.

**How to apply:** On each autonomous-loop tick, call ScheduleWakeup with `delaySeconds: 60` unless the user changes the cadence.
