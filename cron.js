const fs = require("fs");
const dotenv = require("dotenv");

// Load .env: use ENV_FILE_PATH if set, otherwise fallback to local .env
const envFilePath = process.env.ENV_FILE_PATH || "./.env";
dotenv.config({ path: envFilePath });

// Load cron expressions from JSON
function loadCronExpression(jobName = "warehouseSync") {
  const filePath = process.env.CRON_FILE_PATH || "./cron.json";

  // Default cron expression: minute 0 every hour
  const defaultCron = "0 * * * *";

  let cronJobs = {};

  // If file does not exist, create it with default cron
  if (!fs.existsSync(filePath)) {
    cronJobs[jobName] = defaultCron;
    fs.writeFileSync(filePath, JSON.stringify(cronJobs, null, 2), "utf-8");
    console.log(`Created file ${filePath} with default cron for ${jobName}`);
    return defaultCron;
  }

  // File exists: read cron jobs
  const data = fs.readFileSync(filePath, "utf-8");
  cronJobs = JSON.parse(data);

  // Return the cron for the requested job (undefined if missing)
  return cronJobs[jobName];
}

module.exports = { loadCronExpression };
