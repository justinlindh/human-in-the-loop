// Worker for balance.test.js: one bot's runs over the given seeds, posted back to the test.
import { parentPort, workerData } from 'node:worker_threads';
import { runBot } from '../../src/sim/bots.js';

parentPort.postMessage(workerData.seeds.map((seed) => runBot(workerData.name, seed)));
