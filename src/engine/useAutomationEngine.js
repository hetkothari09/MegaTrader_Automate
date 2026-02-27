import { useEffect, useRef } from 'react';
import { megaTraderAPI } from '../utils/megaTraderAPI';

/**
 * useAutomationEngine Configures and runs the automated order execution logic.
 * 
 * @param {boolean} isAutomationEnabled - Global toggle to run the automation
 * @param {object} depthData - Live socket packet data reference 
 * @param {Array} monitoredTokens - List of tokens that need tracking
 * @param {number} autoOrderThreshold - The min quantity size that triggers a tick event
 * @param {number} targetTotalQty - Target amount of accumulated volume to fire an order
 * @param {number} timerSeconds - Timeout window for accumulation (0 = instant order firing)
 * @param {number} autoOrderSlicePercentage - The % to deduct from total quantity sizing
 * @param {number} triggerPriceValue - Used for stop-loss orders in the payload
 * @param {Function} onLogEvent - Callback to add events to a UI log 
 */
export const useAutomationEngine = ({
    isAutomationEnabled,
    depthData,
    monitoredTokens,
    autoOrderThreshold,
    targetTotalQty,
    timerSeconds,
    autoOrderSlicePercentage,
    triggerPriceValue,
    onLogEvent,
    status
}) => {
    const activeAccumulations = useRef({}); // Track timers per tokenId_side: { startTime, accumulatedQty, timerId }
    const latestDepthData = useRef(depthData);
    const priceLevels = useRef({});
    const lastProcessedTimes = useRef({});
    const engineStartTime = useRef(0); // Records when engine was most recently enabled

    // Always keep ref updated with the most recent tick, to detach from React render cycles in our interval
    useEffect(() => {
        latestDepthData.current = depthData;
    }, [depthData]);

    // Record startup timestamp so the poll loop can skip the warmup window
    useEffect(() => {
        if (isAutomationEnabled) {
            engineStartTime.current = Date.now();
        }
    }, [isAutomationEnabled]);

    useEffect(() => {
        if (monitoredTokens.length === 0) return;

        // Capture ref for the cleanup function
        const currentAccumulations = activeAccumulations.current;

        const pollInterval = setInterval(() => {
            // Check automation toggle and Socket connectivity
            if (!isAutomationEnabled) return;
            if (status !== 'Connected' && status !== 'CONNECTED' && status !== 'connected') return;

            // --- WARMUP GUARD ---
            // Skip the first 2 seconds after engine start to avoid firing on
            // stale pre-buffered market data that accumulated while engine was off.
            const WARMUP_MS = 2000;
            if (Date.now() - engineStartTime.current < WARMUP_MS) return;

            const currentData = latestDepthData.current;

            monitoredTokens.forEach(item => {
                const tkn = item.tkn;
                const depth = currentData[tkn] || currentData[Number(tkn)];
                if (!depth) return;

                // Check for Freshness
                const lastTime = lastProcessedTimes.current[tkn] || 0;
                const pktTime = depth._receivedAt || 0;
                const isFresh = pktTime > lastTime;

                if (!isFresh) return;
                lastProcessedTimes.current[tkn] = pktTime;

                const sides = item.side === 'both' ? ['buy', 'sell'] : [item.side];

                sides.forEach(async side => {
                    const internalSide = side === 'buy' ? 'bid' : 'ask';
                    const depths = depth.depths || [];
                    const qualifyingDepths = depths.filter(d => {
                        const qty = internalSide === 'bid' ? d.BQ : d.SQ;
                        return qty > 0; // Examine all available depths to see updates against thresholds
                    });

                    qualifyingDepths.forEach(async matchingDepth => {
                        const observedQty = Number(internalSide === 'bid' ? matchingDepth.BQ : matchingDepth.SQ);
                        const price = internalSide === 'bid' ? matchingDepth.BP : matchingDepth.SP;
                        const priceVal = parseFloat(price);

                        const now = Date.now();

                        // Shared cooldown state for this token+side.
                        // autoState is a REFERENCE — mutating it synchronously (before await) is visible
                        // to all sibling depth-level iterations in the same forEach call.
                        const autoLevelKey = `${item.id}_${side}_auto`;
                        if (!priceLevels.current[autoLevelKey]) {
                            priceLevels.current[autoLevelKey] = { lastOrderTime: 0 };
                        }
                        const autoState = priceLevels.current[autoLevelKey];

                        // Re-read lastOrderTime freshly each time — prevents duplicate orders when
                        // multiple depth levels pass the check before anyone sets the cooldown.
                        const autoTimeDiff = Date.now() - autoState.lastOrderTime;

                        if (isAutomationEnabled && autoTimeDiff > 5000) { // 5s universal cooldown per side
                            const accumKey = `${item.id}_${side}`;
                            let currentAccum = activeAccumulations.current[accumKey];

                            // Bypass timer if logic says 0 seconds or 0 target limit
                            const bypassTimer = !timerSeconds || timerSeconds <= 0 || !targetTotalQty || targetTotalQty <= 0;

                            // LOGIC 1: Hard Instant Limit Override
                            // Regardless of timers or target configs, if the single tick observes massive volume >= 100,000, FIRE INSTANTLY.
                            const crossHardLimit = observedQty >= 100000;

                            // lotBase for rounding: NIFTY=65, SENSEX=20, BANKNIFTY=15, FINNIFTY=40
                            let lotBase = 65;
                            if (item.index === 'SENSEX' || item.index === 'BSX') lotBase = 20;
                            if (item.index === 'BANKNIFTY') lotBase = 15;
                            if (item.index === 'FINNIFTY') lotBase = 40;

                            // Step 1: get raw intermediate value (e.g. 31 for sliceQty=2000, lotBase=65)
                            // Step 2: snap that value to the nearest multiple of lotBase
                            //   - 31 → Math.round(31/65)*65 = 0 → max(65, 0) = 65
                            //   - 65 → Math.round(65/65)*65 = 65 → 65
                            //   - 130 → Math.round(130/65)*65 = 130 → 130
                            const snapToNearestLot = (val, base) => Math.max(base, Math.round(val / base) * base);
                            const targetSliceQty = observedQty * (autoOrderSlicePercentage / 100);
                            const rawLots = Math.round(targetSliceQty / lotBase);
                            const actualExecutionQty = snapToNearestLot(rawLots, lotBase);

                            // LOGIC 2: 0.20 Price Slippage
                            // Only apply 0.20 paise difference to price execution if we crossed the 100,000 extreme limit
                            let executionPrice = priceVal;
                            if (crossHardLimit) {
                                executionPrice = side === 'buy' ? parseFloat((priceVal + 0.20).toFixed(2)) : parseFloat((priceVal - 0.20).toFixed(2));
                            }

                            if (bypassTimer || crossHardLimit) {
                                // --- CRITICAL: Immediate Cooldown Update ---
                                // Set this BEFORE the await to prevent subsequent interval ticks (every 100ms)
                                // from re-triggering while this call is in flight.
                                autoState.lastOrderTime = Date.now();
                                priceLevels.current[autoLevelKey] = autoState;

                                console.log(`[Autobot] Auto-triggering order | Signal: ${observedQty} @ ${priceVal} | Executing Qty: ${actualExecutionQty} | Slippage Price: ${executionPrice}`);

                                const details = {
                                    index: item.index, strike: item.strike, type: item.type,
                                    side, observedQty, price: executionPrice, time: new Date().toLocaleTimeString(),
                                    timestamp: now, tokenId: item.id, tkn: item.tkn,
                                    executionQty: actualExecutionQty,
                                    triggerPrice: triggerPriceValue > 0 ? Number((side === 'buy' ? priceVal - triggerPriceValue : priceVal + triggerPriceValue).toFixed(2)) : 0
                                };

                                const result = await megaTraderAPI.triggerOrder(details);

                                // Guard: Only update UI/Logs if automation is still enabled
                                if (onLogEvent) {
                                    // result.Error===null is the ONLY reliable success indicator.
                                    // Exchange returns IntOrdNo on BOTH success AND rejection.
                                    const finalStatus = result && result.Error === null
                                        ? (crossHardLimit ? '1 LAC EXEC' : 'INSTANT EXEC')
                                        : 'FAILED';
                                    const errorMsg = result && result.Error ? ` | Error: ${result.Error}` : '';

                                    onLogEvent(`Order ${finalStatus === 'FAILED' ? 'FAILED' : 'Executed'} for ${item.index} ${item.strike} ${item.type} | Qty: ${actualExecutionQty}@${executionPrice}${errorMsg}`,
                                        finalStatus === 'FAILED' ? 'error' : 'success',
                                        {
                                            token: `${item.index} ${item.strike} ${item.type}`,
                                            side: side.toUpperCase(),
                                            qty: observedQty,
                                            price: executionPrice,
                                            status: finalStatus,
                                            intOrdNo: result?.IntOrdNo || null,
                                            id: details.id
                                        }
                                    );
                                }
                            } else {
                                // --- Timer Sequence Logic ---
                                if (!currentAccum && observedQty >= autoOrderThreshold) {
                                    // Step A: Initial Trigger -> Start Timer
                                    console.log(`[Autobot] Accumulation Timer Started for ${accumKey}. Signal: ${observedQty}. Target: ${targetTotalQty} in ${timerSeconds}s.`);
                                    if (onLogEvent) {
                                        onLogEvent(`Started for ${item.index} ${item.strike} | Initial signal: ${observedQty} @ ${priceVal} | Target: ${targetTotalQty} in ${timerSeconds}s`, 'info', {
                                            token: `${item.index} ${item.strike} ${item.type}`,
                                            side: side.toUpperCase(),
                                            qty: observedQty,
                                            price: priceVal,
                                            status: 'ACCUMULATING'
                                        });
                                    }

                                    const timerId = setTimeout(() => {
                                        // Step C: Expiration (Goal Missed)
                                        console.log(`[Autobot] Timer Expired for ${accumKey}. Total Banked: ${activeAccumulations.current[accumKey]?.accumulatedQty}.`);
                                        if (onLogEvent) {
                                            onLogEvent(`Timer expired for ${item.index}. Total was ${activeAccumulations.current[accumKey]?.accumulatedQty}/${targetTotalQty}`, 'error', {
                                                token: `${item.index} ${item.strike} ${item.type}`,
                                                side: side.toUpperCase(),
                                                qty: activeAccumulations.current[accumKey]?.accumulatedQty,
                                                price: '-',
                                                status: 'EXPIRED'
                                            });
                                        }
                                        delete activeAccumulations.current[accumKey];
                                    }, timerSeconds * 1000);

                                    currentAccum = {
                                        startTime: now,
                                        accumulatedQty: observedQty,
                                        timerId: timerId
                                    };
                                    activeAccumulations.current[accumKey] = currentAccum;
                                } else if (currentAccum) {
                                    // Step B: Accumulating only meaningful quantities (>= user threshold)
                                    if (observedQty >= autoOrderThreshold) {
                                        currentAccum.accumulatedQty += observedQty;
                                        console.log(`[Autobot] Accumulating... Added: ${observedQty}. New Total: ${currentAccum.accumulatedQty}/${targetTotalQty}`);
                                    }
                                }

                                if (currentAccum && currentAccum.accumulatedQty >= targetTotalQty) {
                                    // Step C: Goal is met before timer ends

                                    // lotBase for rounding: NIFTY=65, SENSEX=20, BANKNIFTY=15, FINNIFTY=40
                                    let lotBase = 65;
                                    if (item.index === 'SENSEX' || item.index === 'BSX') lotBase = 20;
                                    if (item.index === 'BANKNIFTY') lotBase = 15;
                                    if (item.index === 'FINNIFTY') lotBase = 40;

                                    // Use the LAST tick (observedQty) that completed the target — not the cumulative sum.
                                    const snapToNearestLot = (val, base) => Math.max(base, Math.round(val / base) * base);
                                    const lastTickSlice = observedQty * (autoOrderSlicePercentage / 100);
                                    const rawAccumLots = Math.round(lastTickSlice / lotBase);
                                    const finalActualExecutionQty = snapToNearestLot(rawAccumLots, lotBase);

                                    // --- CRITICAL: Immediate Cooldown Update ---
                                    autoState.lastOrderTime = Date.now();
                                    priceLevels.current[autoLevelKey] = autoState;

                                    console.log(`[Autobot] Accumulation Goal Met for ${accumKey}! Total: ${currentAccum.accumulatedQty}. Targeting Execution Qty: ${finalActualExecutionQty}`);

                                    clearTimeout(currentAccum.timerId); // Stop the timer
                                    delete activeAccumulations.current[accumKey]; // Reset for next signal

                                    const details = {
                                        index: item.index, strike: item.strike, type: item.type,
                                        side, observedQty: currentAccum.accumulatedQty, price: priceVal, time: new Date().toLocaleTimeString(),
                                        timestamp: now, tokenId: item.id, tkn: item.tkn,
                                        executionQty: finalActualExecutionQty,
                                        triggerPrice: triggerPriceValue > 0 ? Number((side === 'buy' ? priceVal - triggerPriceValue : priceVal + triggerPriceValue).toFixed(2)) : 0
                                    };
                                    const result = await megaTraderAPI.triggerOrder(details);

                                    if (onLogEvent) {
                                        // result.Error===null = success; any Error string = failed
                                        const finalStatus = result && result.Error === null ? 'GOAL MET' : 'FAILED';
                                        const errorMsg = result && result.Error ? ` | Error: ${result.Error}` : '';

                                        onLogEvent(`Executing order for ${item.index} ${item.strike} | Banked: ${currentAccum.accumulatedQty} | Sending: ${finalActualExecutionQty}${errorMsg}`,
                                            finalStatus === 'FAILED' ? 'error' : 'success',
                                            {
                                                token: `${item.index} ${item.strike} ${item.type}`,
                                                side: side.toUpperCase(),
                                                qty: currentAccum.accumulatedQty,
                                                price: priceVal,
                                                status: finalStatus,
                                                intOrdNo: result?.IntOrdNo || null,
                                                id: details.id
                                            }
                                        );
                                    }
                                }
                            }
                        }
                    });
                });
            });
        }, 100);

        return () => {
            clearInterval(pollInterval);
            // Cleanup any active accumulation timeouts when engine disables or unmounts
            Object.values(currentAccumulations).forEach(accum => clearTimeout(accum.timerId));

            // --- NEW: Explicitly wipe state to prevent leaks on restart ---
            activeAccumulations.current = {};
            priceLevels.current = {};
        };
    }, [monitoredTokens, status, autoOrderThreshold, isAutomationEnabled, autoOrderSlicePercentage, targetTotalQty, timerSeconds, triggerPriceValue, onLogEvent]);

    return { activeAccumulations };
};
