import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../../source/csharp-source-semantics/target-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function getCsharpTypeFromKeywordTypeNode(node: Node, input: TargetCompileInput): CsharpTypeNode | undefined {
  switch (input.ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
    case "KindNumberKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
    case "KindStringKeyword":
      return csharpTypeFromTargetTypeRef(csharpStringTargetType());
    case "KindBigIntKeyword":
      return csharpTypeFromTargetTypeRef(csharpBigIntegerTargetType());
    case "KindVoidKeyword":
    case "KindNeverKeyword":
      return csharpTypeFromTargetTypeRef(csharpVoidTargetType());
    default:
      return undefined;
  }
}
