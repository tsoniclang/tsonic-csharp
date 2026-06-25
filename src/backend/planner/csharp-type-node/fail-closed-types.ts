import {
  KindAnyKeyword,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindObjectKeyword,
  KindUnknownKeyword,
} from "../source-ast.js";
import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function getCsharpTypeFromTargetConversion(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const convertedType = input.facts.getTargetConversionFact(node)?.convertedType;
  if (convertedType === undefined) {
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(convertedType);
  if (type !== undefined) {
    return type;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Target conversion facts require a renderable converted type before C# type emission."));
  return invalidCsharpType("target conversion type");
}

export function getCsharpTypeFromUnsupportedBroadTypeNode(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) === KindAnyKeyword || input.ast.kindName(node) === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidCsharpType("any or unknown type");
  }
  if (input.ast.kindName(node) === KindObjectKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; TypeScript object is a broad structural carrier and cannot be emitted without provider facts."));
    return invalidCsharpType("object keyword type");
  }
  return undefined;
}

export function getCsharpTypeFromUnsupportedBindingPattern(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) === KindObjectBindingPattern || input.ast.kindName(node) === KindArrayBindingPattern) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Binding patterns require target destructuring lowering before C# type emission."));
    return invalidCsharpType("binding pattern type");
  }
  return undefined;
}
