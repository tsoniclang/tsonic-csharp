import type { ExtensionFactSubject, Node, SourceFile, SourcePrimitiveKind, Type } from "@tsonic/tsts";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import { selectTsonicMemoryFieldBindingFacts, selectTsonicMemoryRecordBindingFacts,
  tsonicMemoryFieldBindingFactKey, tsonicMemoryRecordBindingFactKey } from "@tsonic/source-core/facts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType,
  isCsharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, isCsharpNullableReferenceTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpJsStringTargetType, csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpFixedArrayRepresentationRejection } from "../../../../policy/types/collections/fixed-arrays.js";
import { csharpRawAddressResultType } from "../../../../policy/operations/pointers/raw-addresses.js";
import { selectCsharpLayoutObservation } from "../../../../policy/operations/pointers/layout-observations.js";
import { readCsharpRawLocation } from "../../../../source/extension/native-memory.js";
import { readCsharpSourceDefaultValue, readCsharpSourceField, readCsharpSourceFixedArrayType,
  readCsharpSourceFunctionPointerType, readCsharpSourceJsStringMarker, readCsharpSourcePointerType,
  isCsharpSourceRawPointer } from "../../../../source/extension/markers.js";
import { readCsharpSourceKeepAlive } from "../../../../source/extension/reachability.js";
import { readCsharpSourceRawAddress } from "../../../../source/extension/raw-addresses.js";
import { readCsharpSourceUnsafeContext } from "../../../../source/extension/explicit-safety.js";
import { readCsharpSourceNativePointerOperation } from "../../../../source/extension/native-pointers.js";
import { readCsharpSourceTypedLocationOperation, type CsharpSourceTypedLocationOperation } from "../../../../source/extension/typed-locations.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { nextState } from "./state.js";

export type CsharpDirectSourceRequest = {
  readonly sourceFile: SourceFile;
} & (
  | { readonly kind: "node"; readonly node: Node | undefined }
  | { readonly kind: "type"; readonly type: Type | undefined }
  | { readonly kind: "selected"; readonly node: Node; readonly selectedType: Type }
  | { readonly kind: "typed-location-pointee"; readonly operation: CsharpSourceTypedLocationOperation }
);

export type CsharpDirectSourceDependency = CsharpDirectSourceRequest & {
  readonly source: CsharpDirectSourceRequest;
  readonly state: CsharpTypeResolutionState;
};

type CsharpDirectSourceCandidate<Dependency = CsharpDirectSourceDependency> =
  | { readonly kind: "unavailable" | "layout-query" | "keep-alive" | "js-string" }
  | { readonly kind: "raw-pointer"; readonly nullable: boolean }
  | { readonly kind: "primitive"; readonly primitive: SourcePrimitiveKind }
  | { readonly kind: "raw-address"; readonly operation: NonNullable<ReturnType<typeof readCsharpSourceRawAddress>> }
  | { readonly kind: "dependency"; readonly dependency: Dependency;
      readonly representation: "type" | "location" | "nullable-location" | "nullable-array-location";
      readonly stopOnMissing: boolean }
  | { readonly kind: "fixed-array"; readonly source: NonNullable<ReturnType<typeof readCsharpSourceFixedArrayType>>;
      readonly dependency: Dependency }
  | { readonly kind: "typed-location"; readonly operation: CsharpSourceTypedLocationOperation;
      readonly pointee: Dependency; readonly sourceLocation: Dependency | undefined }
  | { readonly kind: "native-pointer"; readonly dependency: Dependency;
      readonly operation: NonNullable<ReturnType<typeof readCsharpSourceNativePointerOperation>>["operation"] }
  | { readonly kind: "function-pointer"; readonly parameters: readonly Dependency[];
      readonly result: Dependency;
      readonly abi: NonNullable<ReturnType<typeof readCsharpSourceFunctionPointerType>>["abi"] };

export interface CsharpDirectSourceCapture {
  readonly subjects: readonly ExtensionFactSubject[];
  readonly sourceFile: SourceFile;
  readonly candidates: readonly CsharpDirectSourceCandidate<CsharpDirectSourceRequest>[];
}

export interface CsharpDirectSourceEvidence {
  readonly capture: CsharpDirectSourceCapture;
  readonly subjects: readonly ExtensionFactSubject[];
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
  readonly candidates: readonly CsharpDirectSourceCandidate[];
}

