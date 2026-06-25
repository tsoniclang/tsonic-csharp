import {
  KindTypeReference,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  csharpTargetTypeFromBinding,
} from "../../../source/csharp-source-semantics/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  getTargetTypeRefForNode,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function getCsharpTypeFromTargetBindingForReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
): CsharpTypeNode | undefined {
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding === undefined) {
    return undefined;
  }
  const typeArguments = getTargetTypeArgumentsForReference(node, sourceFile, input, diagnostics);
  if (typeArguments === undefined) {
    return invalidCsharpType("provider target type arguments");
  }
  const targetType = csharpTargetTypeFromBinding(targetBinding, typeArguments);
  if (targetType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires explicit C# render metadata before C# emission."));
    return invalidCsharpType("provider target binding");
  }
  const csharpType = csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires a renderable target identity before C# emission."));
  return invalidCsharpType("provider target binding");
}

function getTargetTypeArgumentsForReference(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
): readonly TargetTypeRef[] | undefined {
  if (input.ast.kindName(node) !== KindTypeReference) {
    return [];
  }
  const typeArguments = input.ast.typeArguments(node);
  const resolved = typeArguments.map((argument) => getTargetTypeRefForNode(input, argument, sourceFile));
  if (resolved.some((argument) => argument === undefined)) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned generic target type requires target type facts for every type argument."));
    return undefined;
  }
  return resolved as readonly TargetTypeRef[];
}
