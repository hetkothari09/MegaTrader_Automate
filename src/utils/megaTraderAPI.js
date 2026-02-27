class MegaTraderAPI {
    constructor() {
        // API Configuration - currently pointing to placeholder/local for testing
        // Update this URL with the actual MegaTrader endpoint when available
        this.baseUrl = 'http://192.168.6.164:16006';
        this.loginId = 'KARAN';
        this.password = 'a@2222222222';

        // Session state
        this.uniqueId = 0;
        this.refNo = '';
        this.isLoggedIn = false;
        this.loginPromise = null; // Track in-flight login requests

        // Rate Limiting / Deduplication — handled by the engine's own cooldown per autoLevelKey.
        // No separate API-level cooldown needed here.
        this.cooldowns = new Map(); // kept for reference but not enforced
        this.COOLDOWN_MS = 0;

        // Global Request Settings
        this.REQUEST_TIMEOUT_MS = 10000;
    }

    async login() {
        if (this.loginPromise) {
            console.log('[MegaTrader] Login already in progress, waiting for result...');
            return this.loginPromise;
        }

        this.loginPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

            try {
                console.log(`[MegaTrader] Attempting login...`);
                const response = await fetch(`${this.baseUrl}/api/PublicAPI/LoginRequest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        LoginId: this.loginId,
                        Password: this.password
                    })
                });

                const data = await response.json();
                const uniqueId = data.UniqueId !== undefined ? data.UniqueId : data.Uniqueid;

                if (uniqueId && uniqueId !== 0 && !data.Error) {
                    this.uniqueId = Number(uniqueId); // Enforce numeric type
                    this.refNo = data.RefNo || '';
                    this.isLoggedIn = true;
                    console.log('[MegaTrader] Login Successful', data);
                    return true;
                } else {
                    console.error('[MegaTrader] Login Failed:', data.Error || data);
                    this.isLoggedIn = false;
                    return false;
                }
            } catch (error) {
                const isTimeout = error.name === 'AbortError';
                const msg = isTimeout ? 'Request Timed Out' : (error.message || String(error));
                console.error(`[MegaTrader] Login Error: ${msg}`);
                this.isLoggedIn = false;
                return false;
            } finally {
                clearTimeout(timeoutId);
                this.loginPromise = null;
            }
        })();

        return this.loginPromise;
    }

    async placeOrder({ tokenNo, buySell, qty, price, triggerPrice = 0, gateway = 'NSEFO', exchange = 'NSEFO' }) {
        if (!this.isLoggedIn) {
            const success = await this.login();
            if (!success) {
                console.error('[MegaTrader] Cannot place order, login sequence failed.');
                return;
            }
        }

        const payload = {
            Uniqueid: this.uniqueId,
            LoginId: this.loginId,
            RefNo: this.refNo,
            gateway: gateway,
            Exchange: exchange,
            Tokenno: String(tokenNo),
            clientcode: '1A1',
            Buysell: String(buySell).toUpperCase(),
            qty: Number(qty),
            qtydisclosed: 0,
            Price: Number(price),
            Triggerprice: Number(triggerPrice) || 0,
            Booktype: Number(triggerPrice) > 0 ? 'SL' : 'RL',
            validity: 'DAY',
            DeliveryType: 1
        };

        try {
            console.log('[MegaTrader] --- FINAL PAYLOAD ---');
            console.log(JSON.stringify(payload, null, 2));
            console.log('[MegaTrader] --------------------');

            const response = await fetch(`${this.baseUrl}/api/PublicAPI/OrderEntry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            console.log('[MegaTrader] --- API RESPONSE ---');
            console.log(JSON.stringify(data, null, 2));
            console.log('[MegaTrader] --------------------');

            if (data.Error) {
                console.error('[MegaTrader] Order Error:', data.Error, '| IntOrdNo:', data.IntOrdNo);
            } else {
                console.log(`[MegaTrader] Order Placed successfully. IntOrdNo: ${data.IntOrdNo}`);
            }
            return data;
        } catch (error) {
            const msg = error.message || String(error);
            console.error('[MegaTrader] Order Entry Request Error:', msg);
            return { Error: `Network Error: ${msg}` };
        }
    }

    async getOrderStatus(intOrdNo) {
        if (!intOrdNo) return null;
        if (!this.isLoggedIn) {
            const success = await this.login();
            if (!success) return null;
        }
        try {
            const response = await fetch(`${this.baseUrl}/api/PublicAPI/OrderStatusRequest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Uniqueid: this.uniqueId,
                    RefNo: this.refNo,
                    IntOrdNo: intOrdNo
                })
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.warn('[MegaTrader] OrderStatus fetch failed:', error.message);
            return null;
        }
    }

    async triggerOrder(logDetails) {
        // Ensure logDetails contains required information
        const { side, price, tkn, executionQty, triggerPrice } = logDetails;
        if (!tkn) {
            console.warn('[MegaTrader] Missing explicit contract token (tkn). Cannot place order.');
            return { Error: 'Missing token' };
        }

        const cooldownKey = `${tkn}_${side}`; // Distinguish between buy/sell side using token number 
        const now = Date.now();
        const lastTrigger = this.cooldowns.get(cooldownKey) || 0;

        if (this.COOLDOWN_MS > 0 && (now - lastTrigger < this.COOLDOWN_MS)) {
            console.log(`[MegaTrader] Skipping order for ${cooldownKey} -> Cooldown active (${Math.round((this.COOLDOWN_MS - (now - lastTrigger)) / 1000)}s left)`);
            return { Error: 'Cooldown active' };
        }

        // Apply Cooldown 
        this.cooldowns.set(cooldownKey, now);

        // Normalize Data for automation
        const orderAction = side.toUpperCase();

        // Define the concrete quantity to trade (minimum 65 — 1 NIFTY lot, never 0 or a non-lot value)
        const tradeQuantity = executionQty || 65;

        // Perform the asynchronous login & place order 
        return await this.placeOrder({
            tokenNo: tkn,
            buySell: orderAction,
            qty: tradeQuantity,
            price: price,
            triggerPrice: triggerPrice,
            gateway: 'NSEFO',
            exchange: 'NSEFO',
            clientCode: '1A1'
        });
    }
}

// Export singleton instance 
export const megaTraderAPI = new MegaTraderAPI();
