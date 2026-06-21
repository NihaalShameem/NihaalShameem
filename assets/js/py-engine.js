/* =============================================================================
 * py-engine.js  —  In-browser Python (Pyodide / WASM)
 * -----------------------------------------------------------------------------
 * Loads Pyodide + numpy, pandas, scipy, matplotlib, then injects the SAME mock
 * iGaming data (from window.IGAMING.data) as pandas DataFrames:
 *      players, deposits, bets, sessions
 *
 * Exposes:
 *      PyEngine.ready()                  -> Promise (resolves when set up)
 *      PyEngine.run(code)                -> {stdout, error, images[]}
 *
 * Pyodide is heavy (~10-15MB). It is loaded ONCE, lazily, the first time a
 * Python playground is actually run, and shared across the whole page.
 * =========================================================================== */

(function (global) {
  "use strict";

  const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";

  let pyPromise = null;

  // Python preamble: matplotlib in non-interactive mode + load DataFrames from
  // the JSON we hand over from JavaScript.
  const SETUP = `
import json, io, base64
import js
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("AGG")
import matplotlib.pyplot as plt

_raw = json.loads(js._IGAMING_JSON)
players  = pd.DataFrame(_raw["players"])
deposits = pd.DataFrame(_raw["deposits"])
bets     = pd.DataFrame(_raw["bets"])
sessions = pd.DataFrame(_raw["sessions"])

for _df, _cols in [
    (players,  ["signup_date", "last_active_date"]),
    (deposits, ["deposit_date"]),
    (bets,     ["bet_date"]),
    (sessions, ["session_date"]),
]:
    for _c in _cols:
        _df[_c] = pd.to_datetime(_df[_c])

pd.set_option("display.max_rows", 25)
pd.set_option("display.width", 120)
`;

  // Wrap + execute user code, capturing stdout and any matplotlib figures.
  const RUNNER = `
def _run_user_code(src):
    import sys, traceback
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    imgs = []
    err = None
    plt.close("all")
    try:
        exec(src, globals())
        for num in plt.get_fignums():
            fig = plt.figure(num)
            b = io.BytesIO()
            fig.savefig(b, format="png", dpi=110, bbox_inches="tight")
            imgs.append(base64.b64encode(b.getvalue()).decode("ascii"))
        plt.close("all")
    except Exception:
        err = traceback.format_exc()
    finally:
        sys.stdout = old
    return [buf.getvalue(), err, imgs]
`;

  function ready() {
    if (pyPromise) return pyPromise;
    pyPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PYODIDE_CDN + "pyodide.js";
      s.onload = async () => {
        try {
          const pyodide = await global.loadPyodide({ indexURL: PYODIDE_CDN });
          await pyodide.loadPackage(["numpy", "pandas", "scipy", "matplotlib"]);
          // Hand the data to Python as a JSON string on the js namespace.
          global._IGAMING_JSON = JSON.stringify(global.IGAMING.data);
          await pyodide.runPythonAsync(SETUP);
          await pyodide.runPythonAsync(RUNNER);
          resolve(pyodide);
        } catch (e) {
          reject(e);
        }
      };
      s.onerror = () => reject(new Error("Failed to load Pyodide from CDN."));
      document.head.appendChild(s);
    });
    return pyPromise;
  }

  async function run(code) {
    const pyodide = await ready();
    const fn = pyodide.globals.get("_run_user_code");
    const res = fn(code);
    const arr = res.toJs(); // [stdout, error, imgs]
    res.destroy();
    fn.destroy();
    return { stdout: arr[0], error: arr[1], images: arr[2] };
  }

  global.PyEngine = { ready, run };
})(window);
