import type { CsharpCompilationEmission, CsharpCompilationRecords } from "../../../target-model/records/compilation.js";

export function createCsharpCompilationRecords(value: CsharpCompilationEmission): CsharpCompilationRecords {
  const selected = Object.freeze(value);
  return Object.freeze({ compilation: Object.freeze({ get: () => selected }) });
}
