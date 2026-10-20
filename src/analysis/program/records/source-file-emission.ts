import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "../../../target-model/records/class-factories.js";
import type { CsharpSourceFileEmissionRecords } from "../../../target-model/records/source-file-emission.js";
import type { CsharpModuleCallableEmission } from "../../../target-model/records/source-file-emission.js";

export function createCsharpSourceFileEmissionRecords(
  factories: ReadonlyMap<SourceFile, readonly CsharpClassFactory[]>,
  callables: ReadonlyMap<Node, CsharpModuleCallableEmission>,
): CsharpSourceFileEmissionRecords {
  return Object.freeze({ moduleCallable: Object.freeze({ get: (node: Node) => callables.get(node) }),
    moduleFactories: Object.freeze({ get: (file: SourceFile) => factories.get(file) }) });
}
