import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  Node_Name,
} from "./source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  probeCarrierFromResolution,
} from "./runtime-carriers.js";
import {
  targetTypeRefsMatch,
} from "./target-types.js";
import {
  getCsharpRuntimeUnionArms,
  isCsharpRuntimeUnionTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export function planRuntimeUnionUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (!isCsharpRuntimeUnionTargetType(storageCarrier)) {
    return baseExpression;
  }
  const useSiteCarrier = getTargetTypeRefFromDirectFacts(input, node) ??
    probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(node, { sourceFile }));
  if (useSiteCarrier === undefined || isCsharpRuntimeUnionTargetType(useSiteCarrier)) {
    return baseExpression;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, useSiteCarrier);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union use-site projection requires the TSTS-narrowed use-site carrier to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  return runtimeUnionArmProjection(baseExpression, armIndex);
}

export function tryPlanRuntimeUnionTypeTest(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
  negated: boolean,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (!isCsharpRuntimeUnionTargetType(storageCarrier)) {
    return undefined;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, targetType);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union type-test emission requires the selected target comparison type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  const test = runtimeUnionArmTest(baseExpression, armIndex);
  return negated
    ? {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "ExclamationToken" },
        operand: test,
      }
    : test;
}

function getRuntimeUnionStorageCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  const nodeCarrier = probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrierForNode(node, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, node);
  if (isCsharpRuntimeUnionTargetType(nodeCarrier)) {
    return nodeCarrier;
  }
  for (const subject of storageCarrierSubjects(node, sourceFile, input)) {
    const carrier = probeCarrierFromResolution(input.targetFacts.resolveRuntimeCarrier(subject)) ??
      getTargetTypeRefFromDirectFacts(input, subject);
    if (isCsharpRuntimeUnionTargetType(carrier)) {
      return carrier;
    }
  }
  return undefined;
}

function storageCarrierSubjects(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly ExtensionFactSubject[] {
  const subjects: ExtensionFactSubject[] = [];
  const reference = input.analysis.getProjectSourceReferenceForNode(node, { sourceFile });
  pushSubject(subjects, reference?.declaration);
  pushSubject(subjects, reference?.declaration === undefined ? undefined : Node_Name(reference.declaration));
  for (const symbol of [
    input.analysis.getSymbolAtLocation(node, { sourceFile }),
    input.analysis.getResolvedSymbol(node, { sourceFile }),
  ]) {
    pushSubject(subjects, symbol);
    for (const declaration of input.analysis.getSymbolDeclarations(symbol)) {
      pushSubject(subjects, declaration);
      pushSubject(subjects, Node_Name(declaration));
    }
  }
  return subjects;
}

function pushSubject(subjects: ExtensionFactSubject[], subject: ExtensionFactSubject | undefined): void {
  if (subject !== undefined && !subjects.includes(subject)) {
    subjects.push(subject);
  }
}

function runtimeUnionArmIndex(
  unionCarrier: TargetTypeRef,
  targetType: TargetTypeRef,
): number | undefined {
  const armIndex = getCsharpRuntimeUnionArms(unionCarrier)?.findIndex((arm) => targetTypeRefsMatch(arm, targetType));
  return armIndex === undefined || armIndex < 0 ? undefined : armIndex;
}

function runtimeUnionArmProjection(
  baseExpression: CsharpExpression,
  armIndex: number,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: baseExpression,
      name: `As${armIndex + 1}`,
    },
    arguments: [],
  };
}

function runtimeUnionArmTest(
  baseExpression: CsharpExpression,
  armIndex: number,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: baseExpression,
      name: `Is${armIndex + 1}`,
    },
    arguments: [],
  };
}
