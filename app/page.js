'use client';

import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { REGIONS, MATCHES } from '@/lib/constants';

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState(REGIONS[0].id);
  const [activeMatch, setActiveMatch] = useState(MATCHES[0].id);
  const [allMatchStats, setAllMatchStats] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  const [userPrediction, setUserPrediction] = useState(null);
  const [mockPoll, setMockPoll] = useState({ home: 42, draw: 23, away: 35 });
  const [activeNoise, setActiveNoise] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const savedExpiry = localStorage.getItem('pint_cooldown_expiry');
    if (savedExpiry) {
      const timeLeft = Math.ceil((parseInt(savedExpiry) - Date.now()) / 1000);
      if (timeLeft > 0) {
        setCooldown(timeLeft);
      } else {
        localStorage.removeItem('pint_cooldown_expiry');
      }
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          localStorage.removeItem('pint_cooldown_expiry');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    const fetchAllStats = async () => {
      try {
        const newStats = {};
        const chunkSize = 10;
        for (let i = 0; i < MATCHES.length; i += chunkSize) {
          const chunk = MATCHES.slice(i, i + chunkSize);
          const promises = chunk.map(async (m) => {
            try {
              // 🚨 ADDED CACHE BYPASS HERE
              const res = await fetch(`/api/get-match-data?matchId=${m.id}`, { cache: 'no-store' });
              const contentType = res.headers.get("content-type");
              if (res.ok && contentType && contentType.includes("application/json")) {
                const result = await res.json();
                return { id: m.id, data: result.data };
              }
              return { id: m.id, data: null };
            } catch (err) {
              return { id: m.id, data: null };
            }
          });
          const results = await Promise.all(promises);
          results.forEach(res => {
            if (res.data) newStats[res.id] = res.data;
          });
        }
        setAllMatchStats(newStats);
      } catch (err) {
        console.error("Master fetch failed", err);
      }
    };
    fetchAllStats();
  }, []);

  useEffect(() => {
    const fetchActiveStats = async () => {
      try {
        // 🚨 ADDED CACHE BYPASS HERE
        const res = await fetch(`/api/get-match-data?matchId=${activeMatch}`, { cache: 'no-store' });
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          const result = await res.json();
          if (result.data) {
            setAllMatchStats(prev => ({ ...prev, [activeMatch]: result.data }));
          }
        }
      } catch (err) {}
    };
    fetchActiveStats();
    setUserPrediction(null);
    const seed = activeMatch.charCodeAt(0) || 10;
    setMockPoll({
      home: (seed % 35) + 30,
      draw: (seed % 15) + 15,
      away: 100 - ((seed % 35) + 30) - ((seed % 15) + 15)
    });
    const interval = setInterval(fetchActiveStats, 2000);
    return () => clearInterval(interval);
  }, [activeMatch]);

  const logPint = async () => {
    if (isSubmitting || cooldown > 0) return;
    setIsSubmitting(true);
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#fbbf24', '#f59e0b', '#ffffff'],
      disableForReducedMotion: true
    });
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 300);

    setAllMatchStats(prev => ({
      ...prev,
      [activeMatch]: {
        ...(prev[activeMatch] || {}),
        [selectedRegion]: {
          ...(prev[activeMatch]?.[selectedRegion] || {}),
          pint: (prev[activeMatch]?.[selectedRegion]?.pint || 0) + 1,
          total: (prev[activeMatch]?.[selectedRegion]?.total || 0) + 1
        }
      }
    }));

    try {
      await fetch('/api/log-drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatch, regionId: selectedRegion, drinkType: 'pint' })
      });
      const cooldownDuration = 900; 
      const expiryTime = Date.now() + cooldownDuration * 1000;
      localStorage.setItem('pint_cooldown_expiry', expiryTime.toString());
      setCooldown(cooldownDuration);
    } catch (err) {} finally {
      setIsSubmitting(false);
    }
  };

  const triggerNoise = (emoji, color) => {
    setActiveNoise(emoji);
    setTimeout(() => setActiveNoise(null), 600);
    confetti({
      particleCount: 15,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: [color, '#ffffff']
    });
  };

  const handlePredict = (choice) => {
    if (userPrediction) return;
    setUserPrediction(choice);
    setMockPoll(prev => ({ ...prev, [choice]: prev[choice] + 1 }));
  };

  const getRegionScore = (regionId) => {
    const activeStats = allMatchStats[activeMatch] || {};
    const total = activeStats[regionId]?.total || 0;
    const pop = REGIONS.find(r => r.id === regionId)?.pop || 1;
    return ((total / pop) * 100000).toFixed(2);
  };

  const getMatchTotalPints = (matchId) => {
    const stats = allMatchStats[matchId] || {};
    return Object.values(stats).reduce((sum, r) => sum + (r.pint || 0), 0);
  };

  const formatCooldownTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activeMatchTotalPints = getMatchTotalPints(activeMatch);
  const currentMatchName = MATCHES.find(m => m.id === activeMatch)?.name || 'Active Match';
  const teams = currentMatchName.split(' (')[0].split(' vs ');
  const homeTeam = teams[0] || 'Home';
  const awayTeam = teams[1] || 'Away';
  const top5Matches = [...MATCHES].sort((a, b) => getMatchTotalPints(b.id) - getMatchTotalPints(a.id)).slice(0, 5);

  return (
    <main 
      className="min-h-screen flex flex-col relative overflow-x-hidden bg-slate-50 font-sans pb-6"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(16, 185, 129, 0.03) 40px, rgba(16, 185, 129, 0.03) 80px)' }}
    >
      {/* NOISE MAKER GHOST EFFECT */}
      {activeNoise && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-ping text-8xl sm:text-9xl opacity-20 select-none">
          {activeNoise}
        </div>
      )}

      {/* COMPACT WRAPPER: Gap reduced from 6 to 4 */}
      <div className="max-w-4xl mx-auto w-full mt-3 sm:mt-5 p-3 sm:p-4 flex flex-col gap-4 relative z-10">
        
        {/* 1. THE GAME HEADER & SCOREBOARD */}
        <div className="flex flex-col gap-0 w-full">
          {/* Header Banner - Reduced padding and text sizes */}
          <div className="bg-slate-900 rounded-t-2xl p-4 sm:p-5 shadow-xl border-b-2 border-emerald-500 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-white/10 to-transparent opacity-30 pointer-events-none"></div>
            <div className="text-center relative z-10 flex flex-col items-center">
              <span className="text-emerald-400 font-black tracking-widest uppercase text-[10px] sm:text-xs mb-1 flex items-center gap-2">
                <span>⚽</span> Live Tournament Hub <span>⚽</span>
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                World Cup Pint Tracker
              </h1>
            </div>
          </div>

          {/* Match Selector - Reduced padding */}
          <div className="bg-slate-800 text-white p-3 shadow-md border-x border-slate-700 w-full flex flex-col sm:flex-row items-center gap-3">
            <label className="font-bold whitespace-nowrap flex items-center gap-2 text-sm sm:text-base">
              <span>🏟️</span> Active Match:
            </label>
            <select
              value={activeMatch}
              onChange={(e) => setActiveMatch(e.target.value)}
              className="w-full p-2 rounded-lg bg-slate-700 border border-slate-600 text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer text-sm sm:text-base"
            >
              {MATCHES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Global Scoreboard - Tighter spacing */}
          <div className="bg-amber-500 text-black p-4 sm:p-5 rounded-b-2xl text-center shadow-lg border border-amber-400 w-full">
            <h2 className="text-xs sm:text-sm font-bold text-amber-900 truncate px-4 mb-1">
              {homeTeam} vs {awayTeam}
            </h2>
            <div className={`text-4xl sm:text-5xl font-black tracking-tight transition-transform duration-200 ease-out ${justUpdated ? 'scale-105 text-white' : 'scale-100'}`}>
              {activeMatchTotalPints.toLocaleString()}
              <span className="block sm:inline text-lg sm:text-xl font-bold text-amber-900 sm:ml-3">Total Pints</span>
            </div>
          </div>
        </div>

        {/* 2. THE PINT INPUT */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-md w-full">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-full sm:w-1/3">
              <label className="font-bold text-sm sm:text-base mb-1 block text-slate-800">1. Your Region</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full p-2.5 sm:p-3 rounded-lg border-2 border-slate-300 text-sm sm:text-base outline-none focus:border-amber-500 bg-slate-50 font-bold"
              >
                {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            
            <div className="w-full sm:w-2/3">
               <label className="font-bold text-sm sm:text-base mb-1 block text-slate-800">2. Log Drink</label>
               <button
                onClick={logPint}
                disabled={isSubmitting || cooldown > 0}
                className={`w-full py-3 sm:py-4 rounded-xl text-xl sm:text-2xl font-black tracking-wide transition-all shadow-md flex items-center justify-center gap-2 sm:gap-3 ${
                  cooldown > 0 
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none border border-slate-300' 
                    : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95 border-b-4 border-amber-600'
                }`}
              >
                {cooldown > 0 ? (
                  <span>⏳ COOLDOWN: {formatCooldownTime(cooldown)}</span>
                ) : (
                  <span>🍺 PRESS FOR PINT</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 3. THE MATCH PREDICTION & FAN ZONE */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-md w-full flex flex-col gap-4">
          {/* Match Poll */}
          <div>
            <h4 className="font-bold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-2">
              <span>📊</span> Match Poll: Who Will Win?
            </h4>
            {!userPrediction ? (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handlePredict('home')} className="p-2 border-2 border-slate-200 rounded-lg text-xs sm:text-sm font-bold bg-slate-50 hover:bg-emerald-50 text-slate-700 text-center truncate transition-colors">{homeTeam}</button>
                <button onClick={() => handlePredict('draw')} className="p-2 border-2 border-slate-200 rounded-lg text-xs sm:text-sm font-bold bg-slate-50 hover:bg-slate-200 text-slate-700 text-center transition-colors">Draw</button>
                <button onClick={() => handlePredict('away')} className="p-2 border-2 border-slate-200 rounded-lg text-xs sm:text-sm font-bold bg-slate-50 hover:bg-emerald-50 text-slate-700 text-center truncate transition-colors">{awayTeam}</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 bg-slate-50 p-3 rounded-lg border-2 border-slate-100">
                {[ {l: homeTeam, p: mockPoll.home, c: 'bg-emerald-500'}, {l: 'Draw', p: mockPoll.draw, c: 'bg-slate-400'}, {l: awayTeam, p: mockPoll.away, c: 'bg-emerald-500'} ].map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs sm:text-sm font-bold text-slate-600 mb-1">
                      <span>{item.l}</span><span>{item.p}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div className={`${item.c} h-full transition-all`} style={{ width: `${item.p}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-slate-200" />

          {/* Noise Maker */}
          <div>
            <h4 className="font-bold text-slate-800 text-sm sm:text-base mb-2 flex items-center gap-2">
              <span>📯</span> Stadium Noise Maker
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {[ {e:'📯', n:'Horn', c:'#ef4444', b:'bg-red-50'}, {e:'🎺', n:'Band', c:'#f59e0b', b:'bg-amber-50'}, {e:'👏', n:'Clap', c:'#10b981', b:'bg-emerald-50'}, {e:'🥳', n:'Cheer', c:'#3b82f6', b:'bg-blue-50'} ].map((btn, i) => (
                <button key={i} onClick={() => triggerNoise(btn.e, btn.c)} className={`p-2 sm:p-3 ${btn.b} border-2 border-slate-200 rounded-lg text-center transition-all active:scale-95 shadow-sm flex flex-col items-center hover:brightness-95`}>
                  <span className="text-2xl sm:text-3xl">{btn.e}</span>
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-tight mt-1 text-slate-700">{btn.n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. LEADERBOARDS (Stacked Full Width, Compact) */}
        <div className="flex flex-col gap-4 w-full">
          
          {/* Regional Leaderboard */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-md w-full">
            <h3 className="font-bold text-lg sm:text-xl mb-3 border-b-2 pb-2 flex justify-between items-end text-slate-800">
              <span>📍 Regional Leaderboard</span>
              <span className="text-xs sm:text-sm font-normal text-slate-500">Pints per 100k</span>
            </h3>
            {/* Reduced max-height so it doesn't take up the whole screen */}
            <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
              {[...REGIONS].sort((a, b) => getRegionScore(b.id) - getRegionScore(a.id)).map((region, index) => {
                const activeStats = allMatchStats[activeMatch] || {};
                const stats = activeStats[region.id] || { pint: 0, total: 0 };
                const score = getRegionScore(region.id);
                const hasActivity = stats.total > 0;
                return (
                  <div key={region.id} className={`p-3 sm:p-4 rounded-xl shadow-sm border ${hasActivity ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                    <div className="flex justify-between items-center mb-0.5">
                      <strong className="text-base sm:text-lg flex items-center gap-2 text-slate-800">
                        <span className="text-slate-400 w-5">{index + 1}.</span> {region.name}
                      </strong>
                      <span className={`font-black text-xl sm:text-2xl ${hasActivity ? 'text-amber-600' : 'text-slate-400'}`}>{score}</span>
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 pl-7 font-medium">
                      Raw Pints Poured: {stats.pint.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Matches Leaderboard */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-md w-full text-white">
            <h3 className="font-bold text-lg sm:text-xl p-4 sm:p-5 border-b-2 border-slate-700 bg-slate-950 flex justify-between items-center rounded-t-2xl">
              <span>🍺 Top 5 Heaviest Matches</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400 uppercase tracking-wider">Total Pints</span>
            </h3>
            <div className="flex flex-col">
              {top5Matches.map((match, index) => {
                const total = getMatchTotalPints(match.id);
                const isCurrent = activeMatch === match.id;
                return (
                  <div key={match.id} onClick={() => setActiveMatch(match.id)} className={`flex justify-between items-center p-3 sm:p-4 border-b border-slate-700 last:border-0 cursor-pointer transition-colors ${isCurrent ? 'bg-amber-500 text-black' : 'hover:bg-slate-800'}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                      <span className={`font-bold text-sm sm:text-base flex-shrink-0 ${isCurrent ? 'text-black' : 'text-slate-500'}`}>{index + 1}.</span>
                      <span className="font-semibold text-sm sm:text-base truncate block">
                        {match.name.split(' (')[0]}
                      </span>
                    </div>
                    <div className={`font-black text-xl sm:text-2xl flex-shrink-0 ${isCurrent ? 'text-black' : 'text-amber-400'}`}>
                      {total.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
        </div>
      </div>

      <footer className="mt-8 py-6 border-t border-slate-200 text-center relative z-10 bg-slate-100/80 px-4">
        <div className="inline-block bg-white rounded-xl shadow-sm border border-slate-200 p-5 max-w-2xl mx-auto text-center">
          <p className="text-xs sm:text-sm font-bold text-slate-700 mb-1.5">⚠️ Please drink responsibly and know your limits.</p>
          <p className="text-[10px] sm:text-xs text-slate-500 leading-relaxed">
            This tracker is for fun during the matches. Don't feel pressured to keep up. For advice and support regarding alcohol, please visit{' '}
            <a href="https://www.drinkaware.co.uk/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800 underline font-semibold">Drinkaware</a>.
          </p>
          <p className="text-[10px] sm:text-xs text-slate-500 leading-relaxed mt-3 pt-3 border-t border-slate-100">
            <strong className="text-slate-600">Fair Play:</strong> This dashboard is built purely for community banter. Please use appropriately and refrain from spamming to artificially inflate scores.
          </p>
        </div>
      </footer>
    </main>
  );
}