import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/index.js";
import type { CsharpTargetProgram } from "../../analysis/program/index.js";
import type { CsharpExpression, CsharpMethodDeclaration } from "../target-ast/syntax/index.js";
import type { CsharpDelegateAdapterIdentity } from "../../target-model/records/conversions.js";
import { createCsharpSyntheticNames, type CsharpSyntheticNames } from "./names/synthetic.js";

export interface CsharpPlanningScope {
  readonly delegateAdapters?: ReadonlyMap<CsharpDelegateAdapterIdentity, string>;
  readonly typeParameterNames?: ReadonlyMap<string, string>;
  readonly classValues?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedBindings?: ReadonlyMap<Node, CsharpExpression>;
  readonly captureFrames?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedReceivers?: ReadonlyMap<Node, CsharpExpression>;
  readonly nativeCallableBody?: { readonly declaration: Node; readonly carrier: TargetTypeRef };
  readonly presentOptionalValues?: ReadonlySet<Node>;
  readonly generatedMethods?: Map<Node, CsharpMethodDeclaration>;
  readonly sourceThisBinding?: { readonly name: string; readonly targetType: TargetTypeRef };
}

export type CsharpPlanningNames = CsharpSyntheticNames;

export interface CsharpPlanningContext {
  readonly storageExpression?: Node;
  readonly host: CsharpTargetProgram["host"];
  readonly program: {
    readonly source: Pick<CsharpTargetProgram["source"], "ast">;
    readonly records: CsharpTargetProgram["records"];
  };
  readonly names: CsharpPlanningNames;
  readonly scope: CsharpPlanningScope;
}

export function createCsharpPlanningContext(program: CsharpTargetProgram): CsharpPlanningContext {
  const inventory = program.records.nameInventory.get();
  const names: CsharpPlanningNames = createCsharpSyntheticNames(inventory.reservedNames);
  return Object.freeze({ host: program.host, program: Object.freeze({ source: Object.freeze({ ast: program.source.ast }), records: program.records }),
    names, scope: Object.freeze({ typeParameterNames: new Map(inventory.typeParameterNames.map(parameter => [parameter.identity, parameter.name])) }) });
}

export function createCsharpMemberPlanningContext(input: CsharpPlanningContext): CsharpPlanningContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope, generatedMethods: new Map<Node, CsharpMethodDeclaration>() }) });
}

export function createCsharpThisBindingPlanningContext(input: CsharpPlanningContext, name: string, targetType: TargetTypeRef): CsharpPlanningContext {
  return Object.freeze({ ...input, scope: Object.freeze({ ...input.scope, sourceThisBinding: Object.freeze({ name, targetType }) }) });
}
