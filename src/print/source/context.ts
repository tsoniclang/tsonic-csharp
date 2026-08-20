import type {
  CsharpArgument,
  CsharpAttribute,
  CsharpExpression,
  CsharpParameter,
  CsharpStatement,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../../backend/target-ast/roslyn/index.js";

export interface CsharpPrintContext {
  readonly printArgument: (argument: CsharpArgument) => string;
  readonly printAttributes: (attributes: readonly CsharpAttribute[] | undefined) => readonly string[];
  readonly printExpression: (expression: CsharpExpression) => string;
  readonly printParameter: (parameter: CsharpParameter) => string;
  readonly printStatement: (statement: CsharpStatement) => string;
  readonly printStatements: (statements: readonly CsharpStatement[]) => string[];
  readonly printType: (type: CsharpTypeNode) => string;
  readonly printTypeParameterConstraintLines: (typeParameters: readonly CsharpTypeParameter[] | undefined) => string[];
  readonly printTypeParameterConstraintSuffix: (typeParameters: readonly CsharpTypeParameter[] | undefined) => string;
  readonly printTypeParameters: (typeParameters: readonly CsharpTypeParameter[] | undefined) => string;
}
