import type { CsharpStartupEmission, CsharpStartupRecords } from "../../../../target-model/records/program/startup.js";

export function createCsharpStartupRecords(value: CsharpStartupEmission): CsharpStartupRecords {
  const sealed = Object.freeze(value);
  return Object.freeze({ startup: Object.freeze({ get: () => sealed }) });
}
