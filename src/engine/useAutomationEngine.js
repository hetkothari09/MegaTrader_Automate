import { useEffect, useRef } from 'react';
import { megaTraderAPI } from '../utils/megaTraderAPI';

/**
 * useAutomationEngine - Runs the automated order execution loop.
 *
 * KEY DESIGN: All mutable settings are stored in refs and read inside the interval.
 * This means the interval NEVER needs to restart when settings change — it always
 * reads fresh values without stale closures. Only `monitoredTokens` and the
 * on/off toggle need to tear down the interval.
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
    // ---- Refs that track live data without re-creating the interval ----
    const activeAccumulations = useRef({});
    const latestDepthData = useRef(depthData);
    const priceLevels = useRef({});
    const lastProcessedTimes = useRef({});
    const engineStartTime = useRef(0);

    // Settings refs — updated every render, read inside the interval
    const settingsRef = useRef({});
    settingsRef.current = {
        autoOrderThreshold,
        targetTotalQty,
        timerSeconds,
        autoOrderSlicePercentage,
        triggerPriceValue,
    };

    // Callback ref — avoids stale closure on onLogEvent
    const onLogEventRef = useRef(onLogEvent);
    onLogEventRef.current = onLogEvent;

    // Status ref — avoids stale closure on status
    const statusRef = useRef(status);
    statusRef.current = status;

    // Keep depth data ref fresh on every tick
    useEffect(() => {
        latestDepthData.current = depthData;
    }, [depthData]);

    // Record startup timestamp for the warmup guard
    useEffect(() => {
        if (isAutomationEnabled) {
            engineStartTime.current = Date.now();
        }
    }, [isAutomationEnabled]);

    // ---- Main polling loop ----
    // Only restarts when the token list or the on/off toggle changes.
    useEffect(() => {
        if (monitoredTokens.length === 0) return;

        const currentAccumulations = activeAccumulations.current;

        const pollInterval = setInterval(() => {
            if (!isAutomationEnabled) return;

            const st = statusRef.current;
            if (st !== 'Connected' && st !== 'CONNECTED' && st !== 'connected') return;

            // WARMUP GUARD: skip first 2s after engine start
            const WARMUP_MS = 2000;
            if (Date.now() - engineStartTime.current < WARMUP_MS) return;

            // Read fresh settings from ref — no stale closure
            const {
                autoOrderThreshold,
                targetTotalQty,
                timerSeconds,
                autoOrderSlicePercentage,
                triggerPriceValue,
            } = settingsRef.current;

            const currentData = latestDepthData.current;

            monitoredTokens.forEach(item => {
                const tkn = item.tkn;
                const depth = currentData[tkn] || currentData[Number(tkn)];
                if (!depth) return;

                // Freshness check
                const lastTime = lastProcessedTimes.current[tkn] || 0;
                const pktTime = depth._receivedAt || 0;
                if (pktTime <= lastTime) return;
                lastProcessedTimes.current[tkn] = pktTime;

                const sides = item.side === 'both' ? ['buy', 'sell'] : [item.side];

                sides.forEach(side => {
                    const internalSide = side === 'buy' ? 'bid' : 'ask';
                    const depths = depth.depths || [];
                    const qualifyingDepths = depths.filter(d => {
                        const qty = internalSide === 'bid' ? d.BQ : d.SQ;
                        return qty > 0;
                    });

                    qualifyingDepths.forEach(matchingDepth => {
                        // Wrap in async IIFE with try/catch so any error is logged, not silently swallowed
                        (async () => {
                            try {
                                const observedQty = Number(internalSide === 'bid' ? matchingDepth.BQ : matchingDepth.SQ);
                                const price = internalSide === 'bid' ? matchingDepth.BP : matchingDepth.SP;
                                const priceVal = parseFloat(price);
                                const now = Date.now();

                                const autoLevelKey = `${item.id}_${side}_auto`;
                                if (!priceLevels.current[autoLevelKey]) {
                                    priceLevels.current[autoLevelKey] = { lastOrderTime: 0 };
                                }
                                const autoState = priceLevels.current[autoLevelKey];
                                const autoTimeDiff = Date.now() - autoState.lastOrderTime;

                                if (!isAutomationEnabled || autoTimeDiff <= 5000) return;

                                const accumKey = `${item.id}_${side}`;
                                let currentAccum = activeAccumulations.current[accumKey];

                                const bypassTimer = !timerSeconds || timerSeconds <= 0 || !targetTotalQty || targetTotalQty <= 0;
                                const crossHardLimit = observedQty >= 100000;

                                // Lot base by index
                                let lotBase = 65;
                                if (item.index === 'SENSEX' || item.index === 'BSX') lotBase = 20;
                                if (item.index === 'BANKNIFTY') lotBase = 15;
                                if (item.index === 'FINNIFTY') lotBase = 40;

                                const snapToNearestLot = (val, base) => Math.max(base, Math.round(val / base) * base);
                                const targetSliceQty = observedQty * (autoOrderSlicePercentage / 100);
                                const rawLots = Math.round(targetSliceQty / lotBase);
                                const actualExecutionQty = snapToNearestLot(rawLots, lotBase);

                                // ± 0.20 slippage on 1 LAC executions only
                                let executionPrice = priceVal;
                                if (crossHardLimit) {
                                    executionPrice = side === 'buy'
                                        ? parseFloat((priceVal + 0.20).toFixed(2))
                                        : parseFloat((priceVal - 0.20).toFixed(2));
                                }

                                if (bypassTimer || crossHardLimit) {
                                    // Immediate cooldown before await to block sibling depth levels
                                    autoState.lastOrderTime = Date.now();

                                    console.log(`[Autobot] Firing | ${observedQty} @ ${priceVal} → qty:${actualExecutionQty} price:${executionPrice}`);

                                    const details = {
                                        index: item.index, strike: item.strike, type: item.type,
                                        side, observedQty, price: executionPrice,
                                        time: new Date().toLocaleTimeString(),
                                        timestamp: now, tokenId: item.id, tkn: item.tkn,
                                        executionQty: actualExecutionQty,
                                        triggerPrice: triggerPriceValue > 0
                                            ? Number((side === 'buy' ? priceVal - triggerPriceValue : priceVal + triggerPriceValue).toFixed(2))
                                            : 0
                                    };

                                    const result = await megaTraderAPI.triggerOrder(details);

                                    const logFn = onLogEventRef.current;
                                    if (logFn) {
                                        const finalStatus = result && result.Error === null
                                            ? (crossHardLimit ? '1 LAC EXEC' : 'INSTANT EXEC')
                                            : 'FAILED';
                                        const errorMsg = result && result.Error ? ` | Error: ${result.Error}` : '';
                                        logFn(
                                            `Order ${finalStatus === 'FAILED' ? 'FAILED' : 'Executed'} for ${item.index} ${item.strike} ${item.type} | Qty: ${actualExecutionQty}@${executionPrice}${errorMsg}`,
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
                                    // ---- Accumulation path ----
                                    if (!currentAccum && observedQty >= autoOrderThreshold) {
                                        console.log(`[Autobot] Accumulation started ${accumKey}. Signal:${observedQty} Target:${targetTotalQty} in ${timerSeconds}s`);
                                        const logFn = onLogEventRef.current;
                                        if (logFn) {
                                            logFn(
                                                `Started for ${item.index} ${item.strike} | Initial: ${observedQty} @ ${priceVal} | Target: ${targetTotalQty} in ${timerSeconds}s`,
                                                'info',
                                                {
                                                    token: `${item.index} ${item.strike} ${item.type}`,
                                                    side: side.toUpperCase(), qty: observedQty,
                                                    price: priceVal, status: 'ACCUMULATING'
                                                }
                                            );
                                        }

                                        const timerId = setTimeout(() => {
                                            const logFn = onLogEventRef.current;
                                            const banked = activeAccumulations.current[accumKey]?.accumulatedQty;
                                            console.log(`[Autobot] Timer expired ${accumKey}. Banked: ${banked}`);
                                            if (logFn) {
                                                logFn(
                                                    `Timer expired for ${item.index}. Total was ${banked}/${settingsRef.current.targetTotalQty}`,
                                                    'error',
                                                    {
                                                        token: `${item.index} ${item.strike} ${item.type}`,
                                                        side: side.toUpperCase(), qty: banked,
                                                        price: '-', status: 'EXPIRED'
                                                    }
                                                );
                                            }
                                            delete activeAccumulations.current[accumKey];
                                        }, timerSeconds * 1000);

                                        currentAccum = { startTime: now, accumulatedQty: observedQty, timerId };
                                        activeAccumulations.current[accumKey] = currentAccum;

                                    } else if (currentAccum && observedQty >= autoOrderThreshold) {
                                        currentAccum.accumulatedQty += observedQty;
                                        console.log(`[Autobot] Accumulating ${accumKey}: +${observedQty} → ${currentAccum.accumulatedQty}/${targetTotalQty}`);
                                    }

                                    if (currentAccum && currentAccum.accumulatedQty >= targetTotalQty) {
                                        // Goal met
                                        let lotBase = 65;
                                        if (item.index === 'SENSEX' || item.index === 'BSX') lotBase = 20;
                                        if (item.index === 'BANKNIFTY') lotBase = 15;
                                        if (item.index === 'FINNIFTY') lotBase = 40;

                                        const lastTickSlice = observedQty * (autoOrderSlicePercentage / 100);
                                        const rawAccumLots = Math.round(lastTickSlice / lotBase);
                                        const finalActualExecutionQty = snapToNearestLot(rawAccumLots, lotBase);

                                        autoState.lastOrderTime = Date.now();
                                        console.log(`[Autobot] Goal met ${accumKey}! Total:${currentAccum.accumulatedQty} Qty:${finalActualExecutionQty}`);

                                        clearTimeout(currentAccum.timerId);
                                        delete activeAccumulations.current[accumKey];

                                        const details = {
                                            index: item.index, strike: item.strike, type: item.type,
                                            side, observedQty: currentAccum.accumulatedQty,
                                            price: priceVal, time: new Date().toLocaleTimeString(),
                                            timestamp: now, tokenId: item.id, tkn: item.tkn,
                                            executionQty: finalActualExecutionQty,
                                            triggerPrice: triggerPriceValue > 0
                                                ? Number((side === 'buy' ? priceVal - triggerPriceValue : priceVal + triggerPriceValue).toFixed(2))
                                                : 0
                                        };

                                        const result = await megaTraderAPI.triggerOrder(details);

                                        const logFn = onLogEventRef.current;
                                        if (logFn) {
                                            const finalStatus = result && result.Error === null ? 'GOAL MET' : 'FAILED';
                                            const errorMsg = result && result.Error ? ` | Error: ${result.Error}` : '';
                                            logFn(
                                                `Executing ${item.index} ${item.strike} | Banked:${currentAccum.accumulatedQty} Sending:${finalActualExecutionQty}${errorMsg}`,
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
                            } catch (err) {
                                console.error('[Autobot] Unhandled error in depth processing:', err);
                            }
                        })();
                    });
                });
            });
        }, 100);

        return () => {
            clearInterval(pollInterval);
            Object.values(currentAccumulations).forEach(accum => clearTimeout(accum.timerId));
            activeAccumulations.current = {};
            priceLevels.current = {};
        };
        // Only restart the interval when tokens list or the on/off toggle changes.
        // Settings are read from refs inside the loop, so they never need to restart it.
    }, [monitoredTokens, isAutomationEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

    return { activeAccumulations };
};
