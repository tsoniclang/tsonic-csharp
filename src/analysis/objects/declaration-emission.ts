import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemand, CsharpObjectShapeArtifact } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import type { CsharpObjectShapeDeclarationEmission, CsharpObjectShapeEmission, CsharpObjectShapeParameter } from "../../target-model/records/object-shape-emission.js";
import type { CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { csharpStructuralObjectShapeIdentity, isCsharpJsValueObjectShapeTargetType } from "../../target-model/types/index.js";
import { isCsharpEmptyObjectTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import { csharpObjectShapeTypeParameters } from "../constraints/owner-environment.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { createCsharpObjectShapeEmissionRecords } from "../program/records/object-shape-emission.js";
import { analyzeCsharpObjectShapeNames } from "./display-names.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpBindingPatternClassifications } from "../../target-model/records/value-projections.js";

export function analyzeCsharpObjectShapeEmission(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly bindings: CsharpBindingPatternClassifications;
  readonly demand: CsharpObjectShapeDemand;
  readonly shapes: CsharpObjectShapeClassifications;
  readonly names: CsharpNamePlan;
}) {
  const parameters = new Map<string, readonly CsharpObjectShapeParameter[]>();
  const keys = new Map<string, readonly string[]>();
  const declarations = new Map<string, CsharpObjectShapeArtifact>();
  const issues: TargetDiagnostic[] = [];
  const headers = new Map<string, CsharpObjectShapeDeclarationEmission>();
  const emissions = new Map<string, CsharpObjectShapeEmission>();
  const nativeNames = new Map<string, string>();
  const enumerableTypes = new Set(input.demand.artifacts.filter(artifact => artifact.capabilities.includes("enumerable-keys"))
    .map(artifact => targetTypeRefKey(artifact.fact.targetType)));
  const refuse = (message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", message }); };
  const constructions = new Set<Node>();
  const refuseConstruction = (node: Node): void => {
    if (constructions.has(node)) return;
    constructions.add(node);
    issues.push({ source: "tsonic-csharp", category: "error", code: "CSHARP_UNSUPPORTED_AST", sourceNode: node,
      message: "Class object literal emission requires an exact constructible source class with a parameterless constructor." });
  };
  for (const { use } of input.nativeDemand.entries) {
    if (use.kind === "erased") continue;
    if (input.ast.is.IsObjectLiteralExpression(use.expression) && use.objectShape?.constructible === false) refuseConstruction(use.expression);
    if (use.kind === "value" && use.handler?.kind === "memory-binding" &&
      use.handler.selection.kind === "record" && use.handler.selection.shape.constructible === false) refuseConstruction(use.expression);
  }
  for (const node of input.nodes) {
    const projection = input.bindings.bindingPatternProjection.get(node)?.element;
    if (projection?.kind === "object-shape-rest" && projection.restShape.constructible === false) refuseConstruction(node);
  }
  const shapes = new Map([...input.shapes.knownShapes(), ...input.demand.artifacts.map(artifact => artifact.fact)]
    .map(fact => [objectShapeArtifactKey(fact), fact]));
  for (const fact of shapes.values()) {
    if (isCsharpJsValueObjectShapeTargetType(fact.targetType) || isCsharpEmptyObjectTargetType(fact.targetType))
      emissions.set(objectShapeArtifactKey(fact), Object.freeze({ kind: "runtime" }));
  }
  for (const artifact of input.demand.artifacts) {
    if (emissions.get(artifact.key)?.kind === "runtime") continue;
    if (artifact.capabilities.includes("enumerable-keys")) {
      const order = input.shapes.propertyOrder(artifact.fact, undefined, "keys");
      if (order.kind === "rejected") refuse(order.reason);
      else keys.set(artifact.key, Object.freeze(order.propertyOrder));
    }
    if (artifact.materialization !== "synthetic") continue;
    const template = artifact.fact.declarationTemplate ?? artifact.fact;
    const key = objectShapeArtifactKey(template);
    if (declarations.has(key)) continue;
    const selected = input.demand.get(key);
    if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A synthetic declaration requires its canonical admitted template artifact.");
    declarations.set(key, selected);
  }
  for (const [key, artifact] of declarations) {
    const fact = artifact.fact;
    const native = fact.targetType.kind === "target-named" ? fact.targetType as CsharpTargetNamedTypeRef : undefined;
    const rendering = native?.csharpRender;
    const name = rendering?.kind === "named" && rendering.externAlias === undefined && (rendering.namespace?.length ?? 0) === 0 &&
      (rendering.nested?.length ?? 0) === 0 ? tryCsharpIdentifier(rendering.name) : undefined;
    if (native === undefined || name === undefined) {
      issues.push({ code: "CSHARP_OBJECT_SHAPE_TARGET_TYPE_INVALID", category: "error", source: "tsonic-csharp",
        message: "Generated object-shape artifact has no renderable named C# target type." });
      continue;
    }
    const existingName = nativeNames.get(name);
    if (existingName !== undefined && existingName !== key) {
      issues.push({ code: "CSHARP_OBJECT_SHAPE_ARTIFACT_CONFLICT", category: "error", source: "tsonic-csharp",
        message: `Generated object-shape name '${name}' is owned by incompatible target artifacts.` });
      continue;
    }
    nativeNames.set(name, key);
    headers.set(key, Object.freeze({ artifact, name,
      representation: native.csharpStructuralContract === true ? "interface" : native.csharpValueType === true ? "struct" : "class",
      identity: csharpStructuralObjectShapeIdentity(fact.targetType),
      inheritedEnumerableKeys: (fact.implements ?? []).some(type => enumerableTypes.has(targetTypeRefKey(type))) }));
    if (fact.targetType.kind !== "target-named") {
      parameters.set(key, Object.freeze([]));
      continue;
    }
    const names = new Map([...input.names.typeParameterNames, ...artifact.typeParameterNames].map(parameter => [parameter.identity, parameter.name]));
    const result: CsharpObjectShapeParameter[] = [];
    const declaredNames = new Set<string>();
    const declaredIdentities = new Set<string>();
    const available = new Set((fact.targetType.typeArguments ?? []).filter(argument => argument.kind === "type-parameter").map(argument => argument.identity));
    for (const parameter of fact.targetType.typeArguments ?? []) {
      if (parameter.kind !== "type-parameter") {
        refuse(`Generated object-shape carrier '${fact.targetType.id}' may only declare type-parameter target arguments.`);
        continue;
      }
      if (declaredIdentities.has(parameter.identity)) continue;
      const name = names.get(parameter.identity) ?? tryCsharpIdentifier(parameter.name);
      if (name === undefined) { refuse(`Generated object-shape carrier '${fact.targetType.id}' type parameter '${parameter.name}' must be a valid C# identifier.`); continue; }
      if (declaredNames.has(name)) { refuse(`Generated object-shape carrier '${fact.targetType.id}' has conflicting generic binders '${name}'.`); continue; }
      declaredNames.add(name);
      declaredIdentities.add(parameter.identity);
      const resolution = parameter.csharpConstraints;
      if (resolution === undefined || resolution.kind === "unsupported") {
        refuse(resolution?.kind === "unsupported" ? resolution.reason : `Generated object-shape carrier '${fact.targetType.id}' has no sealed constraints for '${parameter.name}'.`);
        continue;
      }
      const typeConstraints = resolution.constraints.flatMap(constraint => constraint.kind === "type" ? [constraint.type] : []);
      if ([...csharpFreeTypeParameterIdentities(typeConstraints)].some(identity => !available.has(identity))) {
        refuse(`Generated object-shape carrier '${fact.targetType.id}' has a constraint with an undeclared native generic dependency.`);
        continue;
      }
      for (const type of typeConstraints) {
        const reason = csharpTargetTypeRenderingRejection(type);
        if (reason !== undefined) refuse(`The exact C# object-shape constraint has no native type syntax (${reason.reason}).`);
      }
      result.push(Object.freeze({ parameter, name, constraints: resolution.constraints,
        variance: fact.covariantTypeParameterIdentities?.includes(parameter.identity) === true ? "out" : undefined }));
    }
    for (const parameter of csharpObjectShapeTypeParameters(fact.members, fact.implements, fact.methodImplementation)) {
      if (!declaredIdentities.has(parameter.identity)) refuse(`Generated object-shape carrier '${fact.targetType.id}' uses type parameter '${parameter.name}' without declaring it in the finalized target carrier type.`);
    }
    parameters.set(key, Object.freeze(result));
  }
  for (const artifact of input.demand.artifacts) {
    if (emissions.get(artifact.key)?.kind === "runtime") continue;
    if (artifact.materialization === "source") emissions.set(artifact.key, Object.freeze({ kind: "source", artifact }));
    else {
      const declaration = headers.get(objectShapeArtifactKey(artifact.fact.declarationTemplate ?? artifact.fact));
      if (declaration !== undefined) emissions.set(artifact.key, Object.freeze({ kind: "synthetic", declaration }));
    }
  }
  return Object.freeze({ records: createCsharpObjectShapeEmissionRecords(parameters, keys, emissions,
    [...headers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    analyzeCsharpObjectShapeNames(input.demand.artifacts, new Set([...input.names.reservedNames,
      ...headers.values()].map(value => typeof value === "string" ? value : value.name)))), issues: Object.freeze(issues) });
}
