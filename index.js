require('dotenv').config("/data/.env"); // Load .env variables
const express = require("express");
const rateLimit = require('express-rate-limit');
const axios = require('axios');

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

// Secured endpoint
app.get("/secure-data", authenticate, (req, res) => {
        res.json({ message: "This is secured data!" });
});

app.get("/api/v1/warehouse/sync", authenticate, async (req, res) => {
        try {
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
                )
                let sloWhStockArray = warehouseStockResponse.data.stock_list;
                let syncStockPreparedArray = sloWhStockArray.map(item => ({
                        product_code: item.code,
                        amount: item.amount,
                        warehouse_id: process.env.MK_T4A_WAREHOUSE_ID
                }))


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
                )
                if (stockSyncResponse.data.opr_desc != "Sync successful") {
                        res.status(500).json({err: "Error warehouse sync!"})
                        return
                }

                const storeStockLogFileResponse = await axios.post(
                        "https://script.google.com/macros/s/AKfycbxblzzA47ZyLtYbUMkLim9FFdi6_Dq7HEwDe4czE7BtcGHSwP9SwE7wwlgYWZHScjWJNA/exec",
                        {
                                "api_key": process.env.API_KEY,
                                "items": syncStockPreparedArray
                        }
                )

                if (storeStockLogFileResponse.data.success != true) {
                        res.status(500).json({err: "Error drive file!"})
                        return
                }

                const stockSyncUpdatesResponse = await axios.post(
                        "https://script.google.com/macros/s/AKfycbycfShj45jBiTJF1Uowj03Fbqf2yfdHSbG9ILu0eaFZdq3PGeqPlLqIetqrd-6hL2syew/exec",
                        {
                                "api_key": process.env.API_KEY,
                                "stock_link": storeStockLogFileResponse.data.stock_log_link
                        }
                )

                if (stockSyncUpdatesResponse.data.success != true) {
                        res.status(500).json({err: "Error drive updates!"})
                        return
                }

                res.json(stockSyncResponse.data)



        } catch (err) {
                res.status(500).json({ error: "Internal Server Error!" })
        }
})

// Start server
app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
});
