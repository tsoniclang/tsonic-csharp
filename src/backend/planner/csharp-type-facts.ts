import {
  KindUnionType,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";

export function getCsharpTypeFromSelectedTargetCall(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  const returnType = operation?.kind === "member"
    ? operation.selectedMember?.returnType ?? operation.resultType
    : operation?.resultType;
  if (returnType === undefined) {
    return undefined;
  }
  const csharpType = csharpTypeFromTargetTypeRef(returnType);
  if (csharpType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Selected target call requires a renderable return type before C# type emission."));
    return invalidCsharpType("selected target call return type");
  }
  return csharpType;
}

export function getCsharpTypeFromSourceCoreTypeMarkerFact(
  node: Node,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const pointer = input.facts.getPointerFact(node);
  if (pointer !== undefined) {
    const type = getCsharpTypeFromDirectSourceCoreTypeFact(node, input);
    if (type !== undefined) {
      return type;
    }
    diagnostics?.push({
      ...unsupportedNodeDiagnostic(node, "Pointer type marker requires a finalized pointee target type before C# type emission."),
      evidence: [`pointeeSubject=${sourceFactSubjectEvidence(pointer.pointee)}`],
    });
    return invalidCsharpType("pointer marker pointee type");
  }
  const functionPointer = input.facts.getFunctionPointerFact(node);
  if (functionPointer !== undefined) {
    const type = getCsharpTypeFromDirectSourceCoreTypeFact(node, input);
    if (type !== undefined) {
      return type;
    }
    diagnostics?.push({
      ...unsupportedNodeDiagnostic(node, "Function pointer type marker requires finalized parameter and result target types before C# type emission."),
      evidence: [
        `parameterSubjects=${functionPointer.parameters.map(sourceFactSubjectEvidence).join(",")}`,
        `resultSubject=${sourceFactSubjectEvidence(functionPointer.result)}`,
      ],
    });
    return invalidCsharpType("function pointer marker type");
  }
  return undefined;
}

function getCsharpTypeFromDirectSourceCoreTypeFact(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const targetType = getTargetTypeRefFromDirectFacts(input, node);
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

function sourceFactSubjectEvidence(subject: unknown): string {
  const node = asNodeSubject(subject);
  if (node !== undefined) {
    return `node:${String(node.Kind)}`;
  }
  if (subject !== null && typeof subject === "object" && "kind" in subject) {
    return `fact:${String((subject as { readonly kind?: unknown }).kind)}`;
  }
  return typeof subject;
}

export function getCsharpTypeForUnionTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  if (contextualTargetType !== undefined) {
    const contextual = csharpTypeFromTargetTypeRef(contextualTargetType);
    if (contextual !== undefined) {
      return contextual;
    }
  }
  const runtimeCarrier = input.facts.getRuntimeCarrierFact(node)?.carrier;
  if (runtimeCarrier !== undefined) {
    const carrier = csharpTypeFromTargetTypeRef(runtimeCarrier);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  const semanticRuntimeCarrier = getTargetTypeRefForNode(input, node, sourceFile);
  if (semanticRuntimeCarrier !== undefined) {
    const carrier = csharpTypeFromTargetTypeRef(semanticRuntimeCarrier);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Union type annotations require finalized TSTS/provider storage facts before C# emission."));
  return invalidCsharpType("union type");
}

export function getCsharpTypeFromRuntimeCarrier(subject: Node, input: TargetCompileInput): CsharpTypeNode | undefined {
  const sourceFile = input.ast.getSourceFile(subject);
  if (sourceFile === undefined) {
    return undefined;
  }
  const carrier = getTargetTypeRefForNode(input, subject, sourceFile);
  return carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
}

export function getCsharpTypeFromSourcePrimitiveTypeReference(
  subject: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  if (input.ast.kindName(subject) !== "KindTypeReference") {
    return undefined;
  }
  const typeName = asNodeSubject(Object.getOwnPropertyDescriptor(subject, "TypeName")?.value);
  const sourcePrimitive = [
    getSourcePrimitiveTypeRef(typeName, input),
    getSourcePrimitiveTypeRef(
      typeName === undefined ? undefined : input.semantics.getSymbolAtLocation(typeName, { sourceFile }),
      input,
    ),
    getSourcePrimitiveTypeRef(
      typeName === undefined ? undefined : input.semantics.getResolvedSymbol(typeName, { sourceFile }),
      input,
    ),
    getSourcePrimitiveTypeRef(subject, input),
  ].find((type) => type !== undefined);
  return sourcePrimitive === undefined ? undefined : csharpTypeFromTargetTypeRef(sourcePrimitive);
}

export function isUnionTypeNode(input: TargetCompileInput, node: Node): boolean {
  return input.ast.kindName(node) === KindUnionType;
}

function getSourcePrimitiveTypeRef(
  subject: Parameters<typeof getTargetTypeRefFromDirectFacts>[1],
  input: TargetCompileInput,
): ReturnType<typeof getTargetTypeRefFromDirectFacts> {
  const type = getTargetTypeRefFromDirectFacts(input, subject, { includeRuntimeCarrier: false });
  return type?.kind === "source-primitive" ? type : undefined;
}
