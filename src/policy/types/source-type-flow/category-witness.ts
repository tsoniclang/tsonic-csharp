import type { Node } from "@tsonic/tsts";
import type { SourceCategory } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome, CsharpSourceCategoryWitness } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { sourceRuntimeType } from "./representation-runtime.js";
import { represented } from "./representation-results.js";

const categoryNames: Readonly<Record<SourceCategory, string>> = Object.freeze({
  absence: "Absent", boolean: "Boolean", number: "Number", bigint: "BigInt", string: "String", symbol: "Symbol", object: "Object", function: "Function",
});

export function sourceCategoryWitnessType(host: Pick<CsharpRepresentationHost, "providers" | "acquireNativeDeclaration">,
  category: CsharpSourceCategoryWitness, site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
  return category.kind === "witness" ? represented(category.witnessType)
    : sourceRuntimeType(host, `Source${categoryNames[category.category]}Category`, [category.valueType], "struct", site);
}
