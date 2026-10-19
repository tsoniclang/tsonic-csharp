import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpSourceUnionEmission } from "../../target-model/records/source-unions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeUnionTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpSourceUnionEmissionRecords } from "../program/records/source-unions.js";

export function analyzeCsharpSourceUnionEmission(definitions: CsharpTypeDefinitions) {
  const selected: CsharpSourceUnionEmission[] = [];
  for (const definition of definitions.sourceUnions()) {
    const parameters: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] = [];
    for (const parameter of definition.carrier.typeArguments ?? []) {
      if (parameter.kind !== "type-parameter") failTargetAnalysisInvariant("tsonic-csharp", "C# source union declarations require their exact generic template.");
      parameters.push(parameter);
    }
    const single = definition.arms.length === 1;
    const storage = single ? definition.arms[0] : csharpRuntimeUnionTargetType(definition.arms);
    if (storage === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# source union requires its exact native storage carrier.");
    const names = new Set(parameters.map(parameter => parameter.name));
    let resultName = "TResult";
    while (names.has(resultName)) resultName = `_${resultName}`;
    selected.push(Object.freeze({ ...definition, parameters: Object.freeze(parameters), single, storage, resultName }));
  }
  return createCsharpSourceUnionEmissionRecords(Object.freeze(selected));
}
