import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { useAutomationEngine } from './engine/useAutomationEngine';
import { megaTraderAPI } from './utils/megaTraderAPI';
import contractsData from './contracts_nsefo.json';
import { Activity, Settings2, Play, Square, Plus, Trash2, Cpu, Zap, ChevronDown, Check, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
                className="bg-transparent border-none text-xs text-white w-full focus:outline-none placeholder-white/20"
              />
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
              {filteredStrikes.length === 0 ? (
                <div className="px-4 py-3 text-xs text-white/40 italic">No strikes found</div>
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
                      "w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors",
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
const TokenCard = ({ token, onRemove, onUpdateType, onUpdateStrike, onUpdateSide, strikes }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="bg-[#15171c]/80 border border-white/10 hover:border-white/20 transition-all shadow-lg rounded-2xl p-5 group relative overflow-hidden"
    >
      <div className={cn(
        "absolute top-0 left-0 w-1.5 h-full",
        token.type === 'CE' ? "bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]" : "bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
      )} />

      <div className="pl-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-xs font-black text-white/90 tracking-widest uppercase">{token.index}</div>
            <div className="text-[10px] text-white/60 font-mono mt-0.5 font-bold">{token.expiry.split('T')[0]} <span className="text-white/30 px-1">|</span> {token.tkn}</div>
          </div>
          <button onClick={() => onRemove(token.id)} className="text-white/30 hover:text-rose-400 transition-colors p-1.5 bg-white/5 rounded-lg hover:bg-rose-500/10 border border-white/5">
            <Trash2 size={16} />
          </button>
        </div>

        <div className="flex gap-3 items-center mb-5">
          <StrikeSelector
            token={token}
            strikes={strikes}
            onUpdate={(val) => onUpdateStrike(token.id, val)}
          />

          <button
            onClick={() => onUpdateType(token.id, token.type === 'CE' ? 'PE' : 'CE')}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-black w-16 border transition-all duration-300 shadow-lg h-11 flex items-center justify-center",
              token.type === 'CE'
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 shadow-cyan-500/5"
                : "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20 shadow-purple-500/5"
            )}
          >
            {token.type}
          </button>
        </div>

        <div className="flex bg-black/60 rounded-xl p-1 border border-white/5 shadow-inner h-10">
          <button onClick={() => onUpdateSide(token.id, 'both')} className={cn("flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all tracking-widest", token.side === 'both' ? "bg-white/10 text-white shadow-xl" : "text-white/40 hover:text-white/70")}>BOTH</button>
          <button onClick={() => onUpdateSide(token.id, 'buy')} className={cn("flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all tracking-widest", token.side === 'buy' ? "bg-emerald-500/20 text-emerald-400 shadow-xl border border-emerald-500/20" : "text-white/40 hover:text-emerald-400/80")}>BUY</button>
          <button onClick={() => onUpdateSide(token.id, 'sell')} className={cn("flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all tracking-widest", token.side === 'sell' ? "bg-rose-500/20 text-rose-400 shadow-xl border border-rose-500/20" : "text-white/40 hover:text-rose-400/80")}>SELL</button>
        </div>
      </div>
    </motion.div>
  );
};

