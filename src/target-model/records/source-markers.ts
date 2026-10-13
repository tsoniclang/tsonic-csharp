import type { Node } from "@tsonic/tsts";

export interface CsharpSourceDefaultValue {
  readonly kind: "csharp-default-value";
  readonly sourceType: Node;
}

export interface CsharpSourceField {
  readonly sourceName: string;
  readonly sourceType: Node;
  readonly readonly: boolean;
}

export interface CsharpSourceStruct {
  readonly kind: "csharp-struct";
  readonly valueType: boolean;
  readonly fields: readonly CsharpSourceField[];
}
