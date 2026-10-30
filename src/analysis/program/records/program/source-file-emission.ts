import type { SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "../../../../target-model/records/objects/class-factories.js";
import type { CsharpSourceFileEmissionRecords } from "../../../../target-model/records/program/source-file-emission.js";

export function createCsharpSourceFileEmissionRecords(
  factories: ReadonlyMap<SourceFile, readonly CsharpClassFactory[]>,
): CsharpSourceFileEmissionRecords {
  return Object.freeze({ moduleFactories: Object.freeze({ get: (file: SourceFile) => factories.get(file) }) });
}
