import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../types/model.js";

export interface CsharpNativeConstructionIssue {
  readonly node: Node;
  readonly code: "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" | "TSONIC_UNTYPED_OBJECT_LITERAL" | "TSONIC_ANY_UNSUPPORTED" | "TSONIC_COMPILER_RESOURCE_LIMIT";
  readonly message: string;
}

export interface CsharpNativeConstructionDemandQueries {
  readonly issues: readonly CsharpNativeConstructionIssue[];
  constructionFor(node: Node): CsharpNativeConstructionSelection | undefined;
}

export interface CsharpNativeConstructionSelection {
  readonly targetType: TargetTypeRef;
  readonly shape: CsharpObjectShapeFact;
}
