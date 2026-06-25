import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpArrayBoundaryFactKey,
  csharpArrayCarrierFactKey,
} from "../../../../csharp-facts.js";
import type {
  CsharpArrayCarrierFact,
} from "../../../../csharp-facts.js";
import {
  csharpListTargetType,
} from "../../../target-types.js";
import {
  boundaryFactForArrayParameter,
} from "./carrier-classification.js";
import type {
  ArrayParameterAnalysis,
  ArrayReturnAnalysis,
  LifecycleContext,
} from "./types.js";

export function recordArrayParameterFacts(
  parameter: ArrayParameterAnalysis,
  lifecycleContext: LifecycleContext,
  context: ExtensionObservationContext,
): void {
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
    message: `C# JS surface array carrier selected for exported TypeScript array parameter '${getParameterName(parameter.name)}' from observed checked array operations: ${Array.from(parameter.uses).sort().join(",") || "none"}.`,
  }];
  for (const subject of arrayFactSubjects(parameter)) {
    lifecycleContext.host.facts.set(subject, csharpArrayCarrierFactKey, carrier, evidence);
    lifecycleContext.host.facts.set(subject, csharpArrayBoundaryFactKey, boundary, evidence);
  }
  for (const subject of arrayRuntimeCarrierSubjects(parameter)) {
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, { carrier: boundary.coreCarrierType }, evidence);
  }
  void context;
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
  lifecycleContext.host.facts.set(returnType.typeNode, runtimeCarrierFactKey, { carrier: list }, evidence);
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

function getParameterName(name: Node): string {
  const text = (name as { readonly Text?: unknown }).Text;
  return typeof text === "string" ? text : "<array>";
}
