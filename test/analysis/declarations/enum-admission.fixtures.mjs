import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const absenceObservations = ["null", "undefined"].flatMap(absence =>
  ["===", "!==", "==", "!="].flatMap(operator => [
    `(value ${operator} ${absence}) === ${operator === "===" || operator === "==" ? "!present" : "present"}`,
    `(${absence} ${operator} value) === ${operator === "===" || operator === "==" ? "!present" : "present"}`,
  ]));

const absenceSource = `
enum Value { First = 1, Second = 2 }
function observe(value: Value | null | undefined, present: boolean): boolean {
  return ${absenceObservations.map(expression => `(${expression})`).join(" && ")};
}
export function run(flag: boolean): boolean {
  const selected = flag ? Value.First : undefined;
  const joined = flag ? Value.Second : null;
  const copied = selected;
  return observe(Value.First, true) && observe(null, false) && observe(undefined, false) &&
    observe(selected, flag) && observe(joined, flag) && observe(copied, flag) &&
    ((copied ?? Value.First) === Value.First);
}
`;

const absenceProjectionRefusals = [
  ["nullable numeric peer", "export function use(value: Value | undefined, operand: number): boolean { return value === operand; }"],
  ["reversed nullable numeric peer", "export function use(value: Value | null, operand: number): boolean { return operand != value; }"],
  ["shadowed undefined", "export function use(value: Value, undefined: number): boolean { return value === undefined; }"],
  ["nullable arithmetic", "export function use(value: Value | undefined): number { return (value ?? Value.First) + 1; }"],
  ["explicit numeric destination", "export function use(value: Value | undefined): number | undefined { const selected: number | undefined = value; return selected; }"],
  ["explicit numeric assertion", "export function use(value: Value): boolean { return (value as number) === undefined; }"],
];

