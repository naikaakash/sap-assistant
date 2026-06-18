import { getControlTowerSummary } from './src/services/data/csvDataService';

async function main() {
  console.log("Calling getControlTowerSummary()...");
  try {
    const summary = await getControlTowerSummary();
    console.log("SUCCESS! Metrics:", summary.metrics);
    console.log("Activity log sample:", summary.recentActivity.slice(0, 3));
  } catch (err) {
    console.error("RUNTIME ERROR:", err);
  }
}

main();
