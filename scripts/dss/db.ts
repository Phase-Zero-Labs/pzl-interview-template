/**
 * PZL-DSS SQLite database module for job history.
 *
 * Uses Bun's built-in SQLite support for persistent job tracking
 * and log storage.
 *
 * Reliability features:
 * - Auto-recovery from corruption
 * - Graceful handling of locked databases
 * - Automatic backup before recreation
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, renameSync } from "fs";
import { dirname } from "path";

// Database path - relative to project root
const DB_DIR = ".pzl-dss";
const DB_PATH = `${DB_DIR}/history.db`;

// Maximum jobs to keep (auto-prune oldest)
const MAX_JOBS = 100;

let db: Database | null = null;

// Logging helper
function dbLog(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix = {
    info: "\x1b[36m[DB]\x1b[0m",
    warn: "\x1b[33m[DB WARN]\x1b[0m",
    error: "\x1b[31m[DB ERROR]\x1b[0m",
  }[level];
  console.log(`${timestamp} ${prefix} ${message}`);
}

// Types
export interface Job {
  id: string;
  node_id: string;
  status: "running" | "completed" | "failed";
  start_time: number;
  end_time: number | null;
  exit_code: number | null;
  error_message: string | null;
}

export interface LogLine {
  id: number;
  job_id: string;
  timestamp: number;
  stream: "stdout" | "stderr";
  line: string;
}

/**
 * Check database health and determine if it needs recovery.
 */
function checkDatabaseHealth(): { healthy: boolean; error?: string } {
  if (!existsSync(DB_PATH)) {
    return { healthy: true }; // Will be created fresh
  }

  try {
    const testDb = new Database(DB_PATH);
    // Quick integrity check
    const result = testDb.query("PRAGMA integrity_check").get() as { integrity_check: string };
    testDb.close();

    if (result?.integrity_check !== "ok") {
      return { healthy: false, error: `Integrity check failed: ${result?.integrity_check}` };
    }
    return { healthy: true };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    if (error.includes("locked") || error.includes("busy")) {
      return { healthy: false, error: `Database locked: ${error}` };
    }
    return { healthy: false, error: `Database error: ${error}` };
  }
}

/**
 * Backup corrupted database before recreation.
 */
function backupCorruptedDatabase(): void {
  if (!existsSync(DB_PATH)) return;

  const backupPath = `${DB_PATH}.corrupt.${Date.now()}`;
  try {
    renameSync(DB_PATH, backupPath);
    dbLog("warn", `Backed up corrupted database to ${backupPath}`);
  } catch (e) {
    dbLog("error", `Failed to backup corrupted database: ${e}`);
  }
}

/**
 * Create the database schema.
 */
function createSchema(database: Database): void {
  // Create tables
  database.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      exit_code INTEGER,
      error_message TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      stream TEXT NOT NULL,
      line TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    )
  `);

  // Create indexes
  database.run(`CREATE INDEX IF NOT EXISTS idx_jobs_node ON jobs(node_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_jobs_start_time ON jobs(start_time DESC)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_logs_job ON logs(job_id)`);
}

/**
 * Initialize the database with resilience.
 * Auto-recovers from corruption by backing up and recreating.
 */
export function initDatabase(): Database {
  if (db) return db;

  // Ensure directory exists
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  // Check database health
  const health = checkDatabaseHealth();

  if (!health.healthy) {
    dbLog("warn", `Database unhealthy: ${health.error}`);
    backupCorruptedDatabase();
  }

  try {
    db = new Database(DB_PATH);
    createSchema(db);
    dbLog("info", `Initialized database at ${DB_PATH}`);
    return db;
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    dbLog("error", `Failed to open database: ${error}`);

    // Last resort: backup and try fresh
    backupCorruptedDatabase();

    try {
      db = new Database(DB_PATH);
      createSchema(db);
      dbLog("info", `Created fresh database at ${DB_PATH}`);
      return db;
    } catch (e2: unknown) {
      const error2 = e2 instanceof Error ? e2.message : String(e2);
      dbLog("error", `Failed to create fresh database: ${error2}`);
      throw new Error(`Cannot initialize database: ${error2}`);
    }
  }
}

/**
 * Get the database instance.
 */
export function getDb(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Create a new job record.
 */
export function insertJob(job: {
  id: string;
  node_id: string;
  status: "running" | "completed" | "failed";
}): void {
  const database = getDb();
  database.run(
    `INSERT INTO jobs (id, node_id, status, start_time) VALUES (?, ?, ?, ?)`,
    [job.id, job.node_id, job.status, Date.now()]
  );

  // Prune old jobs after insert
  pruneOldJobs();
}

/**
 * Update job status and completion info.
 */
export function updateJob(
  jobId: string,
  updates: {
    status?: "running" | "completed" | "failed";
    exit_code?: number;
    error_message?: string;
  }
): void {
  const database = getDb();
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (updates.status) {
    setClauses.push("status = ?");
    values.push(updates.status);

    // Set end_time when job completes or fails
    if (updates.status === "completed" || updates.status === "failed") {
      setClauses.push("end_time = ?");
      values.push(Date.now());
    }
  }

  if (updates.exit_code !== undefined) {
    setClauses.push("exit_code = ?");
    values.push(updates.exit_code);
  }

  if (updates.error_message !== undefined) {
    setClauses.push("error_message = ?");
    values.push(updates.error_message);
  }

  if (setClauses.length > 0) {
    values.push(jobId);
    database.run(
      `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );
  }
}