function App() {
  // --- Global State ---
  const [globalIndex, setGlobalIndex] = useState('NIFTY');
  const [globalExpiry, setGlobalExpiry] = useState('');

  // --- Monitored Tokens ---
  const [monitoredTokens, setMonitoredTokens] = useState(() => {
    const saved = localStorage.getItem('autobot_tokens');
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- Automation Settings ---
  const [isAutomationEnabled, setIsAutomationEnabled] = useState(false);
  const [autoOrderThreshold, setAutoOrderThreshold] = useState(15000);
  const [targetTotalQty, setTargetTotalQty] = useState(25000);
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [autoOrderSlicePercentage, setAutoOrderSlicePercentage] = useState(10);
  const [triggerPriceValue, setTriggerPriceValue] = useState(0);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('autobot_tokens', JSON.stringify(monitoredTokens));
  }, [monitoredTokens]);

  // --- Expiry Management ---
  const availableExpiries = useMemo(() => {
    let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
    const filtered = contractsData.filter(c => c.s === searchIndex);
    return [...new Set(filtered.map(c => c.e))].sort();
  }, [globalIndex]);

  useEffect(() => {
    if (availableExpiries.length > 0 && !availableExpiries.includes(globalExpiry)) {
      const today = new Date().toISOString().split('T')[0];
      setGlobalExpiry(availableExpiries.find(e => e >= today) || availableExpiries[0]);
    }
  }, [availableExpiries, globalExpiry]);

  // --- Market Data Hook ---
  const handleMarketMessage = useCallback((type, data) => { }, []);

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
  }, []);

  const { activeAccumulations } = useAutomationEngine({
    isAutomationEnabled,
    depthData,
    monitoredTokens,
    autoOrderThreshold,
    targetTotalQty,
    timerSeconds,
    autoOrderSlicePercentage,
    triggerPriceValue,
    onLogEvent: addLogEvent,
    status
  });

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

  const getStrikesForToken = (t) => {
    let searchIndex = t.index === 'SENSEX' ? 'BSX' : t.index;
    const filtered = contractsData.filter(c => c.s === searchIndex && c.e === t.expiry);
    return [...new Set(filtered.map(c => Number(c.st)))].sort((a, b) => a - b);
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
    <div className="min-h-screen flex flex-col pt-16 px-6 pb-6 gap-6 max-w-7xl mx-auto">

      {/* Top Navbar */}
      <motion.nav
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 h-14 glass-panel z-50 px-6 flex items-center justify-between border-b border-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <Cpu size={18} className="text-blue-400" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white/90">
            Autobot <span className="text-blue-500">Engine</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider">
            <span className="text-white/80 uppercase">Feed:</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 border border-white/5">
              <div className={cn(
                "w-2 h-2 rounded-full",
                status === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  : "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"
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
              "flex items-center gap-2 px-5 py-2 rounded-md font-bold text-xs uppercase tracking-wider transition-all duration-300",
              isLoggingIn ? "bg-white/10 text-white/50 cursor-not-allowed" :
                isAutomationEnabled
                  ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
            )}
          >
            {isLoggingIn ? (
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : isAutomationEnabled ? (
              <Square size={14} className="fill-current" />
            ) : (
              <Play size={14} className="fill-current" />
            )}
            {isLoggingIn ? 'Connecting...' : isAutomationEnabled ? 'Stop Engine' : 'Start Engine'}
          </button>
        </div>
      </motion.nav>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">

        {/* Left Sidebar - Settings */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="lg:col-span-3 flex flex-col gap-6"
        >

          <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-3">
              <Settings2 size={16} className="text-purple-400" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/90">Parameters</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5 group">
                <label className="text-[10px] uppercase font-bold text-blue-400 tracking-wider group-hover:text-blue-400 transition-colors">1. Signal Threshold</label>
                <div className="relative">
                  <input type="number" value={autoOrderThreshold} onChange={e => setAutoOrderThreshold(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-blue-500 focus:outline-none transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80">QTY</span>
                </div>
              </div>

              <div className="space-y-1.5 group">
                <label className="text-[10px] uppercase font-bold text-amber-400 tracking-wider group-hover:text-amber-400 transition-colors">2. Accumulation Goal</label>
                <div className="relative">
                  <input type="number" value={targetTotalQty} onChange={e => setTargetTotalQty(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-amber-500 focus:outline-none transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80">TOTAL</span>
                </div>
              </div>

              <div className="space-y-1.5 group">
                <label className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider group-hover:text-emerald-400 transition-colors">3. Timer Limit</label>
                <div className="relative">
                  <input type="number" value={timerSeconds} onChange={e => setTimerSeconds(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80">SEC</span>
                </div>
              </div>

              <hr className="border-white/5 my-4" />

              <div className="space-y-1.5 group">
                <label className="text-[10px] uppercase font-bold text-white/60 tracking-wider group-hover:text-cyan-400 transition-colors">Order QTY %</label>
                <div className="relative">
                  <input type="number" value={autoOrderSlicePercentage} onChange={e => setAutoOrderSlicePercentage(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-cyan-400 focus:border-cyan-500 focus:outline-none transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white/80">%</span>
                </div>
              </div>

              <div className="space-y-1.5 group">
                <label className="text-[10px] uppercase font-bold text-white/60 tracking-wider group-hover:text-rose-400 transition-colors">Stop Loss Offset</label>
                <div className="relative">
                  <input type="number" value={triggerPriceValue} onChange={e => setTriggerPriceValue(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-red-500 focus:border-rose-500 focus:outline-none transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80">PTS</span>
                </div>
              </div>
            </div>
          </div>

        </motion.div>

        {/* Right Area - Tokens & Logs */}
        <motion.div
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="lg:col-span-9 flex flex-col gap-8 h-full min-h-0"
        >

          {/* Token Management */}
          <div className="glass-card rounded-2xl border border-white/10 flex flex-col shadow-2xl overflow-visible">
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-blue-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/95">Monitored Contracts</h2>
              </div>

              <div className="flex items-center gap-3">
                <select value={globalIndex} onChange={e => setGlobalIndex(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded px-3 py-1 text-xs font-bold focus:border-blue-500 focus:outline-none">
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="FINNIFTY">FINNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>

                <select value={globalExpiry} onChange={e => setGlobalExpiry(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded px-3 py-1 text-xs font-bold focus:border-blue-500 focus:outline-none">
                  {availableExpiries.map(e => <option key={e} value={e}>{e.split('T')[0]}</option>)}
                </select>

                <button onClick={handleAddToken}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                  <Plus size={14} /> Add Target
                </button>
              </div>
            </div>

            <div className="p-4 bg-black/40 flex-1 min-h-[260px] max-h-[450px] overflow-y-auto w-full custom-scrollbar">
              {monitoredTokens.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/30 py-10">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                    <Zap size={32} className="opacity-20 text-blue-400" />
                  </div>
                  <p className="text-base font-bold text-white/60">No targets monitored</p>
                  <p className="text-xs text-white/40 mt-1 font-medium italic">Click "Add Target" to begin tracking signals</p>
                </div>
              ) : (
                <AnimatePresence mode='popLayout'>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

          {/* Execution Logs Table */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card flex-1 rounded-2xl border border-white/10 flex flex-col min-h-[300px] shadow-2xl"
          >
            <div className="p-4 border-b border-white/5 bg-black/40">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {isAutomationEnabled && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Engine Output stream
              </h2>
            </div>

            <div className="flex-1 overflow-auto bg-[#0a0c10]">
              <table className="col-span-12 w-full text-left font-mono text-[11px] whitespace-nowrap">
                <thead className="sticky top-0 bg-[#0f1115] border-b border-white/5 text-white/80 shadow-xl z-10 transition-colors">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold w-24">TIME</th>
                    <th className="py-2.5 px-4 font-semibold">CONTRACT INFO</th>
                    <th className="py-2.5 px-4 font-semibold text-center w-20">SIDE</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-24">SIGNAL QTY</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-24">PRICE</th>
                    <th className="py-2.5 px-4 font-semibold w-32">CONDITION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-white/20 italic">Awaiting automation events...</td>
                    </tr>
                  ) : (
                    logs.map(log => {
                      // fallback for system logs missing parsing metadata
                      if (!log.parsed) {
                        return (
                          <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 px-4 text-white/30">{log.time}</td>
                            <td colSpan="5" className={cn(
                              "py-2 px-4",
                              log.type === 'error' ? 'text-rose-400' :
                                log.type === 'success' ? 'text-emerald-400' : 'text-white/60'
                            )}>{log.message}</td>
                          </tr>
                        );
                      }

                      const { token, side, qty, price, status: logStatus } = log.parsed;

                      const isSuccess = logStatus.includes('EXEC') || logStatus.includes('MET');
                      const sideColor = side === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' :
                        side === 'SELL' ? 'text-rose-400 bg-rose-400/10' : 'text-white/50 bg-white/5';

                      const statusColor = isSuccess ? 'text-emerald-400' :
                        logStatus === 'EXPIRED' ? 'text-rose-400' :
                          logStatus === 'ACCUMULATING' ? 'text-amber-400 animate-pulse' : 'text-blue-400';

                      return (
                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="py-2 px-4 text-white/60 font-medium group-hover:text-white/80">{log.time}</td>
                          <td className="py-2 px-4 text-white/95 font-black tracking-tight">{token}</td>
                          <td className="py-2 px-4 text-center">
                            <span className={cn("px-2 py-0.5 rounded text-[9px] font-black border border-current/20", sideColor)}>
                              {side}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums text-white/70">{qty?.toLocaleString()}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-white/70">{price}</td>
                          <td className="py-2 px-4 font-black">
                            <span className={cn("text-[10px] tracking-wide", statusColor)}>
                              {logStatus}
                            </span>
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
      </div>
    </div>
  );
}

export default App;
