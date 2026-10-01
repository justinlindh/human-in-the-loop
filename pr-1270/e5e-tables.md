Seeds 1 through 200, bootstrapped funding, six bots per start. Exits mean IPO or acquisition. Pooled score medians include all 1,200 runs, including failures and zero scores. Medians use the upper middle observation. Cross-start comparisons include kits, chapter routes and exit bars.

| Bot | Classic exits | Dot-com exits | Pre-internet exits | Pre minus Classic (points) | Lost / gained vs Classic | Lost / gained vs dot-com |
|---|---:|---:|---:|---:|---:|---:|
| automateAll | 0/200 | 0/200 | 0/200 | 0 | 0 / 0 | 0 / 0 |
| allHumans | 16/200 | 85/200 | 85/200 | 34.5 | 7 / 76 | 50 / 50 |
| balanced | 124/200 | 119/200 | 126/200 | 1 | 47 / 49 | 47 / 54 |
| sensible | 161/200 | 159/200 | 147/200 | -7 | 41 / 27 | 39 / 27 |
| recklessHumans | 0/200 | 0/200 | 0/200 | 0 | 0 / 0 | 0 / 0 |
| squads | 107/200 | 98/200 | 104/200 | -1.5 | 58 / 55 | 44 / 50 |

| Start | Bot | Dot-com cash median | Staff median | Into dot-com | Through dot-com | Final exits |
|---|---|---:|---:|---:|---:|---:|
| preinternet | automateAll | $1,834,851 | 6 | 199/200 | 199/200 | 0/200 |
| dotcom | automateAll | $250,000 | 2 | 200/200 | 200/200 | 0/200 |
| preinternet | allHumans | $1,323,636 | 14 | 200/200 | 164/200 | 85/200 |
| dotcom | allHumans | $250,000 | 2 | 200/200 | 191/200 | 85/200 |
| preinternet | balanced | $1,318,111 | 14 | 200/200 | 169/200 | 126/200 |
| dotcom | balanced | $250,000 | 2 | 200/200 | 185/200 | 119/200 |
| preinternet | sensible | $1,646,265 | 14 | 200/200 | 185/200 | 147/200 |
| dotcom | sensible | $250,000 | 2 | 200/200 | 197/200 | 159/200 |
| preinternet | recklessHumans | $927,261 | 14 | 192/200 | 89/200 | 0/200 |
| dotcom | recklessHumans | $250,000 | 2 | 200/200 | 162/200 | 0/200 |
| preinternet | squads | $1,326,496 | 14 | 200/200 | 163/200 | 104/200 |
| dotcom | squads | $250,000 | 2 | 200/200 | 192/200 | 98/200 |

Dot-com-start arrivals are its initial kit. Through dot-com means reaching Web 2.0. Cash and staff medians include only runs that enter dot-com.

| Bot | Survival shortfall (points) | Paired lost / gained | Paired SE (points) | Approximate 95% interval (points) |
|---|---:|---:|---:|---:|
| automateAll | 0.5 | 1 / 0 | 0.50 | -0.48 to 1.48 |
| allHumans | 13.5 | 32 / 5 | 2.89 | 7.83 to 19.17 |
| balanced | 8.0 | 29 / 13 | 3.20 | 1.73 to 14.27 |
| sensible | 6.0 | 13 / 1 | 1.83 | 2.42 to 9.58 |
| recklessHumans | 36.5 | 92 / 19 | 4.60 | 27.48 to 45.52 |
| squads | 14.5 | 35 / 6 | 3.04 | 8.54 to 20.46 |

The handoff regression guards balanced and sensible at 1 to 15 percentage points below a dot-com start (2 to 30 fewer survivors out of 200). For each matched seed, d is dot-com survival minus pre-internet survival, in {-1, 0, 1}. SE is sampleSD(d) / sqrt(200); the approximate interval is mean(d) +/- 1.96 * SE. Both bots' intervals sit inside the guard, so the bounds leave room beyond the measured paired seed noise while rejecting equal survival and an excessive survival penalty. Other bots are reported for context and are not subject to this band.

| Bot | Classic median score | Dot-com median score | Pre-internet median score |
|---|---:|---:|---:|
| automateAll | 1518 | 2085 | 1674 |
| allHumans | 33421 | 35117 | 38896 |
| balanced | 43057 | 36092 | 42157 |
| sensible | 44667 | 37886 | 43355 |
| recklessHumans | 919 | 760 | 901 |
| squads | 40944 | 34816 | 39496 |
| **Pooled** | **34720** | **30889** | **33114** |

| Start | Exit MRR multiplier | Score factor | Declared share | Measured pooled share of Classic |
|---|---:|---:|---:|---:|
| classic | 1 | 1 | 1 | 1.00000 |
| dotcom | 1.35 | 0.61 | 0.9 | 0.88966 |
| preinternet | 1.3 | 0.72 | 0.95 | 0.95374 |

Raw pre-internet pooled median: 45992. Factor: 0.95 * 34720 / 45992 = 0.71716820, rounded to 0.72. The scored rerun preserves endings, weeks, arrivals, incidents, caught counts and breaches on every seed.

Paired change against the $350 head. Identity hashes include the saved score factor, so changing it makes every full state differ. This report rounds exit percentages to whole points; the exact counts above govern.

| bot | same | exit $350 -> $250 | lost / gained | median score | median weeks | incidents | caught | breaches |
|---|---|---|---|---|---|---|---|---|
| automateAll | 0/200 | 0% -> 0% | 0 / 0 | 1638 -> 1674 | 627 -> 632 | 1881 -> 1905 | 0 -> 0 | 1858 -> 1882 |
| allHumans | 0/200 | 45% -> 43% | 43 / 38 | 36508 -> 38896 | 1467 -> 1431 | 4452 -> 4005 | 0 -> 0 | 4452 -> 4005 |
| balanced | 0/200 | 68% -> 63% | 36 / 26 | 39749 -> 42157 | 1383 -> 1363 | 4332 -> 3810 | 734 -> 661 | 4268 -> 3741 |
| sensible | 0/200 | 80% -> 74% | 37 / 24 | 40430 -> 43355 | 1376 -> 1349 | 4731 -> 4165 | 786 -> 713 | 4681 -> 4118 |
| recklessHumans | 0/200 | 0% -> 0% | 0 / 0 | 706 -> 901 | 1612 -> 350 | 3837 -> 2560 | 0 -> 0 | 3837 -> 2560 |
| squads | 0/200 | 61% -> 52% | 53 / 36 | 38551 -> 39496 | 1400 -> 1384 | 4847 -> 3936 | 24 -> 15 | 4787 -> 3885 |

| Bot | Lost before dot-com | Lost within dot-com | Ending reasons before Web 2.0 |
|---|---:|---:|---|
| automateAll | 1 | 0 | collapse: 1 |
| allHumans | 0 | 36 | runway: 36 |
| balanced | 0 | 31 | runway: 31 |
| sensible | 0 | 15 | runway: 15 |
| recklessHumans | 8 | 103 | runway: 111 |
| squads | 0 | 37 | runway: 37 |
