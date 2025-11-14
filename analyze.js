const fs = require("fs");
const path = require("path");

// Path to your JSON file
const filePath = path.join(__dirname, "db", "products", "t4a_product_list.json");

// Read and parse JSON
const data = JSON.parse(fs.readFileSync(filePath, "utf-8")).product_list;

// Make sure it's an array
if (!Array.isArray(data)) {
    console.error("JSON is not an array!");
    process.exit(1);
}

// Get all unique top-level keys
const allKeys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));

console.log(allKeys);
