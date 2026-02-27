# MegaTrader Autobot — Order Placement Logic

## Engine Parameters (set by user in UI)

| Parameter | Description |
|---|---|
| Signal Threshold | Minimum volume on a single depth tick to start watching |
| Accumulation Goal | Total volume to accumulate before placing order (Path B) |
| Timer Limit | Max seconds to accumulate; if goal not hit within this, order is abandoned |
| Order QTY % | % of the triggering tick's volume used to calculate order qty |
| Stop Loss Offset | Points offset from current price for SL orders (0 = regular limit order) |

---

## Guard Conditions (order will NOT fire if any of these fail)

1. Engine must be **Started** (`isAutomationEnabled = true`)
2. WebSocket must be **Connected**
3. **2-second warmup** after engine start — first 2s of ticks are ignored entirely (prevents ghost orders from stale buffered data)
4. **5-second cooldown** per token+side — after an order fires for a token/side, the next order for the same token/side cannot fire for at least 5 seconds

---

## Lot Size Rules (qty must always be a valid exchange multiple)

| Index | Base Lot |
|---|---|
| NIFTY | 65 |
| BANKNIFTY | 15 |
| FINNIFTY | 40 |
| SENSEX / BSX | 20 |

**Formula:**  
`qty = snapToNearestLot(Math.round(sliceQty / lotBase), lotBase)`  
where `snapToNearestLot(val, base) = Math.max(base, Math.round(val / base) * base)`  
Minimum qty = 1 lot (lotBase).

**Example (NIFTY, 10% slice):**  
Volume tick = 42,250 → sliceQty = 4,225 → rawLots = 65 → qty = 65 × 65 = 4,225 ✅

---

## Path A — Instant Order (Timer Bypassed)

**Triggers when:** Timer = 0 OR Accumulation Goal = 0, OR volume ≥ 1,00,000

```
FOR each monitored token:
  FOR each depth level with qty > 0:
    IF observedQty >= 1,00,000  →  PATH A (1 LAC EXEC), skip timer
    ELSE IF timerSeconds = 0 OR targetTotalQty = 0  →  PATH A (INSTANT EXEC)
    
    sliceQty  = observedQty × (OrderQTY% / 100)
    qty       = snapToNearestLot(round(sliceQty / lotBase), lotBase)
    
    IF observedQty >= 1,00,000:
      price = currentPrice + 0.20  (BUY)
      price = currentPrice - 0.20  (SELL)
    ELSE:
      price = currentPrice  (no slippage)
    
    IF stopLossOffset > 0:
      triggerPrice = price - offset  (BUY)
      triggerPrice = price + offset  (SELL)
    
    PLACE ORDER → status: INSTANT EXEC or 1 LAC QTY
```

---

## Path B — Accumulation Order (Timer Active)

**Triggers when:** Timer > 0 AND Accumulation Goal > 0 AND no 1 LAC limit hit

```
Step 1 — INITIAL TRIGGER (start timer):
  IF no active accumulation AND observedQty >= Signal Threshold:
    Start countdown timer (Timer Limit seconds)
    Bank: accumulatedQty = observedQty
    Status → ACCUMULATING

Step 2 — ACCUMULATION (ticks during timer):
  IF timer is running AND new tick observedQty >= Signal Threshold:
    accumulatedQty += observedQty

Step 3a — GOAL MET (fire order):
  IF accumulatedQty >= Accumulation Goal (within timer window):
    Cancel timer
    
    sliceQty = LAST tick's observedQty × (OrderQTY% / 100)
    qty      = snapToNearestLot(round(sliceQty / lotBase), lotBase)
    price    = currentPrice (no slippage on accumulation path)
    
    IF stopLossOffset > 0:
      triggerPrice = price ± offset
    
    PLACE ORDER → status: GOAL MET

Step 3b — TIMER EXPIRED (no order):
  IF timer fires before accumulatedQty reaches goal:
    Discard accumulation, reset state
    Status → EXPIRED
```

---

## De-duplication (no double orders)

- `autoState` is a **shared object reference** per `token+side`
- Cooldown (`lastOrderTime`) is set **synchronously before** the API `await`
- All depth levels in the same tick read from the same `autoState` reference, so the second depth level sees the cooldown is already set → skips

---

## Success / Failure Detection

- `result.Error === null` → **SUCCESS** (INSTANT EXEC / 1 LAC QTY / GOAL MET)
- `result.Error` is any string → **FAILED** (error message logged)

> Note: The exchange returns `IntOrdNo` on both success AND rejection, so `IntOrdNo` alone is NOT a reliable success indicator.
