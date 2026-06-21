/* =============================================================================
 * sql-engine.js  —  In-browser SQLite (sql.js / WASM)
 * -----------------------------------------------------------------------------
 * Loads sql.js, builds an in-memory SQLite database from window.IGAMING.data,
 * and exposes:
 *      SQLEngine.ready()            -> Promise (resolves when DB is built)
 *      SQLEngine.run(query)         -> [{columns, values}, ...]
 * The DB is built ONCE and shared by every SQL playground on the page.
 * =========================================================================== */

(function (global) {
  "use strict";

  const SQLJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";

  let dbPromise = null;

  function buildDatabase(SQL) {
    const db = new SQL.Database();
    const { data, schema } = global.IGAMING;

    for (const table of Object.keys(schema)) {
      const cols = schema[table];
      const colNames = Object.keys(cols);

      // CREATE TABLE
      const colDefs = colNames.map((c) => `${c} ${cols[c]}`).join(", ");
      db.run(`CREATE TABLE ${table} (${colDefs});`);

      // Bulk INSERT inside a transaction (fast) using a prepared statement.
      const placeholders = colNames.map(() => "?").join(", ");
      const stmt = db.prepare(
        `INSERT INTO ${table} (${colNames.join(", ")}) VALUES (${placeholders});`
      );
      db.run("BEGIN TRANSACTION;");
      for (const row of data[table]) {
        stmt.run(colNames.map((c) => (row[c] === undefined ? null : row[c])));
      }
      db.run("COMMIT;");
      stmt.free();
    }
    return db;
  }

  function ready() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SQLJS_CDN + "sql-wasm.min.js";
      s.onload = () => {
        global
          .initSqlJs({ locateFile: (f) => SQLJS_CDN + f })
          .then((SQL) => resolve(buildDatabase(SQL)))
          .catch(reject);
      };
      s.onerror = () => reject(new Error("Failed to load sql.js from CDN."));
      document.head.appendChild(s);
    });
    return dbPromise;
  }

  async function run(query) {
    const db = await ready();
    return db.exec(query); // array of {columns, values}
  }

  global.SQLEngine = { ready, run };
})(window);
