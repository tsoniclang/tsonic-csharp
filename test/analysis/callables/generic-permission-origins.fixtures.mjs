import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpCallableContractIndexesEqual } from "../../../dist/analysis/callables/analyze.js";

const overloaded = `function pass<Value>(value: Value): Value;
function pass<Value>(value: Value): Value { return value; }`;

const cases = [
  ["ordinary", "function pass<Value>(value: Value): Value { return value; }", "pass(7) === 7"],
  ["overloaded-explicit", overloaded, "pass<number>(7) === 7"],
  ["overloaded-inferred", overloaded, "pass(7) === 7"],
  ["overloaded-method", `class Box {
    pass<Value>(value: Value): Value;
    pass<Value>(value: Value): Value { return value; }
  }`, "new Box().pass<number>(7) === 7"],
  ["overloaded-static-method", `class Box {
    static pass<Value>(value: Value): Value;
    static pass<Value>(value: Value): Value { return value; }
  }`, "Box.pass<number>(7) === 7"],
  ["narrow-checked-contract", `function pass(value: number): number;
    function pass(value: number | string): number | string { return value; }`, "pass(7) === 7"],
  ["shadowed-binders", `function outer<Value>(value: Value): Value {
    function pass<Value>(other: Value): Value;
    function pass<Value>(other: Value): Value { return other; }
    return pass(value);
  }`, "outer(7) === 7"],
  ["source-protocol", `interface Echo { pass<Value>(value: Value): Value; }
    class Box implements Echo { pass<Value>(value: Value): Value { return value; } }`, "new Box().pass(7) === 7"],
];

export { overloaded, cases };
