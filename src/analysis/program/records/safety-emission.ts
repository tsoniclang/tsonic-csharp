import type { Node } from "@tsonic/tsts";
import type { CsharpSafetyEmissionRecords, CsharpUnsafeEmission, CsharpSafetyPlacement } from "../../../target-model/records/safety-emission.js";

export function createCsharpSafetyEmissionRecords(
  subjects: ReadonlyMap<Node, CsharpUnsafeEmission>,
  compilations: ReadonlyMap<Node | "object-shapes" | "source-unions", boolean>,
  declarations: ReadonlyMap<Node, ReadonlyMap<CsharpSafetyPlacement, readonly "unsafe"[]>>,
): CsharpSafetyEmissionRecords {
  return Object.freeze({ unsafeEmission: Object.freeze({ get: (subject: Node) => subjects.get(subject) }),
    unsafeCompilation: Object.freeze({ get: (subject: Node | "object-shapes" | "source-unions") => compilations.get(subject) }),
    declarationSafety: Object.freeze({ get: (subject: Node, placement: CsharpSafetyPlacement) => declarations.get(subject)?.get(placement) }) });
}
