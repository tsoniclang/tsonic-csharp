import type { CsharpTypeDefinitions, CsharpSourceUnionDefinition } from "../../../../target-model/types/source-union-definitions.js";
export interface CsharpTypeDefinitionWriter extends CsharpTypeDefinitions {
  registerSourceUnion(definition: CsharpSourceUnionDefinition): boolean;
}
