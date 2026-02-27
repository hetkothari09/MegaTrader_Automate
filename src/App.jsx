import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { useAutomationEngine } from './engine/useAutomationEngine';
import { megaTraderAPI } from './utils/megaTraderAPI';
import contractsData from './contracts_nsefo.json';
import { Activity, Settings2, Play, Square, Plus, Trash2, Cpu, Zap, ChevronDown, Check, Search, RefreshCw, Wifi } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Custom Strike Selector Component ---
const StrikeSelector = ({ token, strikes, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchTerm("");
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
        if (listRef.current) {
          const activeItem = listRef.current.querySelector('[data-active="true"]');
          if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }, 50);
    }
  }, [isOpen]);

  const filteredStrikes = strikes.filter(s => s.toString().includes(searchTerm));

  return (
    <div className="relative flex-1" ref={containerRef}>


      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative z-10 w-full flex items-center justify-between px-3 py-2 bg-black/40 border border-white/10 rounded-lg group hover:border-white/30 transition-all",
          token.type === 'CE' ? "text-cyan-400" : "text-purple-400"
        )}
      >
        <span className="text-xl font-black tracking-tight leading-none drop-shadow-[0_0_0px_currentColor]">
          {parseFloat(token.strike)}
        </span>
        <ChevronDown size={16} className="text-white/40 group-hover:text-white/70 transition-colors" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[#1a1c21] border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden"
          >
            <div className="p-2 border-b border-white/10 bg-black/20 flex items-center gap-2">
              <Search size={14} className="text-white/40" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Find strike..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-white w-full focus:outline-none placeholder-white/20"
              />
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
              {filteredStrikes.length === 0 ? (
                <div className="px-4 py-3 text-sm text-white/40 italic">No strikes found</div>
              ) : (
                filteredStrikes.map(s => (
                  <button
                    key={s}
                    data-active={parseFloat(s).toString() === parseFloat(token.strike).toString()}
                    onClick={() => {
                      onUpdate(s.toString());
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors",
                      parseFloat(s).toString() === parseFloat(token.strike).toString()
                        ? "bg-white/10 text-white font-bold"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span>{parseFloat(s)}</span>
                    {parseFloat(s).toString() === parseFloat(token.strike).toString() && <Check size={12} className="text-blue-400" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Monitored Token Card Component ---
const TokenCard = React.memo(({ token, onRemove, onUpdateType, onUpdateStrike, onUpdateSide, strikes }) => {
  const typeIsCE = token.type === 'CE';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative flex flex-col gap-3 p-4 rounded-2xl border bg-[#0f1115] group transition-all overflow-hidden",
        typeIsCE
          ? "border-cyan-500/20 hover:border-cyan-500/40 shadow-[0_4px_20px_rgba(6,182,212,0.06)]"
          : "border-purple-500/20 hover:border-purple-500/40 shadow-[0_4px_20px_rgba(168,85,247,0.06)]"
      )}
    >
      {/* Top glow strip */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-0.5",
        typeIsCE
          ? "bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent"
          : "bg-gradient-to-r from-transparent via-purple-500/60 to-transparent"
      )} />

      {/* Header: index + type badge + delete */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-black tracking-widest uppercase text-white/50">{token.index}</div>
          <div className="text-[9px] text-white/20 font-mono mt-0.5">{token.tkn}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onUpdateType(token.id, typeIsCE ? 'PE' : 'CE')}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-black border transition-all",
              typeIsCE
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/25"
                : "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/25"
            )}
          >{token.type}</button>
          <button
            onClick={() => onRemove(token.id)}
            className="text-white/20 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-500/10 opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Strike — hero element */}
      <div className="flex-1">
        <StrikeSelector
          token={token}
          strikes={strikes}
          onUpdate={(val) => onUpdateStrike(token.id, val)}
        />
      </div>

      {/* Side switcher */}
      <div className="flex bg-black/60 rounded-lg p-0.5 border border-white/5 gap-0.5">
        {['both', 'buy', 'sell'].map(s => (
          <button
            key={s}
            onClick={() => onUpdateSide(token.id, s)}
            className={cn(
              "flex-1 py-1 text-[9px] font-black rounded-md transition-all tracking-widest uppercase",
              token.side === s
                ? s === 'both' ? "bg-white/10 text-white"
                  : s === 'buy' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/20"
                : "text-white/25 hover:text-white/60"
            )}
          >{s}</button>
        ))}
      </div>
    </motion.div>
  );
});


// --- Order Book / History Component ---
// --- Order Book / History Component ---
const TERMINAL_STATUSES = new Set(['Executed', 'ERejected', 'Cancelled']);

const ExchangeStatusBadge = ({ exStatus }) => {
  if (!exStatus || exStatus === 'checking') {
    return <span className="text-white/20 text-[10px] font-mono tracking-wider">—</span>;
  }
  const color =
    exStatus === 'Executed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
      exStatus === 'EPending' ? 'text-amber-400 bg-amber-500/10 border-amber-500/25 animate-pulse' :
        exStatus === 'ERejected' ? 'text-rose-400 bg-rose-500/10 border-rose-500/25' :
          exStatus === 'Cancelled' ? 'text-white/40 bg-white/5 border-white/10' :
            'text-blue-400 bg-blue-500/10 border-blue-500/20';
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-widest ${color}`}>
      {exStatus}
    </span>
  );
};

const OrderBook = React.memo(({ orders, onClearAll, onRemoveOne }) => {
  return (
    <motion.div
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card rounded-2xl flex flex-col h-full min-h-[500px]"
    >
      <div className="p-6 border-b border-white/[0.05] bg-white/[0.01] flex flex-col gap-4 sticky top-0 z-20 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/90">Order History</h2>
          </div>
          <button
            onClick={onClearAll}
            className="text-[10px] font-black text-rose-400/60 hover:text-rose-400 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar bg-black/10">
        <table className="w-full text-left border-collapse font-sans min-w-[360px]">
          <thead className="sticky top-0 bg-[#0f1115]/90 backdrop-blur-md border-b border-white/5 text-[10px] font-black text-white/40 uppercase tracking-widest z-10">
            <tr>
              <th className="py-4 px-4 pl-6 w-[85px]">Time</th>
              <th className="py-4 px-4 text-left min-w-[120px]">Contract</th>
              <th className="py-4 px-4 text-center w-[65px]">Side</th>
              <th className="py-4 px-4 text-center w-[75px]">Qty</th>
              <th className="py-4 px-4 text-left w-[70px]">Price</th>
              <th className="py-4 px-4 pr-6 text-center w-[100px]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {orders.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-16 text-center text-white/20 italic text-sm">No orders in current session</td>
              </tr>
            ) : (
              <AnimatePresence initial={false}>
                {orders.map((order) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, md: { x: 20 } }}
                    key={order.id}
                    className="group hover:bg-white/[0.03] transition-colors relative"
                  >
                    <td className="py-3.5 px-4 pl-6 text-xs font-mono text-white/30 group-hover:text-white/50 transition-colors">{order.time}</td>
                    <td className="py-3.5 px-4">
                      <div className="text-sm font-black text-white/80 uppercase tracking-tight truncate max-w-[160px] group-hover:text-white transition-colors">{order.token}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider",
                        order.side === 'BUY' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      )}>
                        {order.side}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-sm font-mono font-black text-blue-400 group-hover:text-blue-300 transition-colors">{order.qty?.toLocaleString()}</span>
                    </td>
                    <td className="py-3.5 px-4 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-black text-amber-500/90 group-hover:text-amber-400 transition-colors">{order.price}</span>
                        <button
                          onClick={() => onRemoveOne(order.id)}
                          className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-400 transition-all p-1.5 bg-[#0f1115] rounded-md border border-white/5 shadow-lg flex-shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 pr-6 text-center">
                      <ExchangeStatusBadge exStatus={order.exStatus} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
});
// ---  Resizable Column Layout Utilities ---
const MIN_COL_PCT = 12; // minimum width each column can shrink to (%)

const ResizeHandle = ({ onDrag }) => {
  const dragging = useRef(false);
  const startX = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    setActive(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      startX.current = e.clientX;
      onDrag(dx);
    };

    const onMouseUp = () => {
      dragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') onMouseUp(); };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, { once: true });
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 w-3 flex items-center justify-center cursor-col-resize group relative z-10",
        "select-none"
      )}
    >
      <div className={cn(
        "w-0.5 h-full rounded-full transition-all duration-150",
        active
          ? "bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          : "bg-white/[0.06] group-hover:bg-cyan-400/40 group-hover:shadow-[0_0_6px_rgba(34,211,238,0.3)]"
      )} />
    </div>
  );
};

const VerticalResizeHandle = ({ onDrag }) => {
  const dragging = useRef(false);
  const startY = useRef(0);
  const [active, setActive] = useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    setActive(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const dy = e.clientY - startY.current;
      startY.current = e.clientY;
      onDrag(dy);
    };

    const onMouseUp = () => {
      dragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onKeyDown = (e) => { if (e.key === 'Escape') onMouseUp(); };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, { once: true });
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 h-3 flex items-center justify-center cursor-row-resize group relative z-10",
        "select-none w-full"
      )}
    >
      <div className={cn(
        "h-0.5 w-full rounded-full transition-all duration-150",
        active
          ? "bg-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          : "bg-white/[0.06] group-hover:bg-cyan-400/40 group-hover:shadow-[0_0_6px_rgba(34,211,238,0.3)]"
      )} />
    </div>
  );
};

function App() {
  // --- Global State ---
  const [globalIndex, setGlobalIndex] = useState('NIFTY');
  const [globalExpiry, setGlobalExpiry] = useState('');

  // --- Column widths (%) ---
  const containerRef = useRef(null);
  const [colWidths, setColWidths] = useState([18, 52, 30]); // [left, mid, right]
  const [contractsHeightPct, setContractsHeightPct] = useState(45); // default middle split height

  const makeHandleDrag = (leftIdx, rightIdx) => (dx) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.getBoundingClientRect().width;
    const dPct = (dx / totalPx) * 100;
    setColWidths(prev => {
      const next = [...prev];
      const newLeft = Math.max(MIN_COL_PCT, Math.min(prev[leftIdx] + dPct, 100 - MIN_COL_PCT * (prev.length - leftIdx)));
      const actualDelta = newLeft - prev[leftIdx];
      const newRight = Math.max(MIN_COL_PCT, prev[rightIdx] - actualDelta);
      next[leftIdx] = newLeft;
      next[rightIdx] = newRight;
      return next;
    });
  };

  const makeVerticalDrag = (dy) => {
    if (!containerRef.current) return;
    const totalPx = containerRef.current.getBoundingClientRect().height;
    const dPct = (dy / totalPx) * 100;
    setContractsHeightPct(prev => {
      const newVal = Math.max(15, Math.min(prev + dPct, 80));
      return newVal;
    });
  };

  // --- Monitored Tokens ---
  const [monitoredTokens, setMonitoredTokens] = useState(() => {
    const saved = localStorage.getItem('autobot_tokens');
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState([]);
  const [executedOrders, setExecutedOrders] = useState(() => {
    const saved = localStorage.getItem('autobot_orders');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- Automation Settings (Staging) ---
  const [isAutomationEnabled, setIsAutomationEnabled] = useState(false);
  const [stagedThreshold, setStagedThreshold] = useState(15000);
  const [stagedTargetQty, setStagedTargetQty] = useState(25000);
  const [stagedTimerSeconds, setStagedTimerSeconds] = useState(5);
  const [stagedSlicePercent, setStagedSlicePercent] = useState(10);
  const [stagedSLOffset, setStagedSLOffset] = useState(0);

  // --- Applied Settings (Source of truth for engine) ---
  const [appliedSettings, setAppliedSettings] = useState({
    threshold: 15000,
    targetQty: 25000,
    timer: 5,
    slicePercent: 10,
    slOffset: 0
  });

  const isSettingsDirty = useMemo(() => {
    return stagedThreshold !== appliedSettings.threshold ||
      stagedTargetQty !== appliedSettings.targetQty ||
      stagedTimerSeconds !== appliedSettings.timer ||
      stagedSlicePercent !== appliedSettings.slicePercent ||
      stagedSLOffset !== appliedSettings.slOffset;
  }, [stagedThreshold, stagedTargetQty, stagedTimerSeconds, stagedSlicePercent, stagedSLOffset, appliedSettings]);


  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('autobot_tokens', JSON.stringify(monitoredTokens));
  }, [monitoredTokens]);

  useEffect(() => {
    localStorage.setItem('autobot_orders', JSON.stringify(executedOrders));
  }, [executedOrders]);

  // --- Expiry Management ---
  const availableExpiries = useMemo(() => {
    let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
    const filtered = contractsData.filter(c => c.s === searchIndex);
    return [...new Set(filtered.map(c => c.e))].sort();
  }, [globalIndex]);

  useEffect(() => {
    if (availableExpiries.length > 0 && !availableExpiries.includes(globalExpiry)) {
      const today = new Date().toISOString().split('T')[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlobalExpiry(availableExpiries.find(e => e >= today) || availableExpiries[0]);
    }
  }, [availableExpiries, globalExpiry]);

  // --- Market Data Hook ---
  // eslint-disable-next-line no-unused-vars
  const handleMarketMessage = useCallback((_type, _data) => { }, []);

  const { status, depthData, subscribe } = useMarketData(true, handleMarketMessage);

  useEffect(() => {
    if (monitoredTokens.length > 0) {
      const tokensToSub = monitoredTokens.map(item => ({
        Xchg: item.index === 'SENSEX' ? 'BSEFO' : 'NSEFO',
        Tkn: item.tkn,
        Symbol: item.symbol
      }));
      subscribe(tokensToSub);
    }
  }, [subscribe, monitoredTokens]);

  // --- Automation Engine ---
  const addLogEvent = useCallback((message, type = 'info', parsed = null) => {
    setLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), message, type, parsed }, ...prev].slice(0, 100));

    // Auto-populate Order Book if it's a real execution event
    if (parsed && (parsed.status.includes('EXEC') || parsed.status.includes('MET'))) {
      setExecutedOrders(prev => [{
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        token: parsed.token,
        side: parsed.side || 'N/A',
        qty: parsed.qty,
        price: parsed.price,
        status: parsed.status,
        intOrdNo: parsed.intOrdNo || null,  // store for status polling
        exStatus: parsed.intOrdNo ? 'checking' : null, // initial exchange status
      }, ...prev].slice(0, 100));
    }
  }, []);

  // --- Exchange Order Status Polling ---
  // Every 3 seconds, poll the status API for any order that has an intOrdNo
  // and hasn't reached a terminal status (Executed / ERejected / Cancelled) yet.
  useEffect(() => {
    const interval = setInterval(async () => {
      setExecutedOrders(prev => {
        const pending = prev.filter(o => o.intOrdNo && !TERMINAL_STATUSES.has(o.exStatus));
        if (pending.length === 0) return prev;

        // Fire all status checks in parallel, then merge results
        Promise.all(
          pending.map(o =>
            megaTraderAPI.getOrderStatus(o.intOrdNo)
              .then(data => ({ id: o.id, status: data?.Status || data?.status || null }))
              .catch(() => ({ id: o.id, status: null }))
          )
        ).then(results => {
          const updates = new Map(results.filter(r => r.status).map(r => [r.id, r.status]));
          if (updates.size === 0) return;
          setExecutedOrders(curr =>
            curr.map(o => updates.has(o.id) ? { ...o, exStatus: updates.get(o.id) } : o)
          );
        });

        return prev; // Return unmodified while async runs
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const { activeAccumulations } = useAutomationEngine({
    isAutomationEnabled,
    depthData,
    monitoredTokens,
    autoOrderThreshold: appliedSettings.threshold,
    targetTotalQty: appliedSettings.targetQty,
    timerSeconds: appliedSettings.timer,
    autoOrderSlicePercentage: appliedSettings.slicePercent,
    triggerPriceValue: appliedSettings.slOffset,
    onLogEvent: addLogEvent,
    status
  });

  // activeAccumulations exists for deep logging/debugging internally in the engine, suppress warning

  const _suppressWarning = activeAccumulations;

  // --- Handlers ---
  const handleAddToken = () => {
    let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
    const validContract = contractsData.find(c =>
      c.s === searchIndex && c.e === globalExpiry && c.p === 'CE'
    );

    if (validContract) {
      const tokenObj = {
        id: `${validContract.t}_${Date.now()}`,
        tkn: validContract.t,
        symbol: validContract.ns,
        strike: parseFloat(validContract.st).toString(),
        type: 'CE',
        side: 'both',
        expiry: globalExpiry,
        index: globalIndex
      };
      setMonitoredTokens(prev => [...prev, tokenObj]);
    }
  };

  const removeToken = (id) => setMonitoredTokens(prev => prev.filter(t => t.id !== id));
  const updateTokenSide = (id, newSide) => setMonitoredTokens(prev => prev.map(t => t.id === id ? { ...t, side: newSide } : t));

  const updateTokenType = (id, newType) => {
    setMonitoredTokens(prev => prev.map(t => {
      if (t.id === id) {
        let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
        const strikeVal = Number(t.strike).toFixed(5);
        const contract = contractsData.find(c => c.s === searchIndex && c.p === newType && c.e === t.expiry && Number(c.st).toFixed(5) === strikeVal);
        if (contract) return { ...t, type: newType, strike: parseFloat(t.strike).toString(), tkn: contract.t, symbol: contract.ns };
      }
      return t;
    }));
  };

  const updateTokenStrike = (id, newStrike) => {
    setMonitoredTokens(prev => prev.map(t => {
      if (t.id === id) {
        let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
        const strikeVal = Number(newStrike).toFixed(5);
        const contract = contractsData.find(c => c.s === searchIndex && c.p === t.type && c.e === t.expiry && Number(c.st).toFixed(5) === strikeVal);
        const sanitizedStrike = parseFloat(newStrike).toString();
        if (contract) return { ...t, strike: sanitizedStrike, tkn: contract.t, symbol: contract.ns };
      }
      return t;
    }));
  };

  // --- Data Pre-calculation ---
  const contractMap = useMemo(() => {
    const map = {};
    contractsData.forEach(c => {
      const key = `${c.s}_${c.e}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(Number(c.st));
    });
    // Convert sets to sorted arrays
    Object.keys(map).forEach(key => {
      map[key] = Array.from(map[key]).sort((a, b) => a - b);
    });
    return map;
  }, []);

  const getStrikesForToken = useCallback((t) => {
    let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
    const key = `${searchIndex}_${t.expiry}`;
    return contractMap[key] || [];
  }, [contractMap]);

  const clearOrderHistory = () => setExecutedOrders([]);
  const clearLogs = () => setLogs([]);
  const removeOneOrder = (id) => setExecutedOrders(prev => prev.filter(o => o.id !== id));

  const applySettings = () => {
    setAppliedSettings({
      threshold: stagedThreshold,
      targetQty: stagedTargetQty,
      timer: stagedTimerSeconds,
      slicePercent: stagedSlicePercent,
      slOffset: stagedSLOffset
    });
    addLogEvent("Automation parameters updated and applied.", "info");
  };

  const testConnection = async () => {
    addLogEvent("Testing API Connection...", "info");
    const success = await megaTraderAPI.login();
    if (success) {
      addLogEvent("API Connection Successful! Found UniqueID: " + megaTraderAPI.uniqueId, "success");
    } else {
      addLogEvent("API Connection Failed. Please check MegaTrader settings.", "error");
    }
  };

  const toggleEngine = async () => {
    if (!isAutomationEnabled) {
      setIsLoggingIn(true);
      const success = await megaTraderAPI.login();
      setIsLoggingIn(false);

      if (success) {
        setIsAutomationEnabled(true);
        addLogEvent("Engine Started & API Connected.", "success");
      } else {
        addLogEvent("Failed to login to API. Check connection.", "error");
      }
    } else {
      setIsAutomationEnabled(false);
      addLogEvent("Engine Stopped.", "info");
    }
  };

  return (
    <div className="h-screen flex flex-col pt-16 px-4 md:px-8 pb-8 gap-6 w-full max-w-[2560px] mx-auto overflow-hidden">

      {/* Top Navbar */}
      <motion.nav
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 h-16 bg-[#0a0c10]/80 backdrop-blur-xl z-50 px-6 md:px-10 flex items-center justify-between border-b border-white/[0.05]"
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-400/20 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Cpu size={18} className="text-blue-400 relative z-10" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white/95">
            Autobot <span className="text-blue-500 font-black">Engine</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[11px] font-mono font-bold tracking-widest hidden sm:flex">
            <span className="text-white/40 uppercase">Feed:</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/40 border border-white/5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                status === 'connected' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  : "bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              )} />
              <span className={status === 'connected' ? 'text-emerald-400' : 'text-red-400'}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          <button
            onClick={toggleEngine}
            disabled={isLoggingIn}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-xs uppercase tracking-widest transition-all duration-300 relative overflow-hidden group",
              isLoggingIn ? "bg-white/5 text-white/40 cursor-not-allowed border border-white/10" :
                isAutomationEnabled
                  ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)] hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]"
            )}
          >
            {/* Gloss light effect */}
            <div className="absolute top-0 inset-x-0 h-px bg-white/20" />

            {isLoggingIn ? (
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin relative z-10" />
            ) : isAutomationEnabled ? (
              <Square size={14} className="fill-current relative z-10" />
            ) : (
              <Play size={14} className="fill-current relative z-10" />
            )}
            <span className="relative z-10">{isLoggingIn ? 'Connecting...' : isAutomationEnabled ? 'Stop Engine' : 'Start Engine'}</span>
          </button>
        </div>
      </motion.nav>

      {/* Main Flex Content - resizable columns */}
      <div ref={containerRef} className="flex flex-row flex-1 min-h-0 pt-4 gap-0">

        {/* Left Sidebar - Settings */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ width: `${colWidths[0]}%` }}
          className="flex flex-col gap-6 h-full min-h-0 flex-shrink-0 overflow-hidden"
        >

          <div className="glass-card rounded-2xl flex flex-col h-full hover:border-white/[0.08] transition-colors">
            <div className="p-5 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <Settings2 size={18} className="text-purple-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/90">Parameters</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

              <div className="space-y-2 group">
                <label className="text-[12px] uppercase font-black text-blue-400/80 group-hover:text-blue-400 transition-colors tracking-widest pl-1">1. Volume Trigger Threshold</label>
                <div className="relative">
                  <input type="number" value={stagedThreshold} onChange={e => setStagedThreshold(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-blue-500/50 focus:bg-black/80 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-all shadow-inner" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/30 tracking-widest">QTY</span>
                </div>
              </div>

              <div className="space-y-2 group">
                <label className="text-[12px] uppercase font-black text-amber-500/80 group-hover:text-amber-400 transition-colors tracking-widest pl-1">2. Total Target Volume</label>
                <div className="relative">
                  <input type="number" value={stagedTargetQty} onChange={e => setStagedTargetQty(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-amber-500/50 focus:bg-black/80 focus:ring-1 focus:ring-amber-500/20 focus:outline-none transition-all shadow-inner" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/30 tracking-widest">TOTAL</span>
                </div>
              </div>

              <div className="space-y-2 group">
                <label className="text-[12px] uppercase font-black text-emerald-500/80 group-hover:text-emerald-400 transition-colors tracking-widest pl-1">3. Timer Limit</label>
                <div className="relative">
                  <input type="number" value={stagedTimerSeconds} onChange={e => setStagedTimerSeconds(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-emerald-500/50 focus:bg-black/80 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-inner" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/30 tracking-widest">SEC</span>
                </div>
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2" />

              <div className="space-y-2 group">
                <label className="text-[12px] uppercase font-black text-cyan-500/80 group-hover:text-cyan-400 transition-colors tracking-widest pl-1">Order QTY %</label>
                <div className="relative">
                  <input type="number" value={stagedSlicePercent} onChange={e => setStagedSlicePercent(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-cyan-400 focus:border-cyan-500/50 focus:bg-black/80 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none transition-all shadow-inner" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-black text-white/30">%</span>
                </div>
              </div>

              <div className="space-y-2 group">
                <label className="text-[12px] uppercase font-black text-rose-500/80 group-hover:text-rose-400 transition-colors tracking-widest pl-1">Stop Loss Offset</label>
                <div className="relative">
                  <input type="number" value={stagedSLOffset} onChange={e => setStagedSLOffset(Number(e.target.value))}
                    className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-rose-400 focus:border-rose-500/50 focus:bg-black/80 focus:ring-1 focus:ring-rose-500/20 focus:outline-none transition-all shadow-inner" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/30 tracking-widest">PTS</span>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-black/20 flex flex-col gap-3">
              <button
                onClick={applySettings}
                className={cn(
                  "w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                  isSettingsDirty
                    ? "bg-blue-600 text-white border-blue-500 shadow-[0_4px_20px_rgba(37,99,235,0.4)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.6)] hover:-translate-y-0.5"
                    : "bg-white/5 text-white/30 border-white/5 cursor-default"
                )}
              >
                <RefreshCw size={14} className={cn(isSettingsDirty && "animate-spin-slow")} />
                Apply Changes
              </button>

              <button
                onClick={testConnection}
                className="w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest text-white/50 bg-black/40 border border-white/5 hover:bg-white/5 hover:text-white/80 transition-all flex items-center justify-center gap-2 hover:border-white/10"
              >
                <Wifi size={14} />
                Test Connection
              </button>
            </div>
          </div>

        </motion.div>

        {/* Resize handle: left | mid */}
        <ResizeHandle onDrag={makeHandleDrag(0, 1)} />

        {/* Center Area - Tokens & Logs */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ width: `${colWidths[1]}%` }}
          className="flex flex-col gap-0 h-full min-h-0 flex-shrink-0 overflow-hidden"
        >

          {/* Token Management */}
          <div
            style={{ height: `${contractsHeightPct}%` }}
            className="glass-card rounded-2xl flex flex-col shadow-xl min-h-[150px] max-h-[80%]"
          >
            <div className="p-5 border-b border-white/[0.05] bg-white/[0.01] flex flex-wrap gap-4 items-center justify-between sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/90">Automated Contracts</h2>
              </div>

              <div className="flex items-center gap-3">
                <select value={globalIndex} onChange={e => setGlobalIndex(e.target.value)}
                  className="bg-[#0f1115] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none hover:border-white/20 transition-colors text-white/80 shadow-inner">
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="FINNIFTY">FINNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>

                <select value={globalExpiry} onChange={e => setGlobalExpiry(e.target.value)}
                  className="bg-[#0f1115] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-blue-500 focus:outline-none hover:border-white/20 transition-colors text-white/80 shadow-inner min-w-[120px]">
                  {availableExpiries.map(e => <option key={e} value={e}>{e.split('T')[0]}</option>)}
                </select>

                <button onClick={handleAddToken}
                  className="bg-blue-600/90 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] tracking-wide">
                  <Plus size={14} /> Add Target
                </button>
              </div>
            </div>

            <div className="p-4 bg-transparent flex-1 overflow-y-auto w-full custom-scrollbar">
              {monitoredTokens.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/30">
                  <div className="w-16 h-16 rounded-full bg-blue-500/5 flex items-center justify-center mb-4 border border-blue-500/10">
                    <Zap size={24} className="opacity-40 text-blue-400" />
                  </div>
                  <p className="text-sm font-black text-white/50 tracking-wider uppercase">No targets monitored</p>
                  <p className="text-[11px] text-white/30 mt-2 font-medium">Click "Add Target" to begin tracking signals</p>
                </div>
              ) : (
                <AnimatePresence mode='popLayout'>
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))'
                    }}
                  >
                    {monitoredTokens.map(t => (
                      <TokenCard
                        key={t.id}
                        token={t}
                        strikes={getStrikesForToken(t)}
                        onRemove={removeToken}
                        onUpdateType={updateTokenType}
                        onUpdateStrike={updateTokenStrike}
                        onUpdateSide={updateTokenSide}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>
          </div>

          <VerticalResizeHandle onDrag={makeVerticalDrag} />

          {/* Execution Logs Table */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card flex-1 rounded-2xl flex flex-col min-h-[250px] shadow-2xl relative"
          >
            <div className="p-4 border-b border-white/[0.05] bg-white/[0.01] sticky top-0 z-10 backdrop-blur-md flex items-center justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  {isAutomationEnabled && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Engine Output Logs
              </h2>
              <button
                onClick={clearLogs}
                className="text-[10px] font-black text-rose-400/60 hover:text-rose-400 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black/30 custom-scrollbar">
              <table className="w-full text-left font-sans whitespace-nowrap table-fixed">
                <thead className="sticky top-0 bg-[#0f1115]/90 backdrop-blur-md border-b border-white/[0.05] text-[10px] text-white/40 tracking-widest uppercase shadow-xl z-10">
                  <tr>
                    <th className="py-3 px-5 font-black w-[110px]">TIME</th>
                    <th className="py-3 px-5 font-black min-w-[150px]">CONTRACT INFO</th>
                    <th className="py-3 px-5 font-black text-center w-[70px]">SIDE</th>
                    <th className="py-3 px-5 font-black text-right w-[90px]">QTY</th>
                    <th className="py-3 px-5 font-black text-right w-[90px]">PRICE</th>
                    <th className="py-3 px-5 font-black w-[130px] text-right">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-white/20 italic text-sm">Awaiting automation events...</td>
                    </tr>
                  ) : (
                    logs.map(log => {
                      if (!log.parsed) {
                        return (
                          <tr key={log.id} className="hover:bg-white/[0.02] transition-colors relative group">
                            <td className="py-3 px-5 text-xs text-white/20 font-mono group-hover:text-white/40 transition-colors">{log.time}</td>
                            <td colSpan="5" className={cn(
                              "py-3 px-5 text-sm",
                              log.type === 'error' ? 'text-rose-400/80 font-bold' :
                                log.type === 'success' ? 'text-emerald-400/80 font-bold' : 'text-white/40'
                            )}>{log.message}</td>
                          </tr>
                        );
                      }

                      const { token, side, qty, price, status: logStatus } = log.parsed;
                      const isLacExec = logStatus === '1 LAC EXEC';
                      const isSuccess = logStatus.includes('EXEC') || logStatus.includes('MET');
                      const sideColor = side === 'BUY' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                        side === 'SELL' ? 'text-rose-400 bg-rose-400/10 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'text-white/50 bg-white/5 border-white/10';

                      const statusColor = isLacExec
                        ? 'text-amber-300 animate-pulse'
                        : isSuccess ? 'text-emerald-400'
                          : logStatus === 'EXPIRED' || logStatus === 'FAILED' ? 'text-rose-400'
                            : logStatus === 'ACCUMULATING' ? 'text-amber-400 animate-pulse' : 'text-blue-400';

                      return (
                        <tr
                          key={log.id}
                          className={cn(
                            "transition-colors group relative",
                            isLacExec
                              ? "bg-amber-500/[0.07] hover:bg-amber-500/[0.12] border-y border-amber-500/20"
                              : "hover:bg-white/[0.03]"
                          )}
                        >
                          <td className="py-3.5 px-5 text-xs text-white/40 font-mono font-medium group-hover:text-white/60 transition-colors">{log.time}</td>
                          <td className={cn("py-3.5 px-5 font-black tracking-tight text-sm truncate transition-colors", isLacExec ? "text-amber-200" : "text-white/90 group-hover:text-white")}>{token}</td>
                          <td className="py-3.5 px-5 text-center">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-black border uppercase", sideColor)}>
                              {side}
                            </span>
                          </td>
                          <td className={cn("py-3.5 px-5 text-right font-mono text-sm font-bold transition-colors", isLacExec ? "text-amber-300 font-black" : "text-white/80 group-hover:text-white")}>{qty?.toLocaleString()}</td>
                          <td className="py-3.5 px-5 text-right font-mono text-sm text-cyan-400/90 font-bold group-hover:text-cyan-400 transition-colors">{price}</td>
                          <td className="py-3.5 px-5 font-black uppercase text-[10px] tracking-widest text-right">
                            {isLacExec ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)] animate-pulse">
                                ⚡ 1 LAC QTY
                              </span>
                            ) : (
                              <span className={cn(statusColor)}>{logStatus}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>

        {/* Resize handle: mid | right */}
        <ResizeHandle onDrag={makeHandleDrag(1, 2)} />

        {/* Right Sidebar - Order Book */}
        <div
          style={{ width: `${colWidths[2]}%` }}
          className="h-full min-h-[300px] flex-shrink-0 overflow-hidden"
        >
          <OrderBook
            orders={executedOrders}
            onClearAll={clearOrderHistory}
            onRemoveOne={removeOneOrder}
          />
        </div>

      </div>
    </div>
  );
}

export default App;
