/* =============================================================================
 * playground.js  —  Interactive code widgets
 * -----------------------------------------------------------------------------
 * Turns markup like:
 *
 *   <div class="playground" data-engine="sql" data-title="Active players">
 *   SELECT value_tier, COUNT(*) FROM players GROUP BY value_tier;
 *   </div>
 *
 *   <div class="playground" data-engine="python">
 *   print(players.head())
 *   </div>
 *
 * ...into an editable, runnable code cell with output rendering.
 *  - SQL   -> SQLEngine (sql.js)   results render as an HTML table
 *  - Python-> PyEngine  (pyodide)  stdout + matplotlib images render below
 *
 * Uses CodeMirror 5 (from CDN) for syntax highlighting; degrades to a plain
 * <textarea> if CodeMirror fails to load.
 * =========================================================================== */

(function (global) {
  "use strict";

  const CM = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/";

  // --- tiny CDN asset loaders -----------------------------------------------
  function loadCss(href) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function loadCodeMirror() {
    if (global.CodeMirror) return;
    loadCss(CM + "codemirror.min.css");
    loadCss(CM + "theme/material-darker.min.css");
    try {
      await loadScript(CM + "codemirror.min.js");
      await Promise.all([
        loadScript(CM + "mode/python/python.min.js"),
        loadScript(CM + "mode/sql/sql.min.js"),
      ]);
    } catch (e) {
      console.warn("CodeMirror unavailable, falling back to textarea.", e);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  // --- render SQL result sets as tables --------------------------------------
  function renderSqlResult(out, results) {
    if (!results || results.length === 0) {
      out.innerHTML = '<div class="pg-ok">Query OK — no rows returned.</div>';
      return;
    }
    let html = "";
    for (const res of results) {
      html += '<div class="pg-table-wrap"><table class="pg-table"><thead><tr>';
      html += res.columns.map((c) => `<th>${esc(c)}</th>`).join("");
      html += "</tr></thead><tbody>";
      const rows = res.values.slice(0, 200);
      for (const r of rows) {
        html += "<tr>" + r.map((v) => `<td>${v === null ? "<em>NULL</em>" : esc(v)}</td>`).join("") + "</tr>";
      }
      html += "</tbody></table></div>";
      if (res.values.length > rows.length) {
        html += `<div class="pg-note">Showing first ${rows.length} of ${res.values.length} rows.</div>`;
      }
    }
    out.innerHTML = html;
  }

  function renderPyResult(out, res) {
    let html = "";
    if (res.stdout) html += `<pre class="pg-stdout">${esc(res.stdout)}</pre>`;
    for (const img of res.images || []) {
      html += `<img class="pg-plot" alt="plot" src="data:image/png;base64,${img}">`;
    }
    if (res.error) html += `<pre class="pg-error">${esc(res.error)}</pre>`;
    if (!html) html = '<div class="pg-ok">Ran successfully (no output).</div>';
    out.innerHTML = html;
  }

  // --- build a single playground ---------------------------------------------
  function build(el) {
    const engine = (el.dataset.engine || "python").toLowerCase();
    const title = el.dataset.title || (engine === "sql" ? "SQL" : "Python");
    const initial = el.textContent.replace(/^\n/, "").replace(/\s+$/, "");

    el.textContent = "";
    el.classList.add("pg", "pg-" + engine);

    el.innerHTML = `
      <div class="pg-head">
        <span class="pg-badge">${engine === "sql" ? "SQL" : "Python"}</span>
        <span class="pg-title">${esc(title)}</span>
        <span class="pg-actions">
          <button class="pg-run" type="button">▶ Run</button>
          <button class="pg-reset" type="button" title="Reset to original code">↺</button>
        </span>
      </div>
      <textarea class="pg-code"></textarea>
      <div class="pg-output pg-empty">Click <strong>Run</strong> to execute.</div>`;

    const ta = el.querySelector(".pg-code");
    ta.value = initial;
    const out = el.querySelector(".pg-output");
    const runBtn = el.querySelector(".pg-run");
    const resetBtn = el.querySelector(".pg-reset");

    let cm = null;
    if (global.CodeMirror) {
      cm = global.CodeMirror.fromTextArea(ta, {
        mode: engine === "sql" ? "text/x-sql" : "python",
        theme: "material-darker",
        lineNumbers: true,
        indentUnit: 4,
        viewportMargin: Infinity,
      });
    }
    const getCode = () => (cm ? cm.getValue() : ta.value);
    const setCode = (v) => (cm ? cm.setValue(v) : (ta.value = v));

    async function run() {
      const code = getCode();
      runBtn.disabled = true;
      out.classList.remove("pg-empty");
      out.innerHTML = `<div class="pg-loading">Running ${engine === "sql" ? "SQL" : "Python"}…${
        engine === "python" ? " (first Python run downloads Pyodide — give it a moment)" : ""
      }</div>`;
      try {
        if (engine === "sql") {
          renderSqlResult(out, await global.SQLEngine.run(code));
        } else {
          renderPyResult(out, await global.PyEngine.run(code));
        }
      } catch (e) {
        out.innerHTML = `<pre class="pg-error">${esc(e && e.message ? e.message : e)}</pre>`;
      } finally {
        runBtn.disabled = false;
      }
    }

    runBtn.addEventListener("click", run);
    resetBtn.addEventListener("click", () => {
      setCode(initial);
      out.className = "pg-output pg-empty";
      out.innerHTML = "Click <strong>Run</strong> to execute.";
    });
    // Ctrl/Cmd+Enter to run
    el.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });
  }

  async function init() {
    const nodes = Array.from(document.querySelectorAll(".playground"));
    if (nodes.length === 0) return;
    await loadCodeMirror();
    nodes.forEach(build);

    // Warm up the SQL engine quietly so the first SQL run is instant.
    if (global.SQLEngine) global.SQLEngine.ready().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
