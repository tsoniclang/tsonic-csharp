import {
  AsCallExpression,
  AsNewExpression,
  KindCallExpression,
  KindNewExpression,
} from "../source-ast.js";
import type {
  TargetTypeRef,
  Node,
  SourceFile,
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
  getCallableSemanticOwnership,
} from "../semantic-guards.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
} from "../runtime-carriers.js";
import {
  getCsharpTypeFromProjectSourceReference,
} from "../project-source-types.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "../../../source/csharp-source-semantics/source-owned-selected-signature.js";
import {
  csharpSourceReturnCarrierFactKey,
} from "../../../source/csharp-facts.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromResolvedSourceCallReturn(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindCallExpression) {
    return undefined;
  }
  const call = AsCallExpression(node)!;
  const selectedCall = input.facts.getSelectedTargetCall(node);
  const ownership = getCallableSemanticOwnership(call.Expression, sourceFile, input);
  if (!ownership.sourceOwned && !isCsharpSourceOwnedSelectedSignature(selectedCall)) {
    return undefined;
  }
  const sourceReturnCarrier = getSourceReturnCarrierFromSelectedDeclaration(call, sourceFile, input);
  if (sourceReturnCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(sourceReturnCarrier);
    if (csharpType === undefined) {
      diagnostics?.push(unsupportedNodeDiagnostic(node, "Resolved source-owned declaration return carrier requires a renderable C# type before emission."));
      return invalidCsharpType("source call return carrier");
    }
    return csharpType;
  }
  const carrierResolution = input.targetFacts.resolveCallReturnRuntimeCarrier(node, { sourceFile });
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (carrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(carrier);
    if (csharpType === undefined) {
      diagnostics?.push(unsupportedNodeDiagnostic(node, "Resolved source call return carrier requires a renderable C# type before emission."));
      return invalidCsharpType("source call return carrier");
    }
    return csharpType;
  }
  const detail = missingCarrierDiagnosticDetail(carrierResolution, "Source-owned call return carrier fact is missing.");
  diagnostics?.push(unsupportedNodeDiagnostic(
    node,
    carrierResolution.kind === "missing"
      ? `Source-owned call return emission requires a finalized return carrier fact: ${detail.reason}`
      : "Source-owned call return emission requires a finalized return carrier fact; backend must not infer C# return types from raw TSTS semantic types.",
    detail.evidence,
  ));
  return invalidCsharpType("source call return carrier");
}

function getSourceReturnCarrierFromSelectedDeclaration(
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  const reference = input.analysis.getProjectSourceReferenceForNode(call.Expression, { sourceFile });
  const declaration = reference?.declaration;
  const name = declaration === undefined ? undefined : input.ast.name(declaration);
  for (const subject of [declaration, name]) {
    if (subject === undefined) {
      continue;
    }
    const carrier = input.facts.getFact(subject, csharpSourceReturnCarrierFactKey)?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}

export function getCsharpTypeFromSourceNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindNewExpression) {
    return undefined;
  }
  const expression = AsNewExpression(node);
  const reference = expression === undefined
    ? undefined
    : input.analysis.getProjectSourceReferenceForNode(expression.Expression, { sourceFile });
  if (expression === undefined || reference === undefined || !input.ast.is.IsClassDeclaration(reference.declaration)) {
    return undefined;
  }
  const baseType = getCsharpTypeFromProjectSourceReference(reference, input, diagnostics);
  if (baseType === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => resolveCsharpType(argument, sourceFile, input, invalidCsharpType("source construction type argument"), diagnostics));
  return withCsharpTypeArguments(baseType, typeArguments);
}

function withCsharpTypeArguments(
  type: CsharpTypeNode,
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode {
  if (typeArguments.length === 0) {
    return type;
  }
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? { ...type, typeArguments }
    : type;
}

export function substituteCsharpTypeNode(
  type: CsharpTypeNode,
  substitutions: ReadonlyMap<string, CsharpTypeNode>,
): CsharpTypeNode {
  if (substitutions.size === 0) {
    return type;
  }
  switch (type.kind) {
    case "IdentifierName":
      return substitutions.get(type.name) ?? {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "QualifiedName":
      return {
        ...type,
        left: substituteCsharpTypeNode(type.left, substitutions),
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "AliasQualifiedName":
      return {
        ...type,
        name: substituteCsharpTypeNode(type.name, substitutions),
      };
    case "ArrayType":
      return { ...type, elementType: substituteCsharpTypeNode(type.elementType, substitutions) };
    case "TupleType":
      return { ...type, elements: type.elements.map((element) => substituteCsharpTypeNode(element, substitutions)) };
    case "PointerType":
      return { ...type, pointee: substituteCsharpTypeNode(type.pointee, substitutions) };
    case "FunctionPointerType":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => substituteCsharpTypeNode(parameter, substitutions)),
        returnType: substituteCsharpTypeNode(type.returnType, substitutions),
      };
    case "NullableType":
      return { ...type, inner: substituteCsharpTypeNode(type.inner, substitutions) };
    case "PredefinedType":
    case "InvalidType":
      return type;
  }
}
