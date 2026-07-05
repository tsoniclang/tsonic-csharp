import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../../../diagnostics.js";
import {
  csharpArrayBoundaryFactKey,
  csharpArrayCarrierFactKey,
  csharpSourceReturnCarrierFactKey,
} from "../../../../csharp-facts.js";
import type {
  CsharpArrayCarrierFact,
  CsharpArrayBoundaryFact,
} from "../../../../csharp-facts.js";
import {
  csharpListTargetType,
  csharpReadOnlyListTargetType,
} from "../../../target-types.js";
import {
  setRuntimeCarrierFactIfLocallyAbsent,
  setRuntimeCarrierFactIfUnresolved,
} from "../../../runtime-carrier-lifecycle/fact-writes.js";
import {
  boundaryFactForArrayParameter,
} from "./carrier-classification.js";
import type {
  ArrayLocalAnalysis,
  ArrayParameterAnalysis,
  ArrayReturnAnalysis,
  CsharpArrayCarrierRequirement,
  LifecycleContext,
} from "./types.js";

export function recordArrayParameterFacts(
  parameter: ArrayParameterAnalysis,
  lifecycleContext: LifecycleContext,
  context: ExtensionObservationContext,
): void {
  if (appendUnresolvedArrayCarrierDiagnostic(parameter.name, parameter.carrierRequirements, lifecycleContext)) {
    return;
  }
  const boundary = boundaryFactForArrayParameter(parameter);
  const carrier: CsharpArrayCarrierFact = {
    sourceKind: "ts-array",
    lane: boundary.coreCarrierLane,
    elementType: parameter.elementType,
    carrierType: boundary.coreCarrierType,
    mutationVisibility: boundary.preservesMutationVisibility ? "caller-visible" : "none",
    boundary: "exported-api",
  };
  const evidence = [{
    message: `C# JS surface array carrier selected for exported TypeScript array parameter '${getParameterName(parameter.name)}' from generic structural source analysis requirements: ${Array.from(parameter.carrierRequirements).sort().join(",") || "none"}.`,
  }];
  for (const subject of arrayFactSubjects(parameter)) {
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
  }
  for (const subject of arrayRuntimeCarrierSubjects(parameter)) {
    setRuntimeCarrierFactIfUnresolved(lifecycleContext, subject, { carrier: boundary.coreCarrierType }, evidence);
  }
  void context;
}

export function recordArrayLocalFacts(
  local: ArrayLocalAnalysis,
  lifecycleContext: LifecycleContext,
): void {
  if (appendUnresolvedArrayCarrierDiagnostic(local.name, local.carrierRequirements, lifecycleContext)) {
    return;
  }
  const boundary = boundaryFactForLocalArray(local);
  const carrier: CsharpArrayCarrierFact = {
    sourceKind: "ts-array",
    lane: boundary.coreCarrierLane,
    elementType: local.elementType,
    carrierType: boundary.coreCarrierType,
    mutationVisibility: boundary.preservesMutationVisibility ? "internal" : "none",
    boundary: "local",
  };
  const evidence = [{
    message: `C# JS surface local array carrier selected from generic structural source analysis requirements: ${Array.from(local.carrierRequirements).sort().join(",") || "none"}.`,
  }];
  for (const subject of arrayLocalFactSubjects(local, lifecycleContext)) {
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
  }
  for (const subject of arrayLocalRuntimeCarrierSubjects(local, lifecycleContext)) {
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, { carrier: boundary.coreCarrierType }, evidence);
  }
}

