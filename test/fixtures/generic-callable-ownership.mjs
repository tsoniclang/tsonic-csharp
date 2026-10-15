export const unsupportedGenericCallableOwnershipCases = Object.freeze([
  {
    name: "named-module-quantified-owner",
    code: "CSHARP_QUANTIFIED_NAMED_CALLABLE_NOT_SUPPORTED",
    message: "named quantified function",
    source: `
      export function identity<Item>(value: Item): Item { return value; }
      export function main(): void {
        const selected: <Item>(value: Item) => Item = identity;
        if (selected(3) !== 3 || selected("value") !== "value") throw new Error("quantified owner");
      }
    `,
  },
  {
    name: "named-local-quantified-owner",
    code: "CSHARP_QUANTIFIED_NAMED_CALLABLE_NOT_SUPPORTED",
    message: "named quantified function",
    source: `
      export function create(seed: number) {
        function choose<Item>(left: Item, right: Item): Item { return seed > 0 ? left : right; }
        const selected: <Item>(left: Item, right: Item) => Item = choose;
        return selected;
      }
      export function main(): void {
        const choose = create(1);
        if (choose(3, 4) !== 3 || choose("left", "right") !== "left") throw new Error("quantified owner");
      }
    `,
  },
  {
    name: "nominal-static-quantified-method-owner",
    code: "CSHARP_UNSUPPORTED_AST",
    message: "extracted quantified nominal method",
    source: `
      export class Value { static identity<Item>(value: Item): Item { return value; } }
      export function main(): void {
        const identity: <Item>(value: Item) => Item = Value.identity;
        if (identity(3) !== 3 || identity("value") !== "value") throw new Error("quantified owner");
      }
    `,
  },
  {
    name: "nominal-instance-quantified-method-owner",
    code: "CSHARP_UNSUPPORTED_AST",
    message: "extracted quantified nominal method",
    source: `
      export class Value {
        first = true;
        choose<Item>(left: Item, right: Item): Item { return this.first ? left : right; }
      }
      export function main(): void {
        const value = new Value();
        const choose: <Item>(left: Item, right: Item) => Item = value.choose;
        if (choose(3, 4) !== 3 || choose("left", "right") !== "left") throw new Error("quantified owner");
      }
    `,
  },
  {
    name: "cross-file-named-quantified-owner",
    code: "CSHARP_QUANTIFIED_NAMED_CALLABLE_NOT_SUPPORTED",
    message: "named quantified function",
    source: `
      import { identity } from "./values.js";
      export function main(): void {
        const selected: <Item>(value: Item) => Item = identity;
        if (selected(3) !== 3 || selected("value") !== "value") throw new Error("quantified owner");
      }
    `,
    files: { "values.ts": "export function identity<Item>(value: Item): Item { return value; }" },
  },
]);
