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
              const res = await fetch(`/api/get-match-data?matchId=${m.id}`);
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
        const res = await fetch(`/api/get-match-data?matchId=${activeMatch}`);
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
      className="min-h-screen flex flex-col relative overflow-x-hidden bg-slate-50 font-sans pb-10"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(16, 185, 129, 0.03) 40px, rgba(16, 185, 129, 0.03) 80px)' }}
    >
      {activeNoise && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-ping text-9xl opacity-20 select-none">
          {activeNoise}
        </div>
      )}

      <div className="max-w-5xl mx-auto w-full mt-4 sm:mt-8 p-2 sm:p-5 flex-grow relative z-10">
        
        {/* HEADER */}
        <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl mb-6 sm:mb-10 border-b-4 border-emerald-500 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-white/10 to-transparent opacity-30 pointer-events-none"></div>
          <div className="text-center relative z-10 flex flex-col items-center">
            <span className="text-emerald-400 font-black tracking-widest uppercase text-[10px] sm:text-xs mb-1 sm:mb-2 flex items-center gap-2">
              <span>⚽</span> Live Tournament Hub <span>⚽</span>
            </span>
            <h1 className="text-xl sm:text-5xl font-black text-white tracking-tight">
              World Cup Pint Tracker
            </h1>
          </div>
        </div>

        {/* ROW 1: GAME INFO & PREDICTIONS (Forced 2 Columns) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-6 mb-6">
          
          {/* COLUMN 1: The Game & Scoreboard */}
          <div className="flex flex-col gap-2 sm:gap-4">
            <div className="bg-slate-800 text-white p-3 sm:p-4 rounded-xl shadow-md border border-slate-700 flex flex-col justify-center h-full">
              <label className="font-bold whitespace-nowrap flex items-center gap-2 text-xs sm:text-base mb-2">
                <span>🏟️</span> Active Match:
              </label>
              <select
                value={activeMatch}
                onChange={(e) => setActiveMatch(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-700 border border-slate-600 text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer text-xs sm:text-base"
              >
                {MATCHES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="bg-amber-500 text-black p-3 sm:p-6 rounded-xl text-center shadow-lg border border-amber-400 flex flex-col justify-center h-full">
              <h2 className="text-[10px] sm:text-sm font-bold text-amber-900 truncate px-1 sm:px-4 mb-1">
                {homeTeam} vs {awayTeam}
              </h2>
              <div className={`text-2xl sm:text-5xl font-black tracking-tight transition-transform duration-200 ease-out ${justUpdated ? 'scale-110 text-white' : 'scale-100'}`}>
                {activeMatchTotalPints.toLocaleString()}
                <span className="block sm:inline text-[10px] sm:text-xl font-bold text-amber-900 sm:ml-2"> Total Pints</span>
              </div>
            </div>
          </div>

          {/* COLUMN 2: Predictions & Noise Maker */}
          <div className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 shadow-md flex flex-col justify-between">
            <div className="mb-4">
              <h4 className="font-bold text-slate-800 text-[11px] sm:text-md mb-1 flex items-center gap-1 sm:gap-2">
                <span>📊</span> Match Poll
              </h4>
              {!userPrediction ? (
                <div className="grid grid-cols-3 gap-1 sm:gap-2 mt-2">
                  <button onClick={() => handlePredict('home')} className="p-1 sm:p-2 border border-slate-200 rounded-lg text-[9px] sm:text-xs font-bold bg-slate-50 hover:bg-emerald-50 text-slate-700 text-center truncate">{homeTeam}</button>
                  <button onClick={() => handlePredict('draw')} className="p-1 sm:p-2 border border-slate-200 rounded-lg text-[9px] sm:text-xs font-bold bg-slate-50 hover:bg-slate-200 text-slate-700 text-center">Draw</button>
                  <button onClick={() => handlePredict('away')} className="p-1 sm:p-2 border border-slate-200 rounded-lg text-[9px] sm:text-xs font-bold bg-slate-50 hover:bg-emerald-50 text-slate-700 text-center truncate">{awayTeam}</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1 sm:gap-2 bg-slate-50 p-2 sm:p-3 rounded-lg border border-slate-100 mt-2">
                  {[ {l: homeTeam, p: mockPoll.home, c: 'bg-emerald-500'}, {l: 'Draw', p: mockPoll.draw, c: 'bg-slate-400'}, {l: awayTeam, p: mockPoll.away, c: 'bg-emerald-500'} ].map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[9px] sm:text-xs font-bold text-slate-600 mb-1 truncate gap-2">
                        <span className="truncate">{item.l}</span><span>{item.p}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 sm:h-2 rounded-full overflow-hidden">
                        <div className={`${item.c} h-full transition-all`} style={{ width: `${item.p}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 sm:pt-4">
              <h4 className="font-bold text-slate-800 text-[11px] sm:text-md mb-2 flex items-center gap-1 sm:gap-2">
                <span>📯</span> Noise Maker
              </h4>
              <div className="grid grid-cols-4 gap-1 sm:gap-2">
                {[ {e:'📯', n:'Horn', c:'#ef4444', b:'bg-red-50'}, {e:'🎺', n:'Band', c:'#f59e0b', b:'bg-amber-50'}, {e:'👏', n:'Clap', c:'#10b981', b:'bg-emerald-50'}, {e:'🥳', n:'Cheer', c:'#3b82f6', b:'bg-blue-50'} ].map((btn, i) => (
                  <button key={i} onClick={() => triggerNoise(btn.e, btn.c)} className={`p-1 sm:p-3 ${btn.b} border border-slate-200 rounded-lg text-center transition-all active:scale-90 shadow-sm flex flex-col items-center`}>
                    <span className="text-sm sm:text-xl">{btn.e}</span>
                    <span className="text-[7px] sm:text-[10px] font-extrabold uppercase tracking-tight mt-1 opacity-70">{btn.n}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: FULL WIDTH PINT LOGGING ROW */}
        <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-xl mb-6">
          <div className="max-w-3xl mx-auto flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full md:w-1/3">
              <label className="font-bold text-sm sm:text-lg mb-2 block text-slate-800 text-center md:text-left">1. Your Region</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full p-3 sm:p-4 rounded-xl border-2 border-slate-300 text-sm sm:text-lg outline-none focus:border-amber-500 bg-slate-50 font-bold"
              >
                {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            
            <div className="w-full md:w-2/3">
               <label className="font-bold text-sm sm:text-lg mb-2 block text-slate-800 text-center md:text-left">2. Log Drink</label>
               <button
                onClick={logPint}
                disabled={isSubmitting || cooldown > 0}
                className={`w-full py-4 sm:py-6 rounded-xl text-xl sm:text-4xl font-black tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 sm:gap-4 ${
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

        {/* ROW 3: LEADERBOARDS (Forced 2 Columns) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-6">
          
          {/* COLUMN 1: Regional Leaderboard */}
          <div className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 shadow-md flex flex-col h-[350px] sm:h-[500px]">
            <h3 className="font-bold text-[11px] sm:text-xl mb-2 sm:mb-4 border-b pb-2 flex flex-col sm:flex-row justify-between sm:items-end text-slate-800">
              <span className="truncate">📍 Regions</span>
              <span className="text-[9px] sm:text-sm font-normal text-slate-500">Pints / 100k</span>
            </h3>
            <div className="flex flex-col gap-2 overflow-y-auto pr-1 sm:pr-2 flex-grow">
              {[...REGIONS].sort((a, b) => getRegionScore(b.id) - getRegionScore(a.id)).map((region, index) => {
                const activeStats = allMatchStats[activeMatch] || {};
                const stats = activeStats[region.id] || { pint: 0, total: 0 };
                const score = getRegionScore(region.id);
                const hasActivity = stats.total > 0;
                return (
                  <div key={region.id} className={`p-2 sm:p-4 rounded-lg shadow-sm border ${hasActivity ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-[10px] sm:text-lg flex items-center gap-1 sm:gap-3 text-slate-800 truncate pr-2">
                        <span className="text-slate-400">{index + 1}.</span> {region.name}
                      </strong>
                      <span className={`font-black text-xs sm:text-2xl ${hasActivity ? 'text-amber-600' : 'text-slate-400'}`}>{score}</span>
                    </div>
                    <div className="text-[8px] sm:text-xs text-slate-500 sm:pl-7 font-medium">
                      Raw: {stats.pint.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: Matches Leaderboard */}
          <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-md text-white flex flex-col h-[350px] sm:h-[500px]">
            <h3 className="font-bold text-[11px] sm:text-lg p-3 sm:p-4 border-b border-slate-700 bg-slate-950 flex flex-col sm:flex-row justify-between sm:items-center">
              <span className="truncate">🍺 Top Matches</span>
              <span className="text-[9px] sm:text-xs font-normal text-slate-400 mt-1 sm:mt-0">Total Pints</span>
            </h3>
            <div className="flex flex-col overflow-y-auto">
              {top5Matches.map((match, index) => {
                const total = getMatchTotalPints(match.id);
                const isCurrent = activeMatch === match.id;
                return (
                  <div key={match.id} onClick={() => setActiveMatch(match.id)} className={`flex justify-between items-center p-3 sm:p-5 border-b border-slate-700 last:border-0 cursor-pointer transition-colors ${isCurrent ? 'bg-amber-500 text-black' : 'hover:bg-slate-800'}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
                      <span className={`font-bold text-[10px] sm:text-sm flex-shrink-0 ${isCurrent ? 'text-black' : 'text-slate-500'}`}>{index + 1}.</span>
                      <span className="font-semibold text-[10px] sm:text-sm truncate max-w-[100px] sm:max-w-[200px] block">
                        {match.name.split(' (')[0]}
                      </span>
                    </div>
                    <div className={`font-black text-[11px] sm:text-xl flex-shrink-0 ${isCurrent ? 'text-black' : 'text-amber-400'}`}>
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
        <div className="inline-block bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 max-w-md mx-auto text-left sm:text-center">
          <p className="text-[11px] sm:text-sm font-bold text-slate-700 mb-2">⚠️ Please drink responsibly and know your limits.</p>
          <p className="text-[9px] sm:text-xs text-slate-500 leading-relaxed">
            This tracker is for fun during the matches. Don't feel pressured to keep up. Visit{' '}
            <a href="https://www.drinkaware.co.uk/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800 underline font-semibold">Drinkaware</a>.
          </p>
          <p className="text-[9px] sm:text-xs text-slate-500 leading-relaxed mt-2 pt-2 border-t border-slate-100">
            <strong className="text-slate-600">Fair Play:</strong> Please use appropriately and refrain from spamming the tracker to artificially inflate scores.
          </p>
        </div>
      </footer>
    </main>
  );
}