import type { CsharpStartupEmission, CsharpStartupRecords } from "../../../target-model/records/startup.js";

export function createCsharpStartupRecords(value: CsharpStartupEmission): CsharpStartupRecords {
  const sealed = Object.freeze(value);
  return Object.freeze({ startup: Object.freeze({ get: () => sealed }) });
}
