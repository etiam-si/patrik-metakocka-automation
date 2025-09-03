# 🚀 Patrik Metakocka Automation

Automation services for **Metakocka**, built to streamline warehouse operations and eliminate manual work.

---

## 📦 Warehouse Sync

[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/24buy.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

The **Warehouse Sync** service automatically transfers stock levels from **source warehouses** (e.g., *Time 4 Action* or *Germany Main*) to the **Creaglobe Metakocka warehouse**, ensuring that stock data is always accurate and up to date.

---

## ✨ Features

* 🔄 **One-way sync** (source → target warehouse)
* ⏰ **Scheduled execution** via cron (fully configurable)
* ▶️ **Manual "Run Now"** option (via API or web UI)
* 📂 **Sync results archived** as JSON files (local folder)
* ❤️ **BetterStack heartbeats**:

  * success → base URL
  * failure → base URL + `/fail`
* 🌐 **Web dashboard** for managing schedules and viewing logs

---

## ⚙️ How It Works

```mermaid
flowchart LR
    A[Source Warehouses (T4A, Germany)] -->|fetch stock| B[Sync Service]
    B -->|push stock| C[Creaglobe Metakocka Warehouse]
    B -->|success -> base URL| D[BetterStack Success]
    B -->|failure -> base URL/fail| D[BetterStack Failure]
    B -->|save logs| E[Local JSON Files + SQLite Logs]
```

1. Fetch stock lists from **T4A** and **Germany Main** warehouses.
2. Transform data into **Creaglobe-compatible** format.
3. Push stock updates into **Creaglobe Metakocka**.
4. On **success**:

   * ✅ Call BetterStack **base URL**.
   * ✅ Save JSON files (stock lists).
   * ✅ Insert log entry into SQLite (`warehouse_sync_log`).
5. On **failure**:

   * ❌ Call BetterStack **base URL + `/fail`**.
   * ❌ Log entry still stored in DB.

---

## 🌐 Web Dashboard

A simple **scheduler dashboard** (`index.html` served from `/public`) lets you:

* ✅ Select **minutes, hours, and days** → generates a valid cron expression
* 🔑 Enter API key to **update sync schedule**
* ▶️ Run sync immediately via **Run Now** button
* 📜 View the **last 10 runs** with timestamps + links to stock JSON files

📸 Screenshot:

![Scheduler UI](docs/webui.png)

---

## 🔑 API Endpoints

(unchanged — uptime, sync, logs, schedules)

---

## 📂 Logs & Storage

* **JSON stock logs** → saved in `./tmp` (or path from `PUBLIC_DATA_FILE_PATH`).

  * Format: `{TIMESTAMP}_{SOURCE}.json`
  * Example: `20250903_141523001_T4A.json`
* **SQLite DB** → located at `./db/patrik.db` (or `DB_FILE_PATH` if set).

  * Table: `warehouse_sync_log`
  * Tracks: `id`, `link`, `sync_name`, `created_at`.

---

## ⚡ Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/etiam-si/patrik-metakocka-automation
   cd patrik-metakocka-automation
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure `.env`**

   ```ini
   API_KEY=supersecretapikey

   # T4A warehouse (source)
   MK_SECRET_KEY_T4A=...
   MK_COMPANY_ID_T4A=...
   MK_T4A_WAREHOUSE_ID=...

   # Creaglobe warehouse (target)
   MK_SECRET_KEY_CREAGLOBE=...
   MK_COMPANY_ID_CREAGLOBE=...
   MK_CREAGLOBE_WAREHOUSE_ID_T4A=...
   MK_CREAGLOBE_WAREHOUSE_ID_GERMANY_ONE=...

   # BetterStack heartbeat (base URL only)
   BETTER_STACK_WH_SYNC_HEARTBEAT=https://uptime.betterstack.com/heartbeat/xxxxx
   # → Success = base URL
   # → Failure = base URL + /fail
   ```

4. **Run the service**

   ```bash
   node index.js
   ```

   The server starts at:
   👉 `http://localhost:3000`

---

## ⏱️ Cron Expression Cheat Sheet

| Expression    | Meaning                              |
| ------------- | ------------------------------------ |
| `* * * * *`   | Every minute                         |
| `*/5 * * * *` | Every 5 minutes                      |
| `0 * * * *`   | Every hour                           |
| `0 8 * * *`   | Every day at 08:00                   |
| `0 8 * * 1-5` | Every weekday at 08:00               |
| `0 0 1 * *`   | First day of every month at midnight |

👉 Use the **web dashboard** to generate valid expressions without remembering syntax.

---

## 📝 Notes

* ✅ **Success heartbeat** → base URL
* ❌ **Failure heartbeat** → base URL + `/fail`
* 📂 JSON logs + DB entries are **always created**
* 🌐 BetterStack gives **real-time visibility** into job status
* 🛠️ Project is under **active development**
