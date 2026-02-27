import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = 'ws://115.242.15.134:19101';
const LOGIN_DATA = {
    LoginId: "megatradertestnew",
    Password: "megatradertestnew"
};

export const useMarketData = (enabled = true, onMessage = null, onDepthPacket = null) => {
    const [status, setStatus] = useState('disconnected');
    const [depthData, setDepthData] = useState({});

    const ws = useRef(null);
    const hbInterval = useRef(null);
    const reconnectTimeout = useRef(null);
    const syncInterval = useRef(null);
    const handshakeTimeout = useRef(null);
    const onMessageRef = useRef(onMessage);
    const onDepthPacketRef = useRef(onDepthPacket);
    const enabledRef = useRef(enabled);
    const isLoggedIn = useRef(false);
    const isReady = useRef(false);
    const pendingSubs = useRef([]);

    // Data Buffers to prevent "React Storms"
    const depthBuffer = useRef({});
    const packetRates = useRef({});
    const lastTelemetry = useRef(0); // Will be initialized in useEffect

    useEffect(() => {
        lastTelemetry.current = Date.now();
    }, []);

    // Keep refs updated
    useEffect(() => {
        onMessageRef.current = onMessage;
        onDepthPacketRef.current = onDepthPacket;
        enabledRef.current = enabled;
    }, [onMessage, onDepthPacket, enabled]);

    // Define standard function conceptually hoisted to the top scope
    function connectSocket() {
        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
        }

        console.log('[WS] Connecting to:', WS_URL);
        setStatus('connecting');
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('[WS] Connected, authenticating...');
            setStatus('connected');
            ws.current.send(JSON.stringify({
                Type: "Login",
                Data: LOGIN_DATA
            }));
        };

        ws.current.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const { Type, Data } = msg;

                // 1. Handle Login
                if (Type === 'Login') {
                    console.log('[WS] Login Response:', Data);
                    if (Data && Data.Error === null) {
                        console.log('[WS] Login Success');
                        isLoggedIn.current = true;
                        isReady.current = true;

                        // Resubscribe to previous tokens if any
                        const activeQuotes = Array.from(activeSubscriptions.current.values());
                        const depthTokens = activeQuotes.filter(q => q.Xchg.includes('FO'));
                        const indexTokens = activeQuotes.filter(q => !q.Xchg.includes('FO'));

                        if (depthTokens.length > 0) {
                            ws.current.send(JSON.stringify({
                                Type: "TokenRequest",
                                Data: { SubType: true, FeedType: 2, quotes: depthTokens }
                            }));
                        }
                        if (indexTokens.length > 0) {
                            ws.current.send(JSON.stringify({
                                Type: "TokenRequest",
                                Data: { SubType: true, FeedType: 1, quotes: indexTokens }
                            }));
                        }

                        if (hbInterval.current) clearInterval(hbInterval.current);
                        hbInterval.current = setInterval(() => {
                            if (ws.current?.readyState === WebSocket.OPEN) {
                                ws.current.send(JSON.stringify({
                                    Type: "Info",
                                    Data: { InfoType: "HB", InfoMsg: "Heartbeat" }
                                }));
                            }
                        }, 10000); // Relaxed to 10s
                    } else {
                        console.error('[WS] Login Failed. Error:', Data?.Error || 'Unknown Error');
                        setStatus('error');
                    }
                    return;
                }

                // 2. Buffer Depth & Index Data
                if ((Type === 'Depth' || Type === 'DepthData' || Type === 'IndexData') && Data) {

                    // Normalize Data to Array for uniform processing
                    const packets = Array.isArray(Data) ? Data : [Data];

                    packets.forEach(packet => {
                        let token = packet.Tkn || packet.Token;

                        // IndexData usually has Symbol but no Token. Map them back.
                        if (!token && Type === 'IndexData' && packet.Symbol) {
                            const sym = packet.Symbol.toUpperCase();
                            if (sym === 'NIFTY50' || sym === 'NIFTY 50') token = '26000';
                            if (sym === 'NIFTYBANK' || sym === 'BANKNIFTY') token = '26009';
                            if (sym === 'SENSEX') token = '1';
                        }

                        if (token) {
                            const tknStr = String(token);
                            lastPacketTimes.current.set(tknStr, Date.now());
                            depthBuffer.current[tknStr] = {
                                ...packet,
                                _type: Type, // Help UI distinguish
                                _receivedAt: Date.now()
                            };

                            // Direct Audio Link (only for Depth)
                            if ((Type === 'Depth' || Type === 'DepthData') && onDepthPacketRef.current) {
                                onDepthPacketRef.current(packet);
                            }

                            // Telemetry tracking
                            packetRates.current[tknStr] = (packetRates.current[tknStr] || 0) + 1;
                        }
                    });
                    return;
                }

                // 3. Telemetry Log every 5 seconds
                if (Date.now() - lastTelemetry.current > 5000) {
                    const stats = packetRates.current;
                    const total = Object.values(stats).reduce((a, b) => a + b, 0);
                    if (total > 0) {
                        console.log('[WS] 5s Traffic Report:', JSON.stringify(stats));
                    }
                    packetRates.current = {};
                    lastTelemetry.current = Date.now();
                }

                // 3. Early ignore for high-volume packets
                const ignoredTypes = ['Touchline', 'Quote'];
                if (ignoredTypes.includes(Type)) return;

                // 4. User callback for management pulses
                if (onMessageRef.current) onMessageRef.current(Type, Data);

            } catch (err) {
                console.error('WS Message Error:', err);
            }
        };

        ws.current.onclose = (event) => {
            console.warn(`[WS] Connection Closed | Code: ${event.code} | Reason: ${event.reason || 'None provided'}`);
            setStatus('disconnected');
            isLoggedIn.current = false;
            isReady.current = false;

            if (hbInterval.current) clearInterval(hbInterval.current);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (handshakeTimeout.current) clearTimeout(handshakeTimeout.current);

            if (enabledRef.current) {
                console.log('[WS] Reconnecting in 5s...');
                reconnectTimeout.current = setTimeout(connect, 5000);
            }
        };

        ws.current.onerror = () => setStatus('error');
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const connect = useCallback(connectSocket, []); // Only create connect once

    // Watchdog State
    const activeSubscriptions = useRef(new Map()); // Map<TokenID, QuoteObject>
    const lastPacketTimes = useRef(new Map());     // Map<TokenID, Timestamp>
    const watchdogInterval = useRef(null);

    // Watchdog Interval
    useEffect(() => {
        // Safe access to the connect ref
        if (!ws.current) return;
        if (!enabled) return;

        watchdogInterval.current = setInterval(() => {
            if (ws.current?.readyState !== WebSocket.OPEN) return;
            if (activeSubscriptions.current.size === 0) return;

            const now = Date.now();
            const staleQuotes = [];

            activeSubscriptions.current.forEach((quote, tkn) => {
                const lastTime = lastPacketTimes.current.get(String(tkn)) || 0;
                if (now - lastTime > 30000) { // Relax watchdog to 30s
                    staleQuotes.push(quote);
                    lastPacketTimes.current.set(String(tkn), now);
                }
            });

            if (staleQuotes.length > 0 && isReady.current) {
                console.warn('[WS] Watchdog resubscribing to stale tokens:', staleQuotes.length);
                ws.current.send(JSON.stringify({
                    Type: "TokenRequest",
                    Data: {
                        SubType: true,
                        FeedType: 2,
                        quotes: staleQuotes
                    }
                }));
            }
        }, 5000);

        return () => clearInterval(watchdogInterval.current);
    }, [enabled]);

    // Subscribe Function
    const subscribe = useCallback((quotes, feedType = 2) => {
        // 1. Track locally for persistence/watchdog
        quotes.forEach(q => {
            const tknStr = String(q.Tkn);
            activeSubscriptions.current.set(tknStr, q);
            lastPacketTimes.current.set(tknStr, Date.now());
        });

        // 2. Send if ready, otherwise queue
        if (ws.current?.readyState === WebSocket.OPEN && isReady.current) {
            const payload = {
                Type: "TokenRequest",
                Data: { SubType: true, FeedType: feedType, quotes }
            };
            console.log('[WS] Outbound Direct:', JSON.stringify(payload));
            ws.current.send(JSON.stringify(payload));
        } else {
            console.log('[WS] Connection not ready, queueing subscription:', quotes.length);
            pendingSubs.current.push(quotes);
        }
    }, []);

    // Data Sync Loop (Phase 3)
    useEffect(() => {
        if (!enabled) return;

        syncInterval.current = setInterval(() => {
            const hasDepth = Object.keys(depthBuffer.current).length > 0;

            if (hasDepth) {
                // IMPORTANT: Capture buffer snapshot BEFORE clearing it
                // React's functional updates are async, so clearing it immediately
                // would result in an empty merge if we don't capture it.
                const bufferSnapshot = { ...depthBuffer.current };
                depthBuffer.current = {};

                setDepthData(prev => ({
                    ...prev,
                    ...bufferSnapshot
                }));
            }
        }, 50);

        return () => clearInterval(syncInterval.current);
    }, [enabled]);

    // Init Effect
    useEffect(() => {
        if (enabled) {
            connect();
        } else {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = null;
            }
            setStatus('disconnected');
        }

        // Capture refs for cleanup to fix exhaustive-deps warning
        const currentWatchdogInterval = watchdogInterval.current;
        const currentSyncInterval = syncInterval.current;
        const currentHandshakeTimeout = handshakeTimeout.current;
        const currentHbInterval = hbInterval.current;

        return () => {
            if (ws.current) ws.current.close();
            if (currentHbInterval) clearInterval(currentHbInterval);
            if (currentWatchdogInterval) clearInterval(currentWatchdogInterval);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (currentSyncInterval) clearInterval(currentSyncInterval);
            if (currentHandshakeTimeout) clearTimeout(currentHandshakeTimeout);
        };
    }, [enabled, connect]);

    return { status, depthData, subscribe };
};