const numericUses = [
  ["float64 equality", "export function use(value: Value, operand: number): boolean { return value === operand; }"],
  ["int32 equality", "export function use(value: Value, operand: int32): boolean { return value === operand; }"],
  ["ordering", "export function use(left: Value, right: Value): boolean { return left < right; }"],
  ["arithmetic", "export function use(value: Value): number { return value + 1; }"],
  ["unary minus", "export function use(value: Value): number { return -value; }"],
  ["unary plus", "export function use(value: Value): number { return +value; }"],
  ["increment", "export function use(value: Value): Value { value++; return value; }"],
  ["numeric local", "export function use(value: Value): number { const result: number = value; return result; }"],
  ["numeric return", "export function use(value: Value): number { return value; }"],
  ["numeric argument", "function consume(value: number): number { return value; } export function use(value: Value): number { return consume(value); }"],
  ["complement numeric local", "export function use(value: Value): number { const result: number = ~value; return result; }"],
  ["complement arithmetic", "export function use(value: Value): number { return ~value + 1; }"],
  ["bitwise numeric return", "export function use(left: Value, right: Value): number { return left | right; }"],
  ["inferred complement return", "export function use(value: Value): number { const result = ~value; return result; }"],
  ["inferred complement copy return", "export function use(value: Value): number { const result = ~value; const copy = result; return copy; }"],
  ["inferred bitwise return", "export function use(left: Value, right: Value): number { const result = left | right; return result; }"],
  ["inferred complement argument", "function consume(value: number): number { return value; } export function use(value: Value): number { const result = ~value; return consume(result); }"],
  ["inferred complement assignment", "export function use(value: Value): number { const result = ~value; let copy = 0; copy = result; return copy; }"],
  ["inferred complement comparison", "export function use(value: Value): boolean { const result = ~value; return result === 0; }"],
  ["inferred complement arithmetic", "export function use(value: Value): number { const result = ~value; return result + 1; }"],
  ["unwritten inferred binding", "export function use(value: Value): number { let result = ~value; return result; }"],
  ["discarded arithmetic", "export function use(value: Value): void { value + 1; }"],
  ["discarded numeric assertion", "export function use(value: Value): void { (value as number); }"],
  ["void numeric assertion", "export function use(value: Value): void { void (value as number); }"],
  ["copied numeric assertion", "export function use(value: Value): number { const projected = value as number; const copied = projected; return copied; }"],
  ["shift", "export function use(value: Value): number { return value << 1; }"],
  ["conditional complement", "export function use(left: Value, right: Value, flag: boolean): number { const result = flag ? ~left : ~right; return result; }"],
  ["conditional bitwise", "export function use(left: Value, right: Value, flag: boolean): number { const result = flag ? left | right : left & right; return result; }"],
  ["mixed choice equality", "export function use(left: Value, flag: boolean): boolean { const result = flag ? ~left : 42; return result === left; }"],
  ["comma complement", "function touch(): void {} export function use(value: Value): number { const result = (touch(), ~value); return result; }"],
  ["logical-and result", "export function use(left: Value, right: Value): number { const result = (~left) && (~right); return result; }"],
  ["logical-or result", "export function use(left: Value, right: Value): number { const result = (~left) || (~right); return result; }"],
  ["logical-or numeric destination", "export function use(left: Value, right: Value): number { return (~left) || (~right); }"],
  ["logical-or nested wrappers", "export function use(left: Value, right: Value): number { const result = (((~left)!)) || (((~right)!)); return result; }"],
  ["nullish numeric left context", "export function use(left: number | undefined, right: Value): number { const result = left ?? ~right; return result; }"],
  ["nullish result", "export function use(right: Value, absent: undefined): number { const result = absent ?? ~right; return result; }"],
  ["numeric switch discriminant", "export function use(value: number): number { switch (value) { case Value.First: return 1; default: return 0; } }"],
  ["numeric switch case", "export function use(value: Value): number { switch (value) { case 1: return 1; default: return 0; } }"],
  ["array numeric index", "export function use(values: number[], key: Value): number { return values[key]; }"],
  ["number index signature", "export function use(values: { [index: number]: number }, key: Value): number { return values[key]; }"],
  ["explicit numeric assertion", "export function use(value: Value): number { return value as number; }"],
  ["angle numeric assertion", "export function use(value: Value): number { return <number>value; }"],
  ["inferred object field escape", "export function use(): number { const object = { value: ~Value.First }; return object.value + 1; }"],
  ["inferred collection escape", "export function use(): number { const values = [~Value.First]; return values[0] + 1; }"],
  ["generic call numeric escape", "function identity<T>(value: T): T { return value; } export function use(value: Value): number { const result = identity(~value); return result; }"],
  ["inferred callable return escape", "function produce(value: Value) { return ~value; } export function use(value: Value): number { return produce(value); }"],
  ["written inferred numeric local","export function use(value: Value): number { let result = ~value; result = 3; return result; }"],
  ["numeric class field","export class Holder { value: number = Value.First; }"],
  ["numeric parameter default","export function use(value: number = Value.First): number { return value; }"],
  ["unknown assertion chain","export function use(value: Value): number { return value as unknown as number; }"],
  ["any assertion chain","export function use(value: Value): number { return <number><any>value; }"],
  ["unknown local store","export function use(value: Value): void { const result: unknown = value; }"],
  ["any local store","export function use(value: Value): void { const result: any = value; }"],
  ["unknown destination","function accept(value: unknown): void {} export function use(value: Value): void { accept(value); }"],
  ["object assertion destination","export function use(value: Value): object { return value as unknown as object; }"],
  ["any destination","function accept(value: any): void {} export function use(value: Value): void { accept(value); }"],
  ["rest any destination","function accept(...values: any[]): void {} export function use(value: Value): void { accept(value); }"],
  ["unknown conditional destination","function accept(value: unknown): void {} export function use(left: Value, right: Value, flag: boolean): void { accept(flag ? left : right); }"],
  ["unknown logical destination","function accept(value: unknown): void {} export function use(left: Value, right: Value): void { accept(left || right); }"],
  ["unknown nullish destination","function accept(value: unknown): void {} export function use(left: Value | undefined, right: Value): void { accept(left ?? right); }"],
  ["unknown comma destination","function touch(): void {} function accept(value: unknown): void {} export function use(value: Value): void { accept((touch(), value)); }"],
  ["unknown wrapped destination","function accept(value: unknown): void {} export function use(value: Value): void { accept(((value)!)); }"],
  ["mutable union without enum destination","export function use(value: Value): number | undefined { let result: number | undefined = value; result = undefined; return result; }"],
];

const stringUses = [
  ["template", "export function use(value: Value): string { return `enum:${value}`; }", false],
  ["global String", "export function use(value: Value): string { return String(value); }", true],
  ["global String alias", "export function use(value: Value): string { const convert = String; return convert(value); }", true],
  ["enum toString", "export function use(value: Value): string { return value.toString(); }", true],
  ["left concatenation", "export function use(value: Value): string { return '' + value; }", false],
  ["right concatenation", "export function use(value: Value): string { return value + ''; }", false],
  ["compound concatenation", "export function use(value: Value): string { let result = ''; result += value; return result; }", false],
  ["string index", "export function use(values: { [key: string]: number }, key: Value): number { return values[key]; }", false],
  ["toFixed", "export function use(value: Value): string { return value.toFixed(); }", true],
  ["toPrecision", "export function use(value: Value): string { return value.toPrecision(); }", true],
  ["toExponential", "export function use(value: Value): string { return value.toExponential(); }", true],
  ["toLocaleString", "export function use(value: Value): string { return value.toLocaleString(); }", true],
  ["computed toFixed", "export function use(value: Value): string { return value['toFixed'](); }", true],
];

export { absenceObservations, absenceSource, absenceProjectionRefusals, numericUses, stringUses };
