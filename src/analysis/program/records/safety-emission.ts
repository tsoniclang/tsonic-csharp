import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpSafetyEmissionRecords, CsharpUnsafeEmission, CsharpSafetyPlacement } from "../../../target-model/records/safety-emission.js";

export function createCsharpSafetyEmissionRecords(
  subjects: ReadonlyMap<Node, CsharpUnsafeEmission>,
  compilations: ReadonlyMap<Node | "object-shapes" | "source-unions", boolean>,
  declarations: ReadonlyMap<Node, ReadonlyMap<CsharpSafetyPlacement, readonly "unsafe"[]>>,
  shapes: ReadonlyMap<CsharpObjectShapeFact, boolean>,
): CsharpSafetyEmissionRecords {
  return Object.freeze({ unsafeShape: Object.freeze({ get: (subject: CsharpObjectShapeFact) => shapes.get(subject) }),
    unsafeEmission: Object.freeze({ get: (subject: Node) => subjects.get(subject) }),
    unsafeCompilation: Object.freeze({ get: (subject: Node | "object-shapes" | "source-unions") => compilations.get(subject) }),
    declarationSafety: Object.freeze({ get: (subject: Node, placement: CsharpSafetyPlacement) => declarations.get(subject)?.get(placement) }) });
}
