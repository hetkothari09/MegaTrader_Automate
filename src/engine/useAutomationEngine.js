import { useEffect, useRef, useCallback } from 'react';
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

    // Always keep ref updated with the most recent tick, to detach from React render cycles in our interval
    useEffect(() => {
        latestDepthData.current = depthData;
    }, [depthData]);

    useEffect(() => {
        if (monitoredTokens.length === 0) return;

        const pollInterval = setInterval(() => {
            // Verify Socket connectivity
            if (status !== 'Connected' && status !== 'CONNECTED' && status !== 'connected') return;

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

                sides.forEach(side => {
                    const internalSide = side === 'buy' ? 'bid' : 'ask';
                    const depths = depth.depths || [];
                    const qualifyingDepths = depths.filter(d => {
                        const qty = internalSide === 'bid' ? d.BQ : d.SQ;
                        return qty > 0; // Examine all available depths to see updates against thresholds
                    });

                    qualifyingDepths.forEach(matchingDepth => {
                        const observedQty = internalSide === 'bid' ? matchingDepth.BQ : matchingDepth.SQ;
                        const price = internalSide === 'bid' ? matchingDepth.BP : matchingDepth.SP;
                        const priceVal = parseFloat(price);

                        const now = Date.now();

                        // Independent Automation Trigger & Accumulation Map
                        const autoLevelKey = `${item.id}_${side}_auto`;
                        const autoState = priceLevels.current[autoLevelKey] || { lastOrderTime: 0 };
                        const autoTimeDiff = now - autoState.lastOrderTime;

                        if (isAutomationEnabled && autoTimeDiff > 5000) { // 5s universal cooldown per side
                            const accumKey = `${item.id}_${side}`;
                            let currentAccum = activeAccumulations.current[accumKey];

                            // Bypass timer if logic says 0 seconds or 0 target limit 
                            const bypassTimer = !timerSeconds || timerSeconds <= 0 || !targetTotalQty || targetTotalQty <= 0;

                            // LOGIC 1: Hard Instant Limit Override
                            // Regardless of timers or target configs, if the single tick observes massive volume >= 100,000, FIRE INSTANTLY.
                            const crossHardLimit = observedQty >= 100000;

                            // LOGIC 3: Dynamic Lot Calculation
                            // Nifty = 65, Sensex = 20. Divide qty by lot size, take percentage, multiply back.
                            const lotBase = item.index === 'SENSEX' ? 20 : 65;
                            const calculatedLotSize = Math.floor((observedQty / lotBase) * (autoOrderSlicePercentage / 100) * lotBase);
                            const actualExecutionQty = Math.max(lotBase, calculatedLotSize); // At least execute minimum lot

                            // LOGIC 2: 0.20 Price Slippage
                            // Only apply 0.20 paise difference to price execution if we crossed the 100,000 extreme limit
                            let executionPrice = priceVal;
                            if (crossHardLimit) {
                                executionPrice = side === 'buy' ? parseFloat((priceVal + 0.20).toFixed(2)) : parseFloat((priceVal - 0.20).toFixed(2));
                            }

                            if (bypassTimer || crossHardLimit) {
                                // --- Instant Execution ---
                                if (observedQty >= autoOrderThreshold || crossHardLimit) {
                                    console.log(`[Autobot] Auto-triggering order | Signal: ${observedQty} @ ${priceVal} | Executing Qty: ${actualExecutionQty} | Slippage Price: ${executionPrice}`);

                                    const details = {
                                        index: item.index, strike: item.strike, type: item.type,
                                        side, observedQty, price: executionPrice, time: new Date().toLocaleTimeString(),
                                        timestamp: now, tokenId: item.id, tkn: item.tkn,
                                        executionQty: actualExecutionQty,
                                        triggerPrice: triggerPriceValue > 0 ? Number((side === 'buy' ? priceVal - triggerPriceValue : priceVal + triggerPriceValue).toFixed(2)) : 0
                                    };

                                    megaTraderAPI.triggerOrder(details);

                                    if (onLogEvent) {
                                        onLogEvent(`Order Executed for ${item.index} ${item.strike} ${item.type} | Qty: ${actualExecutionQty} (based on ${autoOrderSlicePercentage}%) @ ${executionPrice}`, 'success', {
                                            token: `${item.index} ${item.strike} ${item.type}`,
                                            side: side.toUpperCase(),
                                            qty: observedQty,
                                            price: executionPrice,
                                            status: crossHardLimit ? '1 LAC EXEC' : 'INSTANT EXEC'
                                        });
                                    }

                                    autoState.lastOrderTime = now;
                                    priceLevels.current[autoLevelKey] = autoState;
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
                                        if (onLogEvent) {
                                            onLogEvent(`Added ${observedQty}. Total: ${currentAccum.accumulatedQty}/${targetTotalQty}`, 'info', {
                                                token: `${item.index} ${item.strike} ${item.type}`,
                                                side: side.toUpperCase(),
                                                qty: observedQty,
                                                price: priceVal,
                                                status: 'ADDED'
                                            });
                                        }
                                    }
                                }

                                if (currentAccum && currentAccum.accumulatedQty >= targetTotalQty) {
                                    // Step C: Goal is met before timer ends

                                    // Re-calculate dynamic lot sizing off the *accumulated* size
                                    const accumActualQty = Math.floor((currentAccum.accumulatedQty / lotBase) * (autoOrderSlicePercentage / 100) * lotBase);
                                    const finalActualExecutionQty = Math.max(lotBase, accumActualQty);

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
                                    megaTraderAPI.triggerOrder(details);

                                    if (onLogEvent) {
                                        onLogEvent(`Executing order for ${item.index} ${item.strike} | Banked: ${currentAccum.accumulatedQty} | Sending: ${finalActualExecutionQty}`, 'success', {
                                            token: `${item.index} ${item.strike} ${item.type}`,
                                            side: side.toUpperCase(),
                                            qty: currentAccum.accumulatedQty,
                                            price: priceVal,
                                            status: 'GOAL MET'
                                        });
                                    }

                                    autoState.lastOrderTime = now;
                                    priceLevels.current[autoLevelKey] = autoState;
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
            Object.values(activeAccumulations.current).forEach(accum => clearTimeout(accum.timerId));
        };
    }, [monitoredTokens, status, autoOrderThreshold, isAutomationEnabled, autoOrderSlicePercentage, targetTotalQty, timerSeconds, triggerPriceValue, onLogEvent]);

    return { activeAccumulations };
};