export interface CsharpCompletedDirectSourceDependency {
  readonly dependency: CsharpDirectSourceDependency;
  readonly type: TargetTypeRef | undefined;
}

export function formCsharpDirectSourceEvidence(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  subjects: readonly ExtensionFactSubject[],
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): CsharpDirectSourceEvidence {
  return bindCsharpDirectSourceCapture(formCsharpDirectSourceCapture(scope, subjects, sourceFile), state);
}

export function formCsharpDirectSourceCapture(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  subjects: readonly ExtensionFactSubject[],
  sourceFile: SourceFile,
): CsharpDirectSourceCapture {
  const candidates: CsharpDirectSourceCandidate<CsharpDirectSourceRequest>[] = [];
  const complete = (): CsharpDirectSourceCapture => Object.freeze({ subjects, sourceFile,
    candidates: Object.freeze(candidates) });
  const terminal = (candidate: CsharpDirectSourceCandidate<CsharpDirectSourceRequest>): CsharpDirectSourceCapture => {
    candidates.push(Object.freeze(candidate));
    return complete();
  };
  const nodeDependency = (node: Node | undefined): CsharpDirectSourceRequest => Object.freeze({
    kind: "node", node, sourceFile,
  });
  const selectedType = (node: Node | undefined, type: Type | undefined, file = sourceFile): CsharpDirectSourceRequest =>
    node === undefined ? Object.freeze({ kind: "type", type, sourceFile: file })
      : Object.freeze({ kind: "node", node, sourceFile: host.ast.getSourceFile(node) ?? file });
  const dependency = (child: CsharpDirectSourceRequest, representation: Extract<CsharpDirectSourceCandidate,
    { readonly kind: "dependency" }>["representation"], stopOnMissing: boolean) => candidates.push(Object.freeze({
    kind: "dependency", dependency: child, representation, stopOnMissing,
  }));
  for (const subject of subjects) {
    const record = host.sourceFacts?.getFact(subject, tsonicMemoryRecordBindingFactKey);
    if (record !== undefined && host.sourceFacts !== undefined) {
      const selected = selectTsonicMemoryRecordBindingFacts(host.ast, host.sourceFacts, record.call);
      if (selected?.kind !== "resolved") return terminal({ kind: "unavailable" });
      dependency(selectedType(selected.operation.layout.explicitTypeNode, selected.operation.sourceType), "type", true);
      return complete();
    }
    const binding = host.sourceFacts?.getFact(subject, tsonicMemoryFieldBindingFactKey);
    if (binding !== undefined && host.sourceFacts !== undefined) {
      const selected = selectTsonicMemoryFieldBindingFacts(host.ast, host.sourceFacts, binding.call);
      if (selected?.kind !== "resolved") return terminal({ kind: "unavailable" });
      const typeNode = host.ast.typeNode(selected.operation.field.selectedDeclaration) ??
        readCsharpSourceField(host.sourceFacts, [selected.operation.field.selectedDeclaration])?.sourceType;
      dependency(selectedType(typeNode, selected.operation.pointeeType), "location", true);
      return complete();
    }
    const rawLocation = readCsharpRawLocation(host.ast, host.sourceFacts, subject);
    if (rawLocation?.kind === "resolved") {
      if (rawLocation.operation.operation === "to-raw") return terminal({ kind: "raw-pointer", nullable: true });
      const typeNode = rawLocation.operation.explicitPointeeTypeNode ?? rawLocation.layout.explicitTypeNode;
      if (typeNode === undefined && rawLocation.layout.kind === "array") {
        dependency(selectedType(rawLocation.layout.fixedArray.elementType, rawLocation.layout.fixedArray.elementSourceType,
          host.ast.getSourceFile(rawLocation.layout.call) ?? sourceFile), "nullable-array-location", true);
        return complete();
      }
      dependency(selectedType(typeNode, rawLocation.operation.pointeeType), "nullable-location", false);
    }
    if (selectCsharpLayoutObservation(host.sourceFacts, subject)?.kind === "layout-query") return terminal({ kind: "layout-query" });
    const rawAddress = readCsharpSourceRawAddress(host.sourceFacts, subject);
    if (rawAddress !== undefined) return terminal({ kind: "raw-address", operation: rawAddress });
    if (readCsharpSourceKeepAlive(host.sourceFacts, subject) !== undefined) return terminal({ kind: "keep-alive" });
    if (readCsharpSourceJsStringMarker(host.sourceFacts, subject)) return terminal({ kind: "js-string" });
    const defaultValue = readCsharpSourceDefaultValue(host.sourceFacts, subject);
    if (defaultValue !== undefined) dependency(nodeDependency(defaultValue.sourceType), "type", false);
    const primitive = host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey);
    if (primitive !== undefined) return terminal({ kind: "primitive", primitive: primitive.kind });
    const fixedArray = readCsharpSourceFixedArrayType(host.sourceFacts, subject);
    if (fixedArray !== undefined) candidates.push(Object.freeze({ kind: "fixed-array", source: fixedArray,
      dependency: selectedType(fixedArray.elementType, fixedArray.elementSourceType) }));
    const unsafeContext = readCsharpSourceUnsafeContext(host.sourceFacts, subject);
    if (unsafeContext?.kind === "expression") dependency(nodeDependency(unsafeContext.expression), "type", false);
    if (isCsharpSourceRawPointer(host.sourceFacts, subject)) return terminal({ kind: "raw-pointer", nullable: false });
    const pointer = readCsharpSourcePointerType(host.sourceFacts, subject);
    if (pointer !== undefined) dependency(nodeDependency(pointer.sourcePointee), "location", false);
    const pointerOperation = readCsharpSourceTypedLocationOperation(host.sourceFacts, subject);
    if (pointerOperation !== undefined) candidates.push(Object.freeze({ kind: "typed-location", operation: pointerOperation,
      pointee: Object.freeze({ kind: "typed-location-pointee", operation: pointerOperation,
        sourceFile }),
      sourceLocation: pointerOperation.kind !== "location-project" ? undefined : Object.freeze({
        kind: "selected", node: pointerOperation.locationExpression, selectedType: pointerOperation.locationType,
        sourceFile,
      }),
    }));
    const nativePointer = readCsharpSourceNativePointerOperation(host.sourceFacts, subject);
    if (nativePointer !== undefined) candidates.push(Object.freeze({ kind: "native-pointer", operation: nativePointer.operation,
      dependency: Object.freeze({ kind: "selected", node: nativePointer.pointerExpression, selectedType: nativePointer.pointerType,
        sourceFile }),
    }));
    const functionPointer = readCsharpSourceFunctionPointerType(host.sourceFacts, subject);
    if (functionPointer !== undefined) candidates.push(Object.freeze({ kind: "function-pointer", abi: functionPointer.abi,
      parameters: Object.freeze(functionPointer.sourceParameters.map(nodeDependency)),
      result: nodeDependency(functionPointer.sourceResult),
    }));
  }
  return complete();
}

