/**
 * Reproduces the BYOK-concurrency-gate bug at the level of
 * DistributedLockService.
 *
 * What we expect (correct behavior):
 *   N concurrent callers race to acquire the SAME lock key.
 *   Exactly ONE acquires at a time. Holders never overlap in time.
 *
 * What we observe today:
 *   pg_try_advisory_lock is bound to the PostgreSQL session that ran it,
 *   but DistributedLockService runs every acquire/release via
 *   dataSource.query() — which borrows a connection from TypeORM's pool
 *   and returns it immediately, breaking the binding two ways:
 *
 *   1. Re-entrant FALSE acquire: when the pool reuses the same
 *      connection for a later acquire, pg_try_advisory_lock returns
 *      true (re-entrant per session) even though the prior caller still
 *      holds the slot.
 *   2. Wrong-connection release: when release() picks a different
 *      connection than acquire(), pg_advisory_unlock is a no-op and the
 *      lock leaks until the connection is recycled.
 *
 * This script measures both outcomes by recording the timestamps each
 * caller "held" the lock and printing the max overlap.
 *
 * Run:
 *   yarn ts-node scripts/reproduce-distributed-lock-bug.ts
 *
 * Env (defaults match docker-compose.dev.yml exposed ports):
 *   PG_HOST=localhost PG_PORT=5432 PG_USER=kodusdev PG_DB=kodus_db PG_PASSWORD=...
 *   POOL_MAX=10 CONCURRENCY=8 HOLD_MS=200 ITERATIONS=3
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';

import { DistributedLockService } from '../libs/core/workflow/infrastructure/distributed-lock.service';

type HoldRecord = {
    callerId: number;
    iteration: number;
    acquiredAt: number;
    releasedAt: number;
};

const env = (key: string, fallback: string) =>
    process.env[key] ?? fallback;

const PG_HOST = env('PG_HOST', 'localhost');
const PG_PORT = parseInt(env('PG_PORT', '5432'), 10);
const PG_USER = env('PG_USER', process.env.API_PG_DB_USERNAME ?? 'kodusdev');
const PG_DB = env('PG_DB', process.env.API_PG_DB_DATABASE ?? 'kodus_db');
const PG_PASSWORD = env(
    'PG_PASSWORD',
    process.env.API_PG_DB_PASSWORD ?? 'kodusdev',
);

const POOL_MAX = parseInt(env('POOL_MAX', '10'), 10);
const CONCURRENCY = parseInt(env('CONCURRENCY', '8'), 10);
const HOLD_MS = parseInt(env('HOLD_MS', '200'), 10);
const ITERATIONS = parseInt(env('ITERATIONS', '3'), 10);

const LOCK_KEY = `repro-test::${process.pid}::${Date.now()}`;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
    const dataSource = new DataSource({
        type: 'postgres',
        host: PG_HOST,
        port: PG_PORT,
        username: PG_USER,
        password: PG_PASSWORD,
        database: PG_DB,
        logging: false,
        synchronize: false,
        entities: [],
        extra: {
            max: POOL_MAX,
            min: 1,
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 60000,
            keepAlive: true,
        },
    });

    await dataSource.initialize();
    console.log(
        `Connected to ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB} ` +
            `(pool max=${POOL_MAX})`,
    );
    console.log(
        `Lock key: ${LOCK_KEY}, concurrency=${CONCURRENCY}, ` +
            `holdMs=${HOLD_MS}, iterations=${ITERATIONS}\n`,
    );

    const lockService = new DistributedLockService(dataSource);

    const holds: HoldRecord[] = [];
    let acquireAttempts = 0;
    let acquireSuccesses = 0;
    let releaseAttempts = 0;

    async function caller(callerId: number) {
        for (let iter = 0; iter < ITERATIONS; iter++) {
            acquireAttempts++;
            const lock = await lockService.acquire(LOCK_KEY);
            if (!lock) {
                continue;
            }
            acquireSuccesses++;
            const acquiredAt = Date.now();

            await sleep(HOLD_MS);

            const releasedAt = Date.now();
            holds.push({ callerId, iteration: iter, acquiredAt, releasedAt });
            releaseAttempts++;
            await lock.release();
        }
    }

    const start = Date.now();
    await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) => caller(i)),
    );
    const elapsed = Date.now() - start;

    // Audit advisory-lock state directly. With session-bound locks held
    // by pool connections, pg_locks may still show held entries for the
    // key after every caller has "released" — those are leaks.
    const lockId = (lockService as any).hashKey(LOCK_KEY) as [number, number];
    const lockRows = await dataSource.query(
        `SELECT pid, locktype, classid, objid, granted
           FROM pg_locks
          WHERE locktype = 'advisory'
            AND classid = $1
            AND objid = $2`,
        lockId,
    );

    await dataSource.destroy();

    // Sort by acquire time and walk the timeline counting concurrent holders.
    holds.sort((a, b) => a.acquiredAt - b.acquiredAt);
    const events: Array<{ t: number; delta: 1 | -1; holder: HoldRecord }> = [];
    for (const h of holds) {
        events.push({ t: h.acquiredAt, delta: 1, holder: h });
        events.push({ t: h.releasedAt, delta: -1, holder: h });
    }
    events.sort((a, b) =>
        a.t === b.t ? a.delta - b.delta : a.t - b.t,
    );

    let current = 0;
    let maxConcurrent = 0;
    const overlaps: Array<{ t: number; holders: HoldRecord[] }> = [];
    const active = new Set<HoldRecord>();
    for (const e of events) {
        if (e.delta === 1) {
            active.add(e.holder);
            current++;
            if (current > maxConcurrent) maxConcurrent = current;
            if (current > 1) {
                overlaps.push({
                    t: e.t,
                    holders: Array.from(active),
                });
            }
        } else {
            active.delete(e.holder);
            current--;
        }
    }

    console.log('=== RESULTS ===');
    console.log(`Elapsed:           ${elapsed} ms`);
    console.log(`Acquire attempts:  ${acquireAttempts}`);
    console.log(`Acquire successes: ${acquireSuccesses}`);
    console.log(`Release calls:     ${releaseAttempts}`);
    console.log(`Max concurrent holders observed: ${maxConcurrent}`);
    console.log(
        `Overlap windows (concurrent > 1): ${overlaps.length}`,
    );

    if (overlaps.length > 0) {
        console.log(
            '\nFirst few overlaps (caller#:iter, [acq..rel]):',
        );
        for (const o of overlaps.slice(0, 5)) {
            const sig = o.holders
                .map(
                    (h) =>
                        `${h.callerId}:${h.iteration}[${
                            h.acquiredAt - start
                        }..${h.releasedAt - start}]`,
                )
                .join(', ');
            console.log(`  t+${o.t - start}ms  ${sig}`);
        }
    }

    console.log(
        `\nLeaked advisory locks in pg_locks for this key: ${lockRows.length}`,
    );
    if (lockRows.length > 0) {
        console.log('  rows:', JSON.stringify(lockRows));
    }

    const reEntrant = maxConcurrent > 1;
    const leaked = lockRows.length > 0;

    console.log(
        '\nVERDICT: ' +
            (reEntrant || leaked
                ? `BUG REPRODUCED — ${[
                      reEntrant ? 'mutual exclusion violated' : null,
                      leaked ? 'advisory locks leaked' : null,
                  ]
                      .filter(Boolean)
                      .join(' AND ')}`
                : 'no violation observed (try increasing CONCURRENCY / lowering POOL_MAX / lowering HOLD_MS)'),
    );

    process.exit(reEntrant || leaked ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
