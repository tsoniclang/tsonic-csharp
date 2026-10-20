import type { CsharpSourceFileOutputIdentity, CsharpSourceFileRecords } from "../../../target-model/records/source-files.js";
import type { SourceFile } from "@tsonic/tsts";

export function createCsharpSourceFileRecords(identities: ReadonlyMap<string, CsharpSourceFileOutputIdentity>,
  providers: ReadonlyMap<SourceFile, boolean>): CsharpSourceFileRecords {
  return Object.freeze({ providerSourceFile: Object.freeze({ get: (file: SourceFile) => providers.get(file) }),
    sourceFile: Object.freeze({ get: (fileName: string) => identities.get(fileName) }) });
}
