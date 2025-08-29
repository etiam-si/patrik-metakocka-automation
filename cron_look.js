const cron = require("node-cron");
let job;

function startJob(expression) {
  if (job) job.stop();  // ustavi prejšnji
  job = cron.schedule(expression, () => {
    console.log("Job se izvaja:", new Date());
  });
}

// Zaženi prvič
startJob("*/1 * * * * *"); // vsakih 5 sekund

// Spremeni cron expression po 20 sekundah
setTimeout(() => {
  startJob("*/5 * * * * *"); // zdaj vsakih 10 sekund
}, 2000);
