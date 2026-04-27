import {
  collectCertifiedAppleEventLog,
  formatCertifiedAppleEventLog
} from '../dist/src/core/certified-apple-event-log.js';
import { createRectangularSavedMap } from '../dist/src/core/rectangular-cycle.js';
import { createDefaultMaps } from '../dist/src/data/default-maps.js';

const reports = [
  createRectangularSavedMap({ id: 'debug-4x4', name: 'Debug 4x4', width: 4, height: 4 }),
  createRectangularSavedMap({ id: 'debug-6x6', name: 'Debug 6x6', width: 6, height: 6 }),
  createDefaultMaps()[0]
].filter(Boolean).map((map) => collectCertifiedAppleEventLog(map));

console.log(reports.map((report) => formatCertifiedAppleEventLog(report)).join('\n\n'));