export function bindCsharpDirectSourceCapture(
  capture: CsharpDirectSourceCapture,
  state: CsharpTypeResolutionState,
): CsharpDirectSourceEvidence {
  if (capture.candidates === undefined || capture.subjects === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "Direct source binding requires its retained Source capture.");
  const bind = (source: CsharpDirectSourceRequest): CsharpDirectSourceDependency => Object.freeze({
    ...source, source, state: Object.freeze(nextState(state)),
  });
  const candidates = capture.candidates.map((candidate): CsharpDirectSourceCandidate => {
    switch (candidate.kind) {
      case "dependency":
      case "fixed-array":
      case "native-pointer": return Object.freeze({ ...candidate, dependency: bind(candidate.dependency) });
      case "typed-location": return Object.freeze({ ...candidate, pointee: bind(candidate.pointee),
        sourceLocation: candidate.sourceLocation === undefined ? undefined : bind(candidate.sourceLocation) });
      case "function-pointer": return Object.freeze({ ...candidate, parameters: Object.freeze(candidate.parameters.map(bind)),
        result: bind(candidate.result) });
      default: return candidate;
    }
  });
  return Object.freeze({ capture, subjects: capture.subjects, sourceFile: capture.sourceFile, state,
    candidates: Object.freeze(candidates) });
}

type CsharpDirectSourceCompletion = Generator<CsharpDirectSourceDependency,
  TargetTypeRef | undefined, CsharpCompletedDirectSourceDependency>;

function* completedChild(dependency: CsharpDirectSourceDependency): CsharpDirectSourceCompletion {
  const completed = yield dependency;
  if (completed.dependency !== dependency) return failTargetAnalysisInvariant("tsonic-csharp",
    "Direct source fact completion requires its exact retained child dependency.");
  return completed.type;
}

