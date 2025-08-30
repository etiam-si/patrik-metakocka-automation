// Load environment variables first
const dotenv = require("dotenv");

// Node.js built-in modules
const fs = require("fs").promises;
const path = require("path");

// Third-party modules
const axios = require("axios");
const cron = require("node-cron");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { isValidCron } = require("cron-validator");

// Local modules
const { loadCronExpression } = require("./cron");
const config = require("./config/config.json")

// Load .env: use ENV_FILE_PATH if set, otherwise fallback to local .env
const envFilePath = process.env.ENV_FILE_PATH || "./.env";
dotenv.config({ path: envFilePath });

const app = express();
const PORT = 3000;

// prevent API overload
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: "Too many requests from this IP, please try again later."
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,   // Disable old headers
});

// Apply rate limiting to all incoming requests
app.use(apiLimiter);

// Parse JSON payloads and make them available on req.body
app.use(express.json());

// Holds the warehouse sync cron job instance for later control
var WAREHOUSE_SYNC_CRON_JOB;

// Load initial cron expression (e.g., "*/5 * * * *" → every 5 minutes)
const initialCronExpression = loadCronExpression();

// Start or update the warehouse sync job with the loaded schedule
startOrUpdateWarehouseCron(initialCronExpression);

// API key from environment for route authentication
const API_KEY = process.env.API_KEY;

// Middleware to verify API key
function authenticate(req, res, next) {
    const apiKey = req.header("x-api-key");
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// GET endpoint to check server uptime / health
app.get("/api/v1/uptime", (req, res) => {
    // Respond with a simple success message
    res.json({ success: true });
});

// POST endpoint to trigger warehouse data sync
app.post("/api/v1/warehouse/sync", authenticate, async (req, res) => {
    try {
        // Perform the warehouse sync
        const result = await warehouseSync();

        // Return sync result as JSON
        res.json(result);
    } catch (err) {
        // Handle errors and respond with status 500
        res.status(500).json({ error: err.message || "Internal Server Error!" });
    }
});

// PUT endpoint to trigger update of warehouse sync cron schedule
app.put("/api/v1/schedules/warehouse-sync", authenticate, async (req, res) => {
    try {
        const { warehouseSync } = req.body;

        // Ensure cron expression is provided
        if (!warehouseSync) {
            return res.status(400).json({ error: "warehouseSync (cron expression) is required" });
        }

        // Validate the cron expression format
        if (!isValidCron(warehouseSync, { seconds: false })) {
            return res.status(400).json({ error: "Invalid cron expression" });
        }

        const cronFilePath = process.env.CRON_FILE_PATH || path.join(__dirname, "cron.json");
        let currentConfig = {};

        try {
            // Load existing cron configuration if it exists
            const fileContent = await fs.readFile(cronFilePath, "utf8");
            currentConfig = JSON.parse(fileContent);
        } catch (err) {
            if (err.code !== "ENOENT") throw err; // Ignore missing file, but throw other errors
        }

        // Update the config with the new cron expression
        currentConfig.warehouseSync = warehouseSync;

        // Apply the new schedule immediately
        startOrUpdateWarehouseCron(warehouseSync);

        // Persist the updated config
        await fs.writeFile(cronFilePath, JSON.stringify(currentConfig, null, 2), "utf8");

        res.json({
            message: "Warehouse cron expression updated successfully",
            warehouseSync
        });
    } catch (err) {
        console.error("Error updating cron.json:", err);
        res.status(500).json({ error: "Internal Server Error!" });
    }
});

// GET endpoint to fetch the current warehouse-sync cron expression (no auth)
app.get("/api/v1/schedules/warehouse-sync", async (req, res) => {
    try {
        // Determine cron.json file path (env override or default)
        const cronFilePath = process.env.CRON_FILE_PATH || path.join(__dirname, "cron.json");
        let currentConfig = {};

        try {
            // Read and parse existing cron configuration
            const fileContent = await fs.readFile(cronFilePath, "utf8");
            currentConfig = JSON.parse(fileContent);
        } catch (err) {
            if (err.code !== "ENOENT") throw err; // ignore missing file, throw other errors
        }

        // Return current cron expression, or fallback to default
        res.json({
            warehouseSync: currentConfig.warehouseSync || loadCronExpression()
        });
    } catch (err) {
        console.error("Error reading cron.json:", err);
        res.status(500).json({ error: "Internal Server Error!" });
    }
});

app.use(express.static("public"));

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


function getTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}


async function warehouseSync() {
    console.log(`Warehouse sync ${getTimestamp()}`);
    try {
        // Step 1: Get stock from MK SLO
        const warehouseStockResponse = await axios.post(
            `${config.metakocka.baseUrl}${config.metakocka.warehouseStockPath}`,
            {
                "secret_key": process.env.MK_SECRET_KEY_T4A,
                "company_id": process.env.MK_COMPANY_ID_T4A,
                "wh_id_list": process.env.MK_SLO_WH_ID_T4A
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        let sloWhStockArray = warehouseStockResponse.data.stock_list;
        let syncStockPreparedArray = sloWhStockArray.map(item => ({
            product_code: item.code,
            amount: item.amount,
            warehouse_id: process.env.MK_T4A_WAREHOUSE_ID
        }));

        // Step 2: Sync stock to CREAGLOBE
        const stockSyncResponse = await axios.post(
            `${config.metakocka.baseUrl}${config.metakocka.syncStockPath}`,
            {
                "secret_key": process.env.MK_SECRET_KEY_CREAGLOBE,
                "company_id": process.env.MK_COMPANY_ID_CREAGLOBE,
                "stock_list": syncStockPreparedArray
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        if (stockSyncResponse.data.opr_desc != "Sync successful") {
            throw new Error("Error warehouse sync!");
        }

        // Step 3 & 4: Fire-and-forget Google Drive operations
        // so that warehouse sync endpoint is faster &
        // GDrive is synced in background
        (async () => {
            try {
                const storeStockLogFileResponse = await axios.post(
                    config.googleDrive.macros.saveLogFile,
                    {
                        api_key: process.env.API_KEY,
                        items: syncStockPreparedArray
                    }
                );

                if (storeStockLogFileResponse.data.success) {
                    await axios.post(
                        config.googleDrive.macros.updateSyncList,
                        {
                            api_key: process.env.API_KEY,
                            stock_link: storeStockLogFileResponse.data.stock_log_link
                        }
                    );
                } else {
                    console.error("Drive log save failed");
                }
            } catch (err) {
                console.error("Background Google Drive sync failed:", err.message || err);
            }
        })(); // immediately invoked async function

        return stockSyncResponse.data;

    } catch (err) {
        console.error("Warehouse Sync failed:", err.message || err);
        throw err;
    }
}


function startOrUpdateWarehouseCron(cronExpression) {
    // Stop existing job if running
    if (WAREHOUSE_SYNC_CRON_JOB) {
        WAREHOUSE_SYNC_CRON_JOB.stop();
        console.log("Stopped existing warehouse sync cron job");
    }

    // Start new cron job
    WAREHOUSE_SYNC_CRON_JOB = cron.schedule(cronExpression, async () => {
        try {
            await warehouseSync();
        } catch (err) {
            console.error("Scheduled sync failed:", err.message || err);
        }
    });

    console.log("Warehouse sync cron job scheduled:", cronExpression);
}