export function recordArrayReturnFacts(
  returnType: ArrayReturnAnalysis,
  lifecycleContext: LifecycleContext,
): void {
  const carrierType = returnType.readonlySourceContract
    ? csharpReadOnlyListTargetType(returnType.elementType)
    : csharpListTargetType(returnType.elementType);
  const evidenceMessage = returnType.readonlySourceContract
    ? "C# JS surface array return boundary selected IReadOnlyList<T> for readonly TypeScript array return value."
    : "C# JS surface array return boundary selected List<T> for ordinary TypeScript Array<T> return value.";
  const evidence = [{ message: evidenceMessage }];
  const boundary: CsharpArrayBoundaryFact = {
    publicShape: returnType.readonlySourceContract ? "IReadOnlyList<T>" : "List<T>",
    publicType: carrierType,
    coreCarrierLane: returnType.readonlySourceContract ? "native-read-indexable" : "native-dense-mutable",
    coreCarrierType: carrierType,
    preservesMutationVisibility: !returnType.readonlySourceContract,
    requiresCopyIn: false,
    requiresCopyOut: false,
  };
  const carrier: CsharpArrayCarrierFact = {
    sourceKind: "ts-array",
    lane: returnType.readonlySourceContract ? "native-read-indexable" : "native-dense-mutable",
    elementType: returnType.elementType,
    carrierType,
    mutationVisibility: returnType.readonlySourceContract ? "none" : "caller-visible",
    boundary: "exported-api",
  };
  for (const subject of arrayReturnFactSubjects(returnType)) {
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    setRuntimeCarrierFactIfLocallyAbsent(lifecycleContext, subject, { carrier: carrierType }, evidenceMessage);
  }
  for (const subject of returnType.sourceReturnSubjects) {
    lifecycleContext.host.facts.set(subject, csharpSourceReturnCarrierFactKey, { carrier: carrierType }, evidence);
  }
  for (const subject of returnType.returnExpressions) {
    setRuntimeCarrierFactIfLocallyAbsent(lifecycleContext, subject, { carrier: carrierType }, evidenceMessage);
  }
}

function arrayFactSubjects(parameter: ArrayParameterAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    parameter.parameter,
    parameter.name,
    parameter.typeNode,
    parameter.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayRuntimeCarrierSubjects(parameter: ArrayParameterAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    parameter.name,
    parameter.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayLocalFactSubjects(local: ArrayLocalAnalysis, lifecycleContext: LifecycleContext): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    local.declaration,
    local.name,
    arrayLiteralInitializerSubject(local, lifecycleContext),
    local.typeNode,
    local.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayLocalRuntimeCarrierSubjects(local: ArrayLocalAnalysis, lifecycleContext: LifecycleContext): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    local.declaration,
    local.name,
    arrayLiteralInitializerSubject(local, lifecycleContext),
    local.typeNode,
    local.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayReturnFactSubjects(returnType: ArrayReturnAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    returnType.typeNode,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayLiteralInitializerSubject(
  local: ArrayLocalAnalysis,
  lifecycleContext: LifecycleContext,
): ExtensionFactSubject | undefined {
  const initializer = local.initializer;
  return initializer !== undefined && lifecycleContext.compiler?.ast.is.IsArrayLiteralExpression(initializer) === true
    ? initializer
    : undefined;
}

function boundaryFactForLocalArray(local: ArrayLocalAnalysis): CsharpArrayBoundaryFact {
  const parameterEquivalent: ArrayParameterAnalysis = {
    parameter: local.declaration,
    name: local.name,
    typeNode: local.typeNode ?? local.initializer ?? local.declaration,
    symbol: local.symbol,
    semanticType: local.semanticType,
    elementType: local.elementType,
    sourceUses: local.sourceUses,
    carrierRequirements: local.carrierRequirements,
  };
  return boundaryFactForArrayParameter(parameterEquivalent);
}

function appendUnresolvedArrayCarrierDiagnostic(
  node: Node,
  requirements: ReadonlySet<CsharpArrayCarrierRequirement>,
  lifecycleContext: LifecycleContext,
): boolean {
  if (!requirements.has("unresolved-structural-use")) {
    return false;
  }
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      "tsonic.csharp.operations",
      "CSHARP_JS_ARRAY_CARRIER_REQUIREMENT_NOT_PROVEN",
      9100175,
      "C# JS surface array carrier selection requires selected TSTS declaration identity and provider target member metadata for every structural property, call, and argument use; unresolved structural use prevents selecting a carrier lane.",
      [{ message: `Observed structural requirements: ${Array.from(requirements).sort().join(",")}.` }],
    ),
    nodeOrSpan: node,
    identity: `csharp-js-array-carrier-requirement-not-proven:${getParameterName(node)}`,
  });
  return true;
}

function getParameterName(name: Node): string {
  const text = (name as { readonly Text?: unknown }).Text;
  return typeof text === "string" ? text : "<array>";
}
