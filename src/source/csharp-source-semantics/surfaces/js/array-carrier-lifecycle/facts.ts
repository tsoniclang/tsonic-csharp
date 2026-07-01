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
} from "../../../../csharp-facts.js";
import type {
  CsharpArrayCarrierFact,
  CsharpArrayBoundaryFact,
} from "../../../../csharp-facts.js";
import {
  csharpListTargetType,
} from "../../../target-types.js";
import {
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
  for (const subject of arrayLocalFactSubjects(local)) {
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
  }
  for (const subject of arrayLocalRuntimeCarrierSubjects(local)) {
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, { carrier: boundary.coreCarrierType }, evidence);
  }
}

export function recordArrayReturnFacts(
  returnType: ArrayReturnAnalysis,
  lifecycleContext: LifecycleContext,
): void {
  const list = csharpListTargetType(returnType.elementType);
  const evidence = [{ message: "C# JS surface array return boundary selected List<T> for ordinary TypeScript Array<T> return value." }];
  lifecycleContext.host.facts.set(returnType.typeNode, csharpArrayBoundaryFactKey, {
    publicShape: "List<T>",
    publicType: list,
    coreCarrierLane: "native-dense-mutable",
    coreCarrierType: list,
    preservesMutationVisibility: true,
    requiresCopyIn: false,
    requiresCopyOut: false,
  }, evidence);
  lifecycleContext.host.facts.set(returnType.typeNode, csharpArrayCarrierFactKey, {
    sourceKind: "ts-array",
    lane: "native-dense-mutable",
    elementType: returnType.elementType,
    carrierType: list,
    mutationVisibility: "caller-visible",
    boundary: "exported-api",
  }, evidence);
  setRuntimeCarrierFactIfUnresolved(lifecycleContext, returnType.typeNode, { carrier: list }, evidence);
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

function arrayLocalFactSubjects(local: ArrayLocalAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    local.declaration,
    local.name,
    local.initializer,
    local.typeNode,
    local.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
}

function arrayLocalRuntimeCarrierSubjects(local: ArrayLocalAnalysis): readonly ExtensionFactSubject[] {
  const subjects: readonly (ExtensionFactSubject | undefined)[] = [
    local.declaration,
    local.name,
    local.initializer,
    local.typeNode,
    local.symbol,
  ];
  return subjects.filter((subject): subject is ExtensionFactSubject => subject !== undefined);
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
