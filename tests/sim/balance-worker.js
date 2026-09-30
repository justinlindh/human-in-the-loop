// Worker for the balance tests: one bot's runs over the given seeds (and founding, if any), posted back to the test.
import { parentPort, workerData } from 'node:worker_threads';
import { runBot } from '../../src/sim/bots.js';

const summary = (r) => (workerData.summary ? { exited: r.exited, reason: r.reason, weeks: r.weeks, score: r.score } : r);
parentPort.postMessage(workerData.seeds.map((seed) => summary(runBot(workerData.name, seed, undefined, { founding: workerData.founding ?? {} }))));
