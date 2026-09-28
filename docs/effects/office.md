<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->

# Office items and perks

Placed in Build mode. Each level's cost and what it adds.

| Item | Kind | From | Effects |
|---|---|---|---|
| Desk Set | furniture | any | L1 $800; seats one person; every hire needs a free desk. From the Office Floor on, at most 30, plus 5 per expansion |
| Meeting Table | furniture | any | L1 $3,000; no effect on the numbers |
| Whiteboard | furniture | any | L1 $400; novelty +4% for each occupied desk within 2 tiles, shared across the team |
| Coffee Corner | furniture | any | L1 $1,200; stamina recovery +8% for each occupied desk within 3 tiles, shared across the team |
| Potted Plant | furniture | any | L1 $150; meaning recovery +4% for each occupied desk within 2 tiles, shared across the team |
| Bookshelf | furniture | any | L1 $500; knowledge gain +5% for each occupied desk within 2 tiles, shared across the team |
| Couch | furniture | any | L1 $600: meaning recovery +3%, stamina recovery +5% |
| Foosball Table | furniture | any | L1 $900: meaning recovery +4%, output -1% |
| Ping Pong Table | furniture | Office Floor | L1 $1,500: meaning recovery +6%, output -1% |
| Espresso Machine | shop | any | L1 $3,000: stamina recovery +15% · L2 $9,000: stamina recovery +30% · L3 $27,000: stamina recovery +45% |
| Plant Wall | shop | any | L1 $2,500: meaning recovery +10% · L2 $7,500: meaning recovery +20% · L3 $22,000: meaning recovery +30% |
| Nap Pod | shop | Office Floor | L1 $6,000: burnout resignations -15% · L2 $18,000: burnout resignations -30% · L3 $50,000: burnout resignations -45% |
| Arcade Cabinet | shop | Office Floor | L1 $8,000: meaning recovery +15%, output -2% · L2 $24,000: meaning recovery +25%, output -3% · L3 $70,000: meaning recovery +35%, output -4% |
| Standing Desks | shop | any | L1 $4,000: stamina drain -10% · L2 $12,000: stamina drain -20% · L3 $36,000: stamina drain -30% |
| Whiteboard Wall | shop | any | L1 $3,500: novelty +5% · L2 $10,000: novelty +10% · L3 $30,000: novelty +15% |
| Library Nook | shop | Office Floor | L1 $6,000: knowledge gain +15% · L2 $18,000: knowledge gain +30% · L3 $54,000: knowledge gain +45% |
| Monitoring Wall | shop | Office Floor, the Agents era | L1 $7,000: oversight hours +15% · L2 $21,000: oversight hours +30% · L3 $60,000: oversight hours +45% |
| Server Racks | shop | any | L1 $5,000: maintenance needed -5%, uptime floor +3% · L2 $15,000: maintenance needed -10%, uptime floor +6% · L3 $45,000: maintenance needed -15%, uptime floor +10%; uptime floor +1% for each other Server Racks within 1 tile |
| Trophy Case | shop | any, after your first award | L1 $3,000: brand decay -15% · L2 $9,000: brand decay -30% · L3 $27,000: brand decay -45% |

A second copy of an item adds its level effect at 50%, and copies past the second add no level effect. Nearby bonuses are different: every copy counts in full, for each desk or item in reach. All items together are capped at ±50% on any one effect. A desk bonus counts only when someone sits at that desk, and is divided by headcount.
