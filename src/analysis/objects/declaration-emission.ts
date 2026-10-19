import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemand, CsharpObjectShapeArtifact } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeParameter } from "../../target-model/records/object-shape-emission.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
import type { CsharpObjectShapeClassifications } from "./model.js";
import { csharpObjectShapeTypeParameters, csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { createCsharpObjectShapeEmissionRecords } from "../program/records/object-shape-emission.js";

export function analyzeCsharpObjectShapeEmission(input: {
  readonly demand: CsharpObjectShapeDemand;
  readonly shapes: CsharpObjectShapeClassifications;
  readonly names: CsharpNamePlan;
}) {
  const parameters = new Map<string, readonly CsharpObjectShapeParameter[]>();
  const keys = new Map<string, readonly string[]>();
  const declarations = new Map<string, CsharpObjectShapeArtifact>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", message }); };
  for (const artifact of input.demand.artifacts) {
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
        if (reason !== undefined) refuse(reason);
      }
      result.push(Object.freeze({ parameter, name, constraints: resolution.constraints,
        variance: fact.covariantTypeParameterIdentities?.includes(parameter.identity) === true ? "out" : undefined }));
    }
    for (const parameter of csharpObjectShapeTypeParameters(fact.members, fact.implements, fact.methodImplementation)) {
      if (!declaredIdentities.has(parameter.identity)) refuse(`Generated object-shape carrier '${fact.targetType.id}' uses type parameter '${parameter.name}' without declaring it in the finalized target carrier type.`);
    }
    parameters.set(key, Object.freeze(result));
  }
  return Object.freeze({ records: createCsharpObjectShapeEmissionRecords(parameters, keys), issues: Object.freeze(issues) });
}
