const { loadCronExpression } = require('./cron');
const express = require("express");
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const cron = require("node-cron");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs").promises;
const { isValidCron } = require("cron-validator");

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

app.use(apiLimiter)
app.use(express.json());

var WAREHOUSE_SYNC_CRON_JOB;

const initialCronExpression = loadCronExpression();
startOrUpdateWarehouseCron(initialCronExpression);

// Set your API key (in production, use env variables)
const API_KEY = process.env.API_KEY;

// Middleware to check API key
function authenticate(req, res, next) {
    const apiKey = req.header("x-api-key");
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

app.get("/api/v1/uptime", (req, res) => {
    res.json({
        success: true
    });
})

app.post("/api/v1/warehouse/sync", authenticate, async (req, res) => {
    try {
        const result = await warehouseSync();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || "Internal Server Error!" });
    }
});


// Update warehouse sync schedule
app.put("/api/v1/schedules/warehouse-sync", authenticate, async (req, res) => {
    try {
        const { warehouseSync } = req.body;

        if (!warehouseSync) {
            return res.status(400).json({ error: "warehouseSync (cron expression) is required" });
        }

        // Validate cron expression
        if (!isValidCron(warehouseSync, { seconds: false })) {
            return res.status(400).json({ error: "Invalid cron expression" });
        }

        // File path inside request handler
        const cronFilePath = process.env.CRON_FILE_PATH || path.join(__dirname, "cron.json");

        let currentConfig = {};
        try {
            const fileContent = await fs.readFile(cronFilePath, "utf8");
            currentConfig = JSON.parse(fileContent);
        } catch (err) {
            if (err.code !== "ENOENT") {
                throw err; // only ignore file not found
            }
        }

        // Update with new cron expression
        currentConfig.warehouseSync = warehouseSync;

        // Update the running cron job immediately
        startOrUpdateWarehouseCron(warehouseSync);

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

// Get current warehouse-sync cron expression (unauthenticated)
app.get("/api/v1/schedules/warehouse-sync", async (req, res) => {
    try {
        // File path for cron.json
        const cronFilePath = process.env.CRON_FILE_PATH || path.join(__dirname, "cron.json");

        let currentConfig = {};
        try {
            const fileContent = await fs.readFile(cronFilePath, "utf8");
            currentConfig = JSON.parse(fileContent);
        } catch (err) {
            if (err.code !== "ENOENT") {
                throw err; // rethrow unexpected errors
            }
        }

        // Return current warehouseSync cron or a default/fallback
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
            "https://main.metakocka.si/rest/eshop/v1/json/warehouse_stock",
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
            "https://main.metakocka.si/rest/eshop/sync_stock",
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

        // Step 3: Save to Google Drive (log file)
        const storeStockLogFileResponse = await axios.post(
            "https://script.google.com/macros/s/AKfycbxblzzA47ZyLtYbUMkLim9FFdi6_Dq7HEwDe4czE7BtcGHSwP9SwE7wwlgYWZHScjWJNA/exec",
            {
                "api_key": process.env.API_KEY,
                "items": syncStockPreparedArray
            }
        );

        if (storeStockLogFileResponse.data.success != true) {
            throw new Error("Error drive file!");
        }

        // Step 4: Update stock log link
        const stockSyncUpdatesResponse = await axios.post(
            "https://script.google.com/macros/s/AKfycbycfShj45jBiTJF1Uowj03Fbqf2yfdHSbG9ILu0eaFZdq3PGeqPlLqIetqrd-6hL2syew/exec",
            {
                "api_key": process.env.API_KEY,
                "stock_link": storeStockLogFileResponse.data.stock_log_link
            }
        );

        if (stockSyncUpdatesResponse.data.success != true) {
            throw new Error("Error drive updates!");
        }

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