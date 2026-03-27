import "dotenv/config";
import { initSentry } from "./lib/sentry.js";
import { createApp } from "./app.js";
import { connectRedisClient, closeRedisClient } from "./lib/redis.js";
import { closePool, pool, startPoolMonitoring } from "./lib/db.js";
import { validateEnvironmentVariables } from "./lib/env-validation.js";
import { logger } from "./lib/logger.js";

initSentry();
validateEnvironmentVariables();

const port = process.env.PORT || 4000;

async function startServer() {
  const redisClient = await connectRedisClient();

  const { app, io } = await createApp({ redisClient });

  // Probe DB
  try {
    await pool.query("SELECT 1");
    logger.info("pg pool connected");
  } catch (err) {
    logger.warn({ err }, "pg pool probe failed");
  }

  // Start pool monitoring if enabled
  let stopPoolMonitoring;
  if (process.env.POOL_MONITORING_ENABLED === "true") {
    const monitoringIntervalMs = parseInt(process.env.POOL_MONITORING_INTERVAL_MS || "60000", 10);
    stopPoolMonitoring = startPoolMonitoring(monitoringIntervalMs);
    logger.info({ intervalMs: monitoringIntervalMs }, "pool monitoring started");
  }

  const server = app.listen(port, () => {
    logger.info({ port }, `API listening on http://localhost:${port}`);
  });

  // Attach socket.io to the HTTP server
  io.attach(server);

  function shutdown(signal) {
    logger.info({ signal }, "shutdown signal received");
    if (stopPoolMonitoring) stopPoolMonitoring();
    server.close(async () => {
      await closePool();
      await closeRedisClient();
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer();
