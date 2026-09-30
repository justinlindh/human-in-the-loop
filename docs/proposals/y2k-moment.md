# Y2K moment contract additions

Issue #5 adds the following data to the dot-com preview. The lead owns adoption into `src/contract/contract.md`.

- `startProject` accepts `kind: 'y2k_compliance'`. It uses the existing project shape, assignment and cancellation actions. Completion pays `B.y2k.contractFee` once and creates no product. Only calendar 1999 admits new contracts, with one active contract and a per-company completion cap.
- `flags.y2k` is optional and additive. `offered` records the on-call offer; `onCall` is `founder`, `team` or `consultant`; `contracts` counts completed contracts; `rolloverWeek` records the calendar-boundary tick; `printerId` refers to the ordinary lingering printer prop; `stage` is `rollover` or `after`.
- The renderer observes `stage: 'rollover'` and reuses the spotlight system. It never writes game state. The next simulation tick sets `after` and emits one saved AwayIM thread through existing chat events. Loading during a spotlight replays the presentation; it does not repay contracts, charge the consultant again or duplicate the aftermath.
- `hitl:moment` admits presentation-only `phase: 'beat'` with `caption` and `beat`. The captions layer applies it only to the current spotlight kind. This is a window event, not a simulation event or saved field.

The preview switch belongs to the UI. The simulation remains deterministic and browser-independent, so tests and balance runs select dot-com directly. Existing historical saves continue without needing the URL switch.