/**
 * Insert a log line for a job.
 */
export function insertLog(log: {
  job_id: string;
  stream: "stdout" | "stderr";
  line: string;
}): number {
  const database = getDb();
  const result = database.run(
    `INSERT INTO logs (job_id, timestamp, stream, line) VALUES (?, ?, ?, ?)`,
    [log.job_id, Date.now(), log.stream, log.line]
  );
  return Number(result.lastInsertRowid);
}

/**
 * Get a job by ID.
 */
export function getJob(jobId: string): Job | null {
  const database = getDb();
  return database.query(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as Job | null;
}

/**
 * Get logs for a job, optionally after a certain log ID.
 */
export function getJobLogs(jobId: string, afterId?: number): LogLine[] {
  const database = getDb();
  if (afterId !== undefined) {
    return database
      .query(`SELECT * FROM logs WHERE job_id = ? AND id > ? ORDER BY id ASC`)
      .all(jobId, afterId) as LogLine[];
  }
  return database
    .query(`SELECT * FROM logs WHERE job_id = ? ORDER BY id ASC`)
    .all(jobId) as LogLine[];
}

/**
 * Get job history, optionally filtered by node.
 */
export function getHistory(options?: {
  node_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): { jobs: Job[]; total: number } {
  const database = getDb();
  const whereClauses: string[] = [];
  const values: (string | number)[] = [];

  if (options?.node_id) {
    whereClauses.push("node_id = ?");
    values.push(options.node_id);
  }

  if (options?.status) {
    whereClauses.push("status = ?");
    values.push(options.status);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Get total count
  const countResult = database
    .query(`SELECT COUNT(*) as count FROM jobs ${whereClause}`)
    .get(...values) as { count: number };

  // Get paginated results
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const jobs = database
    .query(
      `SELECT * FROM jobs ${whereClause} ORDER BY start_time DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as Job[];

  return { jobs, total: countResult.count };
}

/**
 * Get execution stats for a node.
 */
export function getNodeStats(nodeId: string): {
  total: number;
  completed: number;
  failed: number;
  avgDuration: number | null;
} {
  const database = getDb();

  const stats = database
    .query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN end_time IS NOT NULL THEN end_time - start_time ELSE NULL END) as avgDuration
      FROM jobs WHERE node_id = ?
    `
    )
    .get(nodeId) as {
    total: number;
    completed: number;
    failed: number;
    avgDuration: number | null;
  };

  return stats;
}

/**
 * Get history count per node (for showing badges).
 */
export function getHistoryCountByNode(): Record<string, number> {
  const database = getDb();
  const results = database
    .query(`SELECT node_id, COUNT(*) as count FROM jobs GROUP BY node_id`)
    .all() as { node_id: string; count: number }[];

  return results.reduce(
    (acc, row) => {
      acc[row.node_id] = row.count;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Prune old jobs to keep only the most recent MAX_JOBS.
 */
export function pruneOldJobs(keepCount: number = MAX_JOBS): void {
  const database = getDb();

  const countResult = database
    .query("SELECT COUNT(*) as count FROM jobs")
    .get() as { count: number };

  if (countResult.count > keepCount) {
    const toDelete = countResult.count - keepCount;

    // Delete logs first (foreign key)
    database.run(
      `
      DELETE FROM logs WHERE job_id IN (
        SELECT id FROM jobs ORDER BY start_time ASC LIMIT ?
      )
    `,
      [toDelete]
    );

    // Then delete jobs
    database.run(
      `
      DELETE FROM jobs WHERE id IN (
        SELECT id FROM jobs ORDER BY start_time ASC LIMIT ?
      )
    `,
      [toDelete]
    );

    console.log(`[db] Pruned ${toDelete} old jobs`);
  }
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
