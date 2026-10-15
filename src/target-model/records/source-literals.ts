import type { Node } from "@tsonic/tsts";

export type CsharpSourceLiteralForm = CsharpSourceLiteralValue["form"];

interface CsharpSourceLiteralNumbers {
  readonly number?: number;
  readonly integer?: bigint;
  readonly integerConstant?: bigint;
}

export interface CsharpSourceTextLiteralValue extends CsharpSourceLiteralNumbers {
  readonly form: "string" | "template";
  readonly text: string;
  readonly elements?: undefined;
}

export interface CsharpSourceArrayLiteralValue extends CsharpSourceLiteralNumbers {
  readonly form: "array";
  readonly elements: readonly (CsharpSourceLiteralValue | undefined)[];
  readonly text?: undefined;
}

export interface CsharpSourceScalarLiteralValue extends CsharpSourceLiteralNumbers {
  readonly form: "true" | "false" | "numeric" | "bigint" | "prefix-unary" | "parenthesized" | "binary";
  readonly text?: undefined;
  readonly elements?: undefined;
}

export type CsharpSourceLiteralValue =
  | CsharpSourceTextLiteralValue
  | CsharpSourceArrayLiteralValue
  | CsharpSourceScalarLiteralValue;

export interface CsharpSourceLiteralIndex {
  readonly literalValue: { readonly get: (node: Node) => CsharpSourceLiteralValue | undefined };
}
