import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  Node,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  getCsharpObjectShapeFactForTargetType,
} from "./csharp-fact-queries.js";
import {
  csharpTypeFromObjectShapeFact,
} from "./object-shapes.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  CsharpRuntimeUnionTargetTypeRef,
} from "../../policy/types/index.js";

export function csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
  input: CsharpTranslationContext,
  type: TargetTypeRef,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  registerObjectShapeDeclarationsForTargetType(input, type, diagnostics, diagnosticSubject);
  return csharpTypeFromTargetTypeRef(type);
}

function registerObjectShapeDeclarationsForTargetType(
  input: CsharpTranslationContext,
  type: TargetTypeRef,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Node | undefined,
  visited: Set<TargetTypeRef> = new Set(),
): void {
  if (visited.has(type)) {
    return;
  }
  visited.add(type);

  const objectShape = getCsharpObjectShapeFactForTargetType(type, input);
  if (objectShape !== undefined) {
    csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, diagnosticSubject);
  }
  for (const unionObjectShape of (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes ?? []) {
    if (unionObjectShape !== undefined) {
      csharpTypeFromObjectShapeFact(input, unionObjectShape, diagnostics, diagnosticSubject);
    }
  }

  switch (type.kind) {
    case "source-global":
    case "target-named":
      for (const typeArgument of type.typeArguments ?? []) {
        registerObjectShapeDeclarationsForTargetType(input, typeArgument, diagnostics, diagnosticSubject, visited);
      }
      return;
    case "array":
      registerObjectShapeDeclarationsForTargetType(input, type.element, diagnostics, diagnosticSubject, visited);
      return;
    case "tuple":
      for (const element of type.elements) {
        registerObjectShapeDeclarationsForTargetType(input, element, diagnostics, diagnosticSubject, visited);
      }
      return;
    case "pointer":
      registerObjectShapeDeclarationsForTargetType(input, type.pointee, diagnostics, diagnosticSubject, visited);
      return;
    case "function-pointer":
      for (const parameter of type.args) {
        registerObjectShapeDeclarationsForTargetType(input, parameter, diagnostics, diagnosticSubject, visited);
      }
      registerObjectShapeDeclarationsForTargetType(input, type.result, diagnostics, diagnosticSubject, visited);
      return;
    case "associated-type":
      registerObjectShapeDeclarationsForTargetType(input, type.owner, diagnostics, diagnosticSubject, visited);
      return;
    case "source-primitive":
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return;
  }
}
