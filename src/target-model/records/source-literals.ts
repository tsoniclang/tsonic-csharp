import type { Node } from "@tsonic/tsts";

export type CsharpSourceLiteralForm =
  | "string"
  | "template"
  | "numeric"
  | "bigint"
  | "true"
  | "false"
  | "prefix-unary"
  | "parenthesized"
  | "binary"
  | "array";

export interface CsharpSourceLiteralValue {
  readonly form: CsharpSourceLiteralForm;
  readonly number?: number;
  readonly integer?: bigint;
  readonly integerConstant?: bigint;
  readonly text?: string;
  readonly elements?: readonly (CsharpSourceLiteralValue | undefined)[];
}

export interface CsharpSourceLiteralIndex {
  readonly literalValue: { readonly get: (node: Node) => CsharpSourceLiteralValue | undefined };
}
