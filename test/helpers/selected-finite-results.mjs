export const selectedFiniteResultSource = `
import type { int32, uint64 } from "@tsonic/core/types.js";
class Reader {
  calls: int32 = 0 as int32;
  readonly wide: uint64;
  constructor(wide: uint64) { this.wide = wide; }
  read(kind: "text"): string;
  read(kind: "wide"): uint64;
  read(kind: string): string | uint64 { this.calls++; return kind === "text" ? "exact" : this.wide; }
  optional(present: true): string;
  optional(present: false): string | undefined;
  optional(present: boolean): string | undefined { this.calls++; return present ? "present" : undefined; }
  fluent(): this { this.calls++; return this; }
}
class Derived extends Reader {
  result(): uint64 { return this.wide; }
}
function receiver(reader: Derived): Derived { reader.calls++; return reader; }
export function run(wide: uint64): boolean {
  const reader = new Derived(wide);
  const text = receiver(reader).read("text");
  const exact = receiver(reader).read("wide");
  const present = receiver(reader).optional(true);
  const absent = receiver(reader).optional(false);
  const fluent = receiver(reader).fluent().result();
  return text === "exact" && exact === wide && present === "present" && absent == null &&
    fluent === wide && reader.calls === 10;
}
export function selected(reader: Derived): uint64 { return reader.read("wide"); }
`;

export const selectedFiniteResultNativeProgram = `
if (!Tsonic.Generated.Index.run(ulong.MaxValue))
    throw new System.Exception("selected source result lost native width, absence, receiver identity or exact call effects");
`;
