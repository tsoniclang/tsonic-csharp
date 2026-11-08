import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpMethodDeclaration } from "../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "./planning-data.js";

export function createCsharpMemberPlanningContext(input: CsharpPlanningContext): CsharpPlanningContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope, generatedMethods: new Map<Node, CsharpMethodDeclaration>() }) });
}

export function createCsharpThisBindingPlanningContext(input: CsharpPlanningContext, name: string, targetType: TargetTypeRef): CsharpPlanningContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope, sourceThisBinding: Object.freeze({ name, targetType }) }) });
}
