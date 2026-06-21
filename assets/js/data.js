/* =============================================================================
 * data.js  —  Mock iGaming / Sportsbook dataset generator
 * -----------------------------------------------------------------------------
 * ONE deterministic, seeded generator feeds BOTH engines:
 *   - the SQL engine (sql.js / SQLite)  -> CREATE TABLE + INSERT
 *   - the Python engine (Pyodide)       -> pandas DataFrames
 * so a SQL query and a pandas snippet always see the *identical* rows.
 *
 * Tables produced:
 *   players   : one row per registered player (acquisition + profile)
 *   deposits  : cash-in events (player funding their wallet)
 *   bets      : individual wagers (sportsbook + casino)
 *   sessions  : login sessions (engagement / active-user signal)
 *
 * Everything is generated from a fixed seed, so the data never changes
 * between page loads -> exercises and "expected answers" stay stable.
 * =========================================================================== */

(function (global) {
  "use strict";

  // The "current date" of the simulated business. All recency / retention
  // math in the lessons is relative to this anchor.
  const REFERENCE_DATE = new Date(Date.UTC(2025, 11, 31)); // 2025-12-31

  // ---- Seeded PRNG (mulberry32) --------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(20251231);

  // ---- Small random helpers -------------------------------------------------
  const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  // Weighted pick: items = [["US",5],["CA",2],...]
  function weighted(items) {
    const total = items.reduce((s, x) => s + x[1], 0);
    let r = rand() * total;
    for (const [val, w] of items) {
      if ((r -= w) <= 0) return val;
    }
    return items[items.length - 1][0];
  }

  // Standard normal via Box–Muller
  function randNormal(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Lognormal — handy for money (deposits, stakes): right-skewed, positive.
  const randLognormal = (mu, sigma) => Math.exp(randNormal(mu, sigma));

  // Exponential (used for "days until next event" style gaps)
  const randExp = (lambda) => -Math.log(1 - rand()) / lambda;

  const round2 = (x) => Math.round(x * 100) / 100;

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
  const iso = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
  const daysBetween = (a, b) => Math.floor((b - a) / 86400000);

  // ---- Reference dimensions -------------------------------------------------
  const COUNTRIES = [
    ["US-NJ", 22], ["US-PA", 18], ["US-NY", 16], ["US-MI", 9],
    ["US-IL", 8], ["CA-ON", 10], ["UK", 9], ["DE", 4], ["BR", 4],
  ];
  const CHANNELS = [
    ["Paid Search", 26], ["Affiliate", 22], ["Social Ads", 18],
    ["Organic", 14], ["Referral", 11], ["TV/Brand", 9],
  ];
  const DEVICES = [["iOS", 45], ["Android", 38], ["Desktop", 17]];
  const DEP_METHODS = [
    ["Card", 40], ["PayPal", 22], ["ApplePay", 16],
    ["Bank", 14], ["Crypto", 8],
  ];

  // Value tiers shape how much a player deposits / wagers and how long they
  // stick around — this is what makes LTV, retention & GGR lessons realistic.
  const TIERS = [
    // name,      weight, depMu, depSigma, lifeMean(days), betsPerActiveDay
    ["Casual",    58, 3.0, 0.6, 25,  1.4],
    ["Regular",   30, 3.7, 0.6, 70,  2.6],
    ["VIP",       9,  4.7, 0.7, 160, 4.5],
    ["Whale",     3,  5.7, 0.8, 240, 6.0],
  ];

  const N_PLAYERS = 500;

  // ===========================================================================
  // Generation
  // ===========================================================================
  function generate() {
    const players = [];
    const deposits = [];
    const bets = [];
    const sessions = [];

    let depId = 1, betId = 1, sessId = 1;

    for (let pid = 1; pid <= N_PLAYERS; pid++) {
      // --- signup spread across the 2025 calendar year ----------------------
      const signup = addDays(new Date(Date.UTC(2025, 0, 1)), randInt(0, 363));

      const country = weighted(COUNTRIES);
      const channel = weighted(CHANNELS);
      const device = weighted(DEVICES);
      const kyc = rand() < 0.86 ? 1 : 0;

      const tier = weighted(TIERS.map((t) => [t, t[1]]));
      const [tierName, , depMu, depSigma, lifeMean, betsPerDay] = tier;

      // --- lifespan: how many days from signup until the player goes quiet --
      // Exponential-ish, capped at the reference date.
      const maxDays = daysBetween(signup, REFERENCE_DATE);
      let lifespan = Math.round(randExp(1 / lifeMean));
      lifespan = Math.min(Math.max(lifespan, 0), Math.max(maxDays, 0));
      const lastActive = addDays(signup, lifespan);

      // --- conversion: did they ever deposit? -------------------------------
      // Higher tiers and verified players convert more often.
      const convBase = { Casual: 0.55, Regular: 0.8, VIP: 0.95, Whale: 0.98 }[tierName];
      const converted = rand() < convBase * (kyc ? 1 : 0.7);

      players.push({
        player_id: pid,
        signup_date: iso(signup),
        country,
        acquisition_channel: channel,
        device,
        kyc_verified: kyc,
        value_tier: tierName,
        last_active_date: converted ? iso(lastActive) : iso(signup),
      });

      if (!converted) continue; // non-depositors generate no money/activity

      // --- deposits ---------------------------------------------------------
      // First deposit lands shortly after signup; more deposits over lifespan.
      const firstDepGap = Math.min(Math.round(randExp(1 / 2)), Math.max(lifespan, 0));
      let depDate = addDays(signup, firstDepGap);
      const nDeposits = 1 + Math.round(randExp(1 / (1 + lifespan / 30)));
      for (let i = 0; i < nDeposits; i++) {
        if (depDate > lastActive || depDate > REFERENCE_DATE) break;
        deposits.push({
          deposit_id: depId++,
          player_id: pid,
          deposit_date: iso(depDate),
          amount: round2(Math.max(5, randLognormal(depMu, depSigma))),
          method: weighted(DEP_METHODS),
        });
        depDate = addDays(depDate, 1 + Math.round(randExp(1 / 18)));
      }

      // --- sessions + bets, walking active days across the lifespan ---------
      let cur = new Date(signup.getTime());
      while (cur <= lastActive && cur <= REFERENCE_DATE) {
        // probability the player is active on a given day decays with tenure
        const tenure = daysBetween(signup, cur);
        const pActive = Math.max(0.05, 0.6 * Math.exp(-tenure / (lifeMean * 1.5)));
        if (rand() < pActive) {
          const product = rand() < 0.55 ? "Sportsbook" : "Casino";
          const duration = Math.max(1, Math.round(randLognormal(3.0, 0.6)));
          sessions.push({
            session_id: sessId++,
            player_id: pid,
            session_date: iso(cur),
            duration_min: duration,
            product,
          });

          // a handful of bets in the session
          const nBets = Math.max(1, Math.round(randExp(1 / betsPerDay)));
          for (let b = 0; b < nBets; b++) {
            const stake = round2(Math.max(1, randLognormal(depMu - 1.2, 0.7)));
            let odds, won, payout;
            if (product === "Sportsbook") {
              odds = round2(1.4 + randExp(1 / 1.3)); // decimal odds, skewed
              const implied = 1 / odds;
              const trueP = implied * 0.93; // ~7% hold against the player
              won = rand() < trueP ? 1 : 0;
              payout = won ? round2(stake * odds) : 0;
            } else {
              odds = null;
              // casino: spiky payouts but ~95% RTP (≈5% house hold).
              // Win ~30% of the time; winning multiplier is right-skewed.
              // E[return] = 0.30 * E[lognormal(0.9,0.7)] ≈ 0.30 * 3.14 ≈ 0.94
              const mult = rand() < 0.30 ? randLognormal(0.9, 0.7) : 0;
              payout = round2(stake * mult);
              won = payout > stake ? 1 : 0;
            }
            bets.push({
              bet_id: betId++,
              player_id: pid,
              bet_date: iso(cur),
              product,
              stake,
              odds,
              payout,
              won,
            });
          }
        }
        cur = addDays(cur, 1);
      }
    }

    return { players, deposits, bets, sessions };
  }

  const DATA = generate();

  // ---- Schema (column name -> SQLite type) for the SQL engine ---------------
  const SCHEMA = {
    players: {
      player_id: "INTEGER", signup_date: "TEXT", country: "TEXT",
      acquisition_channel: "TEXT", device: "TEXT", kyc_verified: "INTEGER",
      value_tier: "TEXT", last_active_date: "TEXT",
    },
    deposits: {
      deposit_id: "INTEGER", player_id: "INTEGER", deposit_date: "TEXT",
      amount: "REAL", method: "TEXT",
    },
    bets: {
      bet_id: "INTEGER", player_id: "INTEGER", bet_date: "TEXT",
      product: "TEXT", stake: "REAL", odds: "REAL", payout: "REAL", won: "INTEGER",
    },
    sessions: {
      session_id: "INTEGER", player_id: "INTEGER", session_date: "TEXT",
      duration_min: "INTEGER", product: "TEXT",
    },
  };

  global.IGAMING = {
    REFERENCE_DATE: iso(REFERENCE_DATE),
    data: DATA,
    schema: SCHEMA,
    counts: {
      players: DATA.players.length,
      deposits: DATA.deposits.length,
      bets: DATA.bets.length,
      sessions: DATA.sessions.length,
    },
  };
})(typeof window !== "undefined" ? window : this);
