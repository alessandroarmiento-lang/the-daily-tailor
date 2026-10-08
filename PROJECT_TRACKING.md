# The Daily Tailor — costs & hours

## Running totals

| | Amount |
|---|---|
| **Logged work hours (active chat, Cursor)** | **~8.5 h** |
| **Equivalent traditional programmer hours** | **~42.5 h** *(Cursor × 5)* |

## Work hours — how we count

**Count only:** back-and-forth with the assistant + assistant processing/tool runs, from Cursor chat timestamps.

**Do not count:** long AFK, overnight gaps, days with no chat.

**Method** (`python3 deploy/count_work_hours.py`):

1. Collect message timestamps from Cursor agent transcripts for this project.
2. Gap **> 30 minutes** → end of a work block (pause not counted).
3. Inside a block, each gap between timestamps is credited up to **10 minutes** max.
4. Add **~3 minutes** after the last message of a block.
5. **Equivalente programmatore tradizionale (rapporto 1∶5):** `ore_programmatore ≈ ore_Cursor × 5`. Report **both** figures.

Recompute when asked (“aggiorna le ore”) or at end of day.

### By day (active hours)

| Date | Cursor h | ≡ prog. (×5) | Notes |
|---|---|---|---|
| 2026-09-18 | ~1.1 h | ~5.5 h | |
| 2026-09-19 | ~0.3 h | ~1.5 h | |
| 2026-09-20 | ~2.2 h | ~11.0 h | |
| 2026-09-21 | ~2.4 h | ~12.0 h | |
| 2026-10-08 | ~0.6 h | ~3.0 h | AGGIORNA hang / evening |
| 2026-10-09 | ~1.9 h | ~9.5 h | Civil AGGIORNA, precip, PDF agenda |
| **Total** | **~8.5 h** | **~42.5 h** | |

### Session blocks (detail)

| Date | Start–end (local) | Active h |
|---|---|---|
| 2026-09-18 | 19:35–20:56 | 0.9 |
| 2026-09-18 | 22:48–23:05 | 0.2 |
| 2026-09-19 | 10:10–10:45 | 0.3 |
| 2026-09-20 | 20:04–22:32 | 2.2 |
| 2026-09-21 | 20:53–23:31 | 2.4 |
| 2026-10-08 | 23:24–00:11 | 0.6 |
| 2026-10-09 | 00:42–02:52 | 1.9 |