export function* completeCsharpDirectSourceEvidence(source: CsharpDirectSourceEvidence): CsharpDirectSourceCompletion {
  for (const candidate of source.candidates) {
    switch (candidate.kind) {
      case "unavailable": return undefined;
      case "layout-query": return csharpSourcePrimitiveTargetType("native-uint");
      case "raw-address": return csharpRawAddressResultType(candidate.operation);
      case "keep-alive": return csharpVoidTargetType();
      case "js-string": return csharpJsStringTargetType();
      case "primitive": return csharpSourcePrimitiveTargetType(candidate.primitive);
      case "raw-pointer": return candidate.nullable
        ? csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType()) : csharpRuntimeRawPointerTargetType();
      case "dependency": {
        const child = yield* completedChild(candidate.dependency);
        if (child === undefined) {
          if (candidate.stopOnMissing) return undefined;
          continue;
        }
        switch (candidate.representation) {
          case "type": return child;
          case "location": return csharpRuntimeLocationTargetType(child);
          case "nullable-location": return csharpNullableReferenceTargetType(csharpRuntimeLocationTargetType(child));
          case "nullable-array-location": return csharpNullableReferenceTargetType(csharpRuntimeLocationTargetType({ kind: "array", element: child }));
        }
        break;
      }
      case "fixed-array": {
        if (csharpFixedArrayRepresentationRejection(candidate.source) !== undefined) return undefined;
        const element = yield* completedChild(candidate.dependency);
        if (element !== undefined) return { kind: "array", element };
        break;
      }
      case "typed-location": {
        const pointee = yield* completedChild(candidate.pointee);
        if (pointee === undefined) continue;
        switch (candidate.operation.kind) {
          case "location-address":
          case "location-allocate":
          case "location-bind": return csharpRuntimeLocationTargetType(pointee);
          case "location-load": return pointee;
          case "location-store": return csharpVoidTargetType();
          case "location-equal": return csharpSourcePrimitiveTargetType("bool");
          case "location-hash": return csharpSourcePrimitiveTargetType("float64");
          case "location-view": {
            const location = csharpRuntimeLocationTargetType(pointee);
            return candidate.operation.optional ? csharpNullableReferenceTargetType(location) : location;
          }
          case "location-project": {
            if (candidate.sourceLocation === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
              "A location projection requires its retained original source location.");
            const sourceLocation = yield* completedChild(candidate.sourceLocation);
            const location = csharpRuntimeLocationTargetType(pointee);
            return isCsharpNullableReferenceTargetType(sourceLocation) || isCsharpAbsenceTargetType(sourceLocation)
              ? csharpNullableReferenceTargetType(location) : location;
          }
        }
        break;
      }
      case "native-pointer": {
        const pointer = yield* completedChild(candidate.dependency);
        if (pointer?.kind !== "pointer") continue;
        switch (candidate.operation) {
          case "load": return pointer.pointee;
          case "store": return csharpVoidTargetType();
          case "offset": return pointer;
        }
        break;
      }
      case "function-pointer": {
        const parameters: (TargetTypeRef | undefined)[] = [];
        for (const parameter of candidate.parameters) parameters.push(yield* completedChild(parameter));
        const result = yield* completedChild(candidate.result);
        if (result !== undefined && parameters.every(parameter => parameter !== undefined)) return {
          kind: "function-pointer", args: parameters as readonly TargetTypeRef[], result,
          ...(candidate.abi.length === 0 ? {} : { abi: candidate.abi }),
        };
      }
    }
  }
  return undefined;
}

export function resolveFormedCsharpDirectSourceFacts(
  scope: CsharpTypeResolutionScope,
  source: CsharpDirectSourceEvidence,
): TargetTypeRef | undefined {
  const completion = completeCsharpDirectSourceEvidence(source);
  let step = completion.next();
  while (!step.done) {
    const dependency = step.value;
    const type = dependency.kind === "node" ? scope.resolveNodeWithState(dependency.node, dependency.sourceFile, dependency.state)
      : dependency.kind === "type" ? scope.resolveTypeWithState(dependency.type, dependency.sourceFile, dependency.state)
      : dependency.kind === "selected" ? scope.resolveSelectedValueWithState(dependency.node, dependency.selectedType,
        dependency.sourceFile, dependency.state)
      : scope.resolveTypedLocationOperationPointeeWithState(dependency.operation, dependency.sourceFile, dependency.state);
    step = completion.next(Object.freeze({ dependency, type }));
  }
  return step.value;
}
