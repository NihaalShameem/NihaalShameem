/* =============================================================================
 * layout.js  —  Shared curriculum nav + page chrome
 * -----------------------------------------------------------------------------
 * Single source of truth for the module list. Injects the top bar and the
 * left sidebar into every page, highlights the current module, and renders the
 * dataset cheat-sheet. Keeps every module page DRY.
 *
 * A page declares itself with:  <body data-module="m1">  (or "home")
 * Use data-base to point at the site root from nested pages (modules/ uses "..").
 * =========================================================================== */

(function (global) {
  "use strict";

  // status: "ready" | "soon"
  const CURRICULUM = [
    { id: "home", num: "", title: "Home / Roadmap", href: "index.html", status: "ready", part: "" },

    { part: "Part I · Foundations" },
    { id: "m1", num: "01", title: "Descriptive Statistics", href: "modules/module-01-descriptive-statistics.html", status: "ready" },
    { id: "m2", num: "02", title: "Probability Fundamentals", href: "modules/module-02-probability-fundamentals.html", status: "ready" },
    { id: "m3", num: "03", title: "Probability Distributions", href: "modules/module-03-distributions.html", status: "ready" },
    { id: "m4", num: "04", title: "Sampling & the CLT", href: "modules/module-04-sampling-clt.html", status: "ready" },

    { part: "Part II · Inference" },
    { id: "m5", num: "05", title: "Confidence Intervals", href: "#", status: "soon" },
    { id: "m6", num: "06", title: "Hypothesis Testing", href: "#", status: "soon" },
    { id: "m7", num: "07", title: "A/B Testing & Experiments", href: "#", status: "soon" },
    { id: "m8", num: "08", title: "Bayesian Inference", href: "#", status: "soon" },

    { part: "Part III · Modeling" },
    { id: "m9", num: "09", title: "Correlation & Regression", href: "#", status: "soon" },
    { id: "m10", num: "10", title: "Logistic Regression & Classification", href: "#", status: "soon" },
    { id: "m11", num: "11", title: "Time Series & Forecasting", href: "#", status: "soon" },
    { id: "m12", num: "12", title: "Survival Analysis & Churn", href: "#", status: "soon" },

    { part: "Part IV · Advanced" },
    { id: "m13", num: "13", title: "Causal Inference", href: "#", status: "soon" },
    { id: "m14", num: "14", title: "Monte Carlo & Simulation", href: "#", status: "soon" },
  ];

  function build() {
    const body = document.body;
    const current = body.dataset.module || "home";
    const base = body.dataset.base ? body.dataset.base + "/" : "";

    // ---- top bar ----
    const top = document.createElement("header");
    top.className = "site-top";
    top.innerHTML = `
      <a class="brand" href="${base}index.html">
        <span class="brand-mark">📊</span>
        <span class="brand-name">Stat<span class="brand-accent">Lab</span></span>
        <span class="brand-sub">Probability &amp; Statistics for iGaming Analysts</span>
      </a>
      <button class="nav-toggle" type="button" aria-label="Toggle menu">☰</button>`;

    // ---- sidebar ----
    const side = document.createElement("nav");
    side.className = "site-side";
    let html = "";
    for (const item of CURRICULUM) {
      if (item.part !== undefined && !item.id) {
        html += item.part ? `<div class="side-part">${item.part}</div>` : "";
        continue;
      }
      const active = item.id === current ? " active" : "";
      const soon = item.status === "soon";
      const href = soon ? "#" : base + item.href;
      const cls = "side-link" + active + (soon ? " soon" : "");
      const num = item.num ? `<span class="side-num">${item.num}</span>` : "";
      const tag = soon ? '<span class="side-tag">soon</span>' : "";
      html += `<a class="${cls}" href="${href}">${num}<span class="side-text">${item.title}</span>${tag}</a>`;
    }
    side.innerHTML = html;

    body.insertBefore(side, body.firstChild);
    body.insertBefore(top, body.firstChild);

    top.querySelector(".nav-toggle").addEventListener("click", () => {
      side.classList.toggle("open");
    });

    // ---- footer ----
    const main = document.querySelector("main");
    if (main) {
      const foot = document.createElement("footer");
      foot.className = "site-foot";
      foot.innerHTML = `
        <div>Built by <a href="https://github.com/NihaalShameem">Nihaal Shameem</a> ·
        an interactive prob &amp; stats lab · runs entirely in your browser
        (Pyodide + sql.js).</div>
        <div class="foot-data">Mock dataset is seeded &amp; deterministic —
        same rows every time.</div>`;
      main.appendChild(foot);
    }
  }

  // expose for the homepage roadmap renderer
  global.CURRICULUM = CURRICULUM;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})(window);
