import type { CsharpExpression } from "./expressions.js";
import type { CsharpTypeNode } from "./types.js";

export interface CsharpBlock {
  readonly kind: "Block";
  readonly statements: readonly CsharpStatement[];
}

export type CsharpStatement =
  | { readonly kind: "ReturnStatement"; readonly expression?: CsharpExpression }
  | { readonly kind: "ExpressionStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "LocalDeclarationStatement"; readonly name: string; readonly type: CsharpTypeNode; readonly initializer?: CsharpExpression }
  | { readonly kind: "Block"; readonly body: CsharpBlock }
  | { readonly kind: "BreakStatement" }
  | { readonly kind: "ContinueStatement" }
  | { readonly kind: "GotoStatement"; readonly label: string }
  | { readonly kind: "GotoSwitchStatement"; readonly label: CsharpSwitchLabel }
  | { readonly kind: "ThrowStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "LabeledStatement"; readonly name: string; readonly statement: CsharpStatement }
  | { readonly kind: "SwitchStatement"; readonly expression: CsharpExpression; readonly sections: readonly CsharpSwitchSection[] }
  | { readonly kind: "TryStatement"; readonly tryBody: CsharpBlock; readonly catchClause?: CsharpCatchClause; readonly finallyBody?: CsharpBlock }
  | { readonly kind: "ForEachStatement"; readonly itemType: CsharpTypeNode; readonly itemName: string; readonly collection: CsharpExpression; readonly body: CsharpBlock }
  | { readonly kind: "IfStatement"; readonly condition: CsharpExpression; readonly thenBody: CsharpBlock; readonly elseBody?: CsharpBlock }
  | { readonly kind: "WhileStatement"; readonly condition: CsharpExpression; readonly body: CsharpBlock }
  | { readonly kind: "DoStatement"; readonly body: CsharpBlock; readonly condition: CsharpExpression }
  | {
      readonly kind: "ForStatement";
      readonly initializer?: CsharpForInitializer;
      readonly condition?: CsharpExpression;
      readonly incrementor?: CsharpExpression;
      readonly body: CsharpBlock;
    };

export interface CsharpSwitchSection {
  readonly kind: "SwitchSection";
  readonly label: CsharpSwitchLabel;
  readonly statements: readonly CsharpStatement[];
}

export type CsharpSwitchLabel =
  | { readonly kind: "CaseSwitchLabel"; readonly expression: CsharpExpression }
  | { readonly kind: "DefaultSwitchLabel" };

export type CsharpCatchClause =
  | {
      readonly kind: "CatchClause";
      readonly body: CsharpBlock;
      readonly variableName?: never;
      readonly variableType?: never;
    }
  | {
      readonly kind: "CatchClause";
      readonly variableName: string;
      readonly variableType: CsharpTypeNode;
      readonly body: CsharpBlock;
    };

export type CsharpForInitializer =
  | { readonly kind: "VariableDeclaration"; readonly locals: readonly CsharpLocalDeclaration[] }
  | { readonly kind: "Expression"; readonly expression: CsharpExpression };

export interface CsharpLocalDeclaration {
  readonly kind: "VariableDeclarator";
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
}
