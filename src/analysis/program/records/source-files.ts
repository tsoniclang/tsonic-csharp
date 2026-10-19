import type { CsharpSourceFileOutputIdentity, CsharpSourceFileRecords } from "../../../target-model/records/source-files.js";

export function createCsharpSourceFileRecords(identities: ReadonlyMap<string, CsharpSourceFileOutputIdentity>): CsharpSourceFileRecords {
  return Object.freeze({ sourceFile: Object.freeze({ get: (fileName: string) => identities.get(fileName) }) });
}
