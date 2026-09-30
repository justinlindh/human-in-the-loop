# Boxed distribution contract proposal

For team-lead adoption alongside E5 in #5. This proposal does not edit `src/contract/contract.md`.

`createGame({ startEra: 'preinternet' })` applies `B.eraStarts.preinternet` additively to funding. It saves three ordered `founding.earlyChapters`: pre-internet, dot-com and Web 2.0. Calendar dates and the extended career checkpoint use those records. `eraSchedule.dotcom` anchors dot-com milestones; a missing anchor means week zero for existing dot-com saves. New founding choices remain behind `?eras`. Loading an existing historical save does not require the switch.

The `boxed` approach creates ordinary product stats and review quality, plus this optional record:

```js
product.boxed = {
  stock, stockCost, installed,
  deliveries: [{ units, cost, dueWeek }],
  unitsOrdered, unitsSold, returns, returnRemainder,
  grossSales, retailerFees, refunds, manufacturingCost,
  patchCost, patches, patchedVersion, weeklyNet, salesWeek,
  delivered, buybackCost, withdrawn, buybackWeek, returnsSettled, master,
};
```

`stockCost` is the remaining inventory's manufacturing cost. Sales reduce it proportionally. `installed` counts sold copies less customer returns. Returned copies are withdrawn, never restocked. Customer refunds reverse the company's receipt after the retailer's cut. Fractional return obligations carry between weeks, so a series of small sales cannot avoid returns.

`customers` and `mrr` retain their subscription meanings and stay zero on boxed products. Installed copies contribute to support and maintenance demand. `weeklyRevenue` adds this week's box receipts to `recurringRevenue`; `totalMrr` remains recurring only. No era transition converts installations into subscribers. A separate service product is an explicit new project with its own build cost and customers.

Actions:

```js
{ type: 'orderBatch', productId, units } // units must be one of B.preinternet.batches
{ type: 'mailPatch', productId }
```

Batch orders charge immediately and save a delivery at `week + leadWeeks`. The products system delivers at the end of that playable week, so a two-week order arrives on the second successful tick. Pending decisions freeze both time and deliveries. One order may be in transit per product. The paid CD choice increases the next order's unit count, with every extra copy still charged. Disk Duplicators reduce manufacturing costs through ordinary capped item stacking.

Mailed patches charge per installed copy up to the cap, restore product health to its existing maximum, and record the release version distributed. A fully healthy product already patched to that version refuses another patch. Ordinary maintenance prevents decay but cannot remotely restore boxed installations. Updates improve the release through existing project work. Specific story and chat effects retain their existing health changes.

Refusals include `No live boxed product`, `Choose a listed batch size`, `A batch is already on its way`, `Not enough cash`, `No installed customers`, and `Installed copies are already patched`. Refusals mutate nothing. The UI reads pure `batchQuote` and `patchQuote` helpers to show prices and reasons before a tap; dispatch validates again.

The first delivery sets `buybackWeek`. At that week the retailer withdraws remaining unsold stock and charges a capped share of its remaining manufacturing cost. `returnsSettled` makes the charge occur once per product. The `pre_master_disk` choice is also once per product. `flags.preinternet` saves `cdOffered`, `cdChoice`, and the single-use `cdCredit`. Existing decision, toast, chat, launch and goal events suffice. `pre_first_batch` requires a delivered physical batch, not a project launch or order.

All fields are additive and JSON-serializable. Existing products without `boxed` use the existing service loop. DeskNet is display metadata only: chat channels, message and reply ids, dispatch actions and browser storage keys are unchanged.
