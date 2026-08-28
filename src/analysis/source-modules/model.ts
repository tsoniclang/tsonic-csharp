import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpSourceModuleBootstrap {
  readonly id: string;
  readonly declaringType: TargetTypeRef;
  readonly methodName: string;
}

export interface CsharpSourceModuleConstruction {
  readonly expression: Node;
  readonly sourceFile: SourceFile;
  readonly targetSourceFile: SourceFile;
  readonly moduleArgument: Node;
  readonly sourceArgumentIndex: number;
  readonly targetParameterIndex: number;
  readonly bootstrap: CsharpSourceModuleBootstrap;
}

export interface CsharpSourceModuleConstructionIndex {
  construction(node: Node): CsharpSourceModuleConstruction | undefined;
  entries(): readonly CsharpSourceModuleConstruction[];
  from(sourceFile: SourceFile): readonly CsharpSourceModuleConstruction[];
  targets(): readonly SourceFile[];
  bootstraps(): readonly CsharpSourceModuleBootstrap[];
}

export interface CsharpSourceModuleAnalysisIssue {
  readonly code: string;
  readonly node: Node;
  readonly message: string;
}

export interface CsharpSourceModuleAnalysis {
  readonly index: CsharpSourceModuleConstructionIndex;
  readonly issues: readonly CsharpSourceModuleAnalysisIssue[];
}
