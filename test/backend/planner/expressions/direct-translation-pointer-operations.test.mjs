import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("raw pointer identity preserves optional address carriers through parameters and returns", () => {
  const compiled = cleanCompile(`
    import { equalRawPointer as same, hashRawPointer } from "@tsonic/core/lang.js";
    import type { RawPointer } from "@tsonic/core/types.js";
    type Address = RawPointer;
    function pass(value: Address | undefined): Address | undefined { return value; }
    export function check(left: Address | undefined, right: Address | undefined): boolean {
      return same(pass(left), pass(right)) && hashRawPointer(left) === hashRawPointer(right);
    }
    export function missing(): boolean { return check(undefined, undefined); }
  `);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /Tsonic\.CSharp\.Runtime\.RawPointer\? pass/u);
  assert.match(output, /RawPointer\.Same\(pass\(left\), pass\(right\)\)/u);
  assert.match(output, /RawPointer\.Hash\(left\)/u);
  assert.doesNotMatch(output, /\bunsafe\b/u);
});

test("typed locations preserve aliases, parameters, returns, and fresh allocation", () => {
  const compiled = cleanCompile(`
    import { addressOf, allocatePointer, loadPointer, storePointer } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";

    function increment(pointer: Pointer<int32>): void {
      storePointer(pointer, loadPointer(pointer) + 1);
    }

    function create(): Pointer<int32> {
      return allocatePointer<int32>(40);
    }

    export function run(): int32 {
      let local: int32 = 1;
      const alias = addressOf(local);
      increment(alias);
      const allocated = create();
      increment(allocated);
      return local + loadPointer(allocated);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static void increment(Tsonic.CSharp.Runtime.Location<int> pointer)
        {
            pointer.Store(pointer.Load() + 1);
        }
        public static Tsonic.CSharp.Runtime.Location<int> create()
        {
            return Tsonic.CSharp.Runtime.Location<int>.Allocate(40);
        }
        public static int run()
        {
            object __tsonic_locationIdentity0 = new object();
            int local = 1;
            Tsonic.CSharp.Runtime.Location<int> alias = Tsonic.CSharp.Runtime.Location<int>.CreateLocal(__tsonic_locationIdentity0, () => local, __tsonic_param0 => local = __tsonic_param0);
            increment(alias);
            Tsonic.CSharp.Runtime.Location<int> allocated = create();
            increment(allocated);
            return local + allocated.Load();
        }
    }
}
`);
});

test("typed locations retain generic pointees and conditional identity", () => {
  const compiled = cleanCompile(`
    import { addressOf, loadPointer, storePointer } from "@tsonic/core/lang.js";
    import type { bool, int32, Pointer } from "@tsonic/core/types.js";

    export function replace<T>(pointer: Pointer<T>, value: T): T {
      storePointer(pointer, value);
      return loadPointer(pointer);
    }

    export function choose(flag: bool): int32 {
      let left: int32 = 1;
      let right: int32 = 2;
      const pointer = flag ? addressOf(left) : addressOf(right);
      storePointer(pointer, 3);
      return left + right;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static T replace<T>(Tsonic.CSharp.Runtime.Location<T> pointer, T value)
        {
            pointer.Store(value);
            return pointer.Load();
        }
        public static int choose(bool flag)
        {
            object __tsonic_locationIdentity0 = new object();
            int left = 1;
            object __tsonic_locationIdentity1 = new object();
            int right = 2;
            Tsonic.CSharp.Runtime.Location<int> pointer = flag ? Tsonic.CSharp.Runtime.Location<int>.CreateLocal(__tsonic_locationIdentity0, () => left, __tsonic_param0 => left = __tsonic_param0) : Tsonic.CSharp.Runtime.Location<int>.CreateLocal(__tsonic_locationIdentity1, () => right, __tsonic_param1 => right = __tsonic_param1);
            pointer.Store(3);
            return left + right;
        }
    }
}
`);
});

test("typed-location equality preserves exact carrier identity and undefined", () => {
  const compiled = cleanCompile(`
    import { equalPointer } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";

    export function same<T>(
      left: Pointer<T> | undefined,
      right: Pointer<T> | undefined,
    ): boolean {
      return equalPointer(left, right);
    }

    export function bothMissing(): boolean {
      return equalPointer<int32>(undefined, undefined);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static bool same<T>(Tsonic.CSharp.Runtime.Location<T>? left, Tsonic.CSharp.Runtime.Location<T>? right)
        {
            return Tsonic.CSharp.Runtime.Location<T>.Same(left, right);
        }
        public static bool bothMissing()
        {
            return Tsonic.CSharp.Runtime.Location<int>.Same(null, null);
        }
    }
}
`);
});

test("independently formed addresses retain canonical local, parameter, member, element, and static identity", () => {
  const compiled = cleanCompile(`
    import { addressOf, equalPointer } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    let shared: int32 = 0;

    export class Box {
      value: int32 = 0;

      compare(parameter: int32, values: int32[]): boolean {
        let local: int32 = 0;
        return equalPointer(addressOf(local), addressOf(local)) &&
          equalPointer(addressOf(parameter), addressOf(parameter)) &&
          equalPointer(addressOf(this.value), addressOf(this.value)) &&
          equalPointer(addressOf(values[0]), addressOf(values[0])) &&
          !equalPointer(addressOf(values[0]), addressOf(values[1])) &&
          equalPointer(addressOf(shared), addressOf(shared));
      }
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(occurrences(source, "object __tsonic_locationIdentity0 = new object();"), 1);
  assert.equal(occurrences(source, "object __tsonic_locationIdentity1 = new object();"), 1);
  assert.equal(occurrences(source, "CreateLocal(__tsonic_locationIdentity0"), 2);
  assert.equal(occurrences(source, "CreateLocal(__tsonic_locationIdentity1"), 2);
  assert.equal(occurrences(source, "CreateMember(this,"), 2);
  assert.equal(occurrences(source, "CreateArrayElement(values, 0)"), 3);
  assert.equal(occurrences(source, "CreateArrayElement(values, 1)"), 1);
  assert.equal(occurrences(source, "CreateStatic("), 2);
});

test("source-core value-type fields preserve exact pointee facts and owner write-back", () => {
  const compiled = cleanCompile(`
    import {
      addressOf,
      defaultValue,
      equalPointer,
      field,
      loadPointer,
      storePointer,
      struct,
    } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export const Pair = struct({
      left: field<int32>(),
      right: field<int32>(),
    });

    export function updatePair(): int32 {
      let pair: typeof Pair = defaultValue<typeof Pair>();
      pair.left = 1;
      const first = addressOf(pair.left);
      const second = addressOf(pair.left);
      storePointer(first, 3);
      return equalPointer(first, second) ? loadPointer(second) : pair.right;
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /Location<int>\.Same/u);
  assert.equal(occurrences(source, ".ProjectMember<int>("), 2);
  assert.doesNotMatch(source, /Location<double>|ProjectMember<double>/u);
});

test("source-backed location identities are independent of the absolute project root", () => {
  const sourceText = `
    import {
      addressOf,
      defaultValue,
      equalPointer,
      field,
      struct,
    } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    let shared: int32 = 0;

    export const Pair = struct({
      left: field<int32>(),
      right: field<int32>(),
    });

    export function compare(): boolean {
      let pair: typeof Pair = defaultValue<typeof Pair>();
      return equalPointer(addressOf(shared), addressOf(shared)) &&
        equalPointer(addressOf(pair.left), addressOf(pair.left));
    }
  `;
  const first = cleanCompile(sourceText, {
    projectRoot: "/first-checkout/project",
  });
  const second = cleanCompile(sourceText, {
    projectRoot: "/second-checkout/project",
  });

  assert.deepEqual(first.artifacts, second.artifacts);
  const source = first.artifacts.get("src/Index.cs");
  assert.doesNotMatch(source, /first-checkout|second-checkout/u);
  assert.equal(
    source.includes("source-static-storage\\0index.ts"),
    true,
  );
  assert.equal(source.includes("source-member\\0index.ts"), true);
});

test("lambda, destructured, and per-iteration bindings receive one identity per activation", () => {
  const compiled = cleanCompile(`
    import { addressOf, equalPointer } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareForms(values: int32[]): bool {
      const compare: (value: int32) => bool =
        (value): bool => equalPointer(addressOf(value), addressOf(value));
      let [first] = values;
      let loopSame: bool = true;
      for (let item of values) {
        loopSame = loopSame &&
          equalPointer(addressOf(item), addressOf(item));
        break;
      }
      return compare(first) &&
        equalPointer(addressOf(first), addressOf(first)) &&
        loopSame;
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(occurrences(source, "object __tsonic_locationIdentity"), 3);
  assert.equal(occurrences(source, ".CreateLocal(__tsonic_locationIdentity"), 6);
  assert.match(
    source,
    /\(int value\) =>\s*\{\s*object __tsonic_locationIdentity\d+ = new object\(\);/u,
  );
  assert.match(
    source,
    /foreach \(int __tsonic_forOfItem\d+ in values\)\s*\{\s*int item = __tsonic_forOfItem\d+;\s*object __tsonic_locationIdentity\d+ = new object\(\);/u,
  );
});

test("sibling lambdas isolate local names while retaining captured location identity", () => {
  const compiled = cleanCompile(`
    import { addressOf, equalPointer } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareSiblingLambdas(seed: int32): bool {
      const first: (value: int32) => bool =
        (value): bool => equalPointer(addressOf(value), addressOf(value));
      const second: (value: int32) => bool =
        (value): bool => equalPointer(addressOf(value), addressOf(value));
      const captured: () => bool =
        (): bool => equalPointer(addressOf(seed), addressOf(seed));
      return first(seed) && second(seed) && captured();
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(occurrences(source, "(int value) =>"), 2);
  assert.doesNotMatch(source, /\(int value_\d+\) =>/u);
  assert.match(
    source,
    /CreateLocal\((__tsonic_locationIdentity\d+), \(\) => seed,[\s\S]*CreateLocal\(\1, \(\) => seed,/u,
  );
});

test("loop bindings preserve assignment, lexical, and function-scoped storage identity", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
    import { addressOf, equalPointer } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareLoops(
      values: int32[],
      record: Record<string, int32>,
    ): bool {
      let result: bool = true;
      let assigned: int32 = 0;
      for (assigned of values) {
        result = result &&
          equalPointer(addressOf(assigned), addressOf(assigned));
        break;
      }
      for (let key in record) {
        result = result && equalPointer(addressOf(key), addressOf(key));
        break;
      }
      for (var fromValues of values) {
        result = result &&
          equalPointer(addressOf(fromValues), addressOf(fromValues));
        break;
      }
      for (var fromKeys in record) {
        result = result &&
          equalPointer(addressOf(fromKeys), addressOf(fromKeys));
        break;
      }
      for (var index: int32 = 0; index < 1; index++) {
        result = result && equalPointer(addressOf(index), addressOf(index));
      }
      return result && equalPointer(addressOf(index), addressOf(index));
    }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(
    source,
    /foreach \(int __tsonic_forOfItem\d+ in values\)\s*\{\s*assigned = __tsonic_forOfItem\d+;/u,
  );
  assert.doesNotMatch(source, /foreach \(int assigned in values\)/u);
  assert.match(
    source,
    /foreach \(string __tsonic_forInKeys\d+ in __tsonic_forInTarget\d+\.Keys\)\s*\{\s*string key = __tsonic_forInKeys\d+;\s*object __tsonic_locationIdentity\d+ = new object\(\);/u,
  );
  assert.match(
    source,
    /int fromValues;\s*object (__tsonic_locationIdentity\d+) = new object\(\);\s*foreach \(int __tsonic_forOfItem\d+ in values\)\s*\{\s*fromValues = __tsonic_forOfItem\d+;[\s\S]*?CreateLocal\(\1, \(\) => fromValues,[\s\S]*?CreateLocal\(\1, \(\) => fromValues,/u,
  );
  assert.match(
    source,
    /string fromKeys;\s*object (__tsonic_locationIdentity\d+) = new object\(\);[\s\S]*?foreach \(string __tsonic_forInKeys\d+ in __tsonic_forInTarget\d+\.Keys\)\s*\{\s*fromKeys = __tsonic_forInKeys\d+;[\s\S]*?CreateLocal\(\1, \(\) => fromKeys,[\s\S]*?CreateLocal\(\1, \(\) => fromKeys,/u,
  );
  assert.match(
    source,
    /object (__tsonic_locationIdentity\d+) = new object\(\);\s*int index = 0;\s*for \(; index < 1; index\+\+\)[\s\S]*?CreateLocal\(\1, \(\) => index,[\s\S]*?CreateLocal\(\1, \(\) => index,[\s\S]*?return result && [\s\S]*?CreateLocal\(\1, \(\) => index,[\s\S]*?CreateLocal\(\1, \(\) => index,/u,
  );
});

test("unsupported loop activation identities fail closed before C# emission", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { addressOf } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(): void {
        for (let index: int32 = 0; index < 1; index++) {
          addressOf(index);
        }
      }

      export function rejectDestructuredVar(values: [int32][]): void {
        for (var [item] of values) {
          addressOf(item);
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [
      {
        code: "CSHARP_UNSUPPORTED_AST",
        message: "C# 'location-address' lowering requires one exact finalized typed-location operation. Addressing a for-initializer binding requires one function-scoped 'var' location; per-iteration 'let' locations require a dedicated C# loop-binding representation.",
      },
      {
        code: "CSHARP_UNSUPPORTED_AST",
        message: "C# 'location-address' lowering requires one exact finalized typed-location operation. Addressing a destructured 'var' for-of binding requires a function-scoped destructuring-assignment representation; per-iteration declaration lowering cannot preserve that identity.",
      },
    ],
  );
});

test("address acquisition evaluates reference receivers and indexes exactly once", () => {
  const compiled = cleanCompile(`
    import { addressOf, storePointer } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export class Box { value: int32 = 1; }
    let receiverCalls: int32 = 0;
    let indexCalls: int32 = 0;

    function select(box: Box): Box {
      receiverCalls++;
      return box;
    }

    function index(): int32 {
      indexCalls++;
      return 0;
    }

    export function run(box: Box, values: int32[]): int32 {
      const field = addressOf(select(box).value);
      const element = addressOf(values[index()]);
      storePointer(field, 3);
      storePointer(element, 4);
      return receiverCalls + indexCalls + box.value + values[0];
    }
  `);
  const source = compiled.artifacts.get("src/Index.cs");

  assert.equal(occurrences(source, "Location<int>.CreateMember(select(box),"), 1);
  assert.equal(occurrences(source, "Location<int>.CreateArrayElement(values, index())"), 1);
  assert.equal(occurrences(source, "select(box)"), 1);
  assert.equal(occurrences(source, "index()"), 2);
  assert.match(
    source,
    /__tsonic_param0 => __tsonic_param0\.value, \(__tsonic_param0, __tsonic_param1\) => __tsonic_param0\.value = __tsonic_param1/u,
  );
});

test("typed-location element identity fails closed for indexers without canonical identity policy", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import { addressOf } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(values: Record<string, int32>, key: string): void {
        addressOf(values[key]);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_UNSUPPORTED_AST",
      message: "C# 'location-address' lowering requires one exact finalized typed-location operation. C# typed-location element storage requires the exact built-in array representation; provider and project indexers require an explicit canonical location-identity policy.",
    }],
  );
});

test("selected hash, binding, and projection operations consume exact C# contracts", () => {
  const cases = [
    {
      sourceOperation: "hash-pointer",
      emitted: /Location<int>\.Hash\(pointer\)/u,
      sourceText: `
        import { hashPointer } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        export function hash(pointer: Pointer<int32>): number {
          return hashPointer(pointer);
        }
      `,
    },
    {
      sourceOperation: "bind-pointer",
      emitted: /Location<int>\.Bind\(/u,
      sourceText: `
        import { bindPointer } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        class Identity { value: int32 = 0; }
        export function bind(value: int32): Pointer<int32> {
          let storage = value;
          return bindPointer<int32>(new Identity(), () => storage, next => { storage = next; });
        }
      `,
    },
    {
      sourceOperation: "project-pointer",
      emitted: /Location<int>\.Project<int>\(/u,
      sourceText: `
        import { projectPointer } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        export function project(pointer: Pointer<int32>): Pointer<int32> {
          return projectPointer<int32, int32>(pointer, value => value, value => value);
        }
      `,
    },
  ];

  for (const { sourceText, sourceOperation, emitted } of cases) {
    const compiled = compileCsharpSource({ sourceText });

    assert.equal(compiled.sourceDiagnosticsText, "", sourceOperation);
    assert.deepEqual(compiled.extensionDiagnostics, [], sourceOperation);
    assert.deepEqual(compiled.targetDiagnostics, [], sourceOperation);
    assert.match(compiled.artifacts.get("src/Index.cs"), emitted);
  }
});

test("optional pointer projection retains missingness and evaluates exact callbacks", () => {
  const compiled = cleanCompile(`
    import { projectPointer, hashPointer } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";
    export function project(pointer: Pointer<int32> | undefined): Pointer<int32> | undefined {
      return projectPointer<int32, int32>(pointer, value => value + 1, value => value - 1);
    }
    export function hash(pointer: Pointer<int32> | undefined): number { return hashPointer(pointer); }
  `);
  assert.match(compiled.artifacts.get("src/Index.cs"), /ProjectOptional<int>\(pointer,/u);
  assert.match(compiled.artifacts.get("src/Index.cs"), /Location<int>\.Hash\(pointer\)/u);
});

test("reachability barriers consume selected aliases, not same-spelled local calls", () => {
  const compiled = cleanCompile(`
    import { keepAlive as retain } from "@tsonic/core/lang.js";
    import * as core from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export class System { value: int32 = 0; }
    function keepAlive(value: int32): int32 { return value + 1; }
    export function run(value: int32): int32 {
      retain(value);
      core.keepAlive(value);
      return keepAlive(value);
    }
  `);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(occurrences(output, "global::System.GC.KeepAlive(value)"), 2);
  assert.match(output, /return keepAlive\(value\);/u);
});

test("address-of rejects each readonly or non-storage occurrence independently", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { addressOf } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(): void {
        const value: int32 = 1;
        addressOf(value);
        addressOf(value + 1);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(
    compiled.extensionDiagnostics.map((diagnostic) => ({
      code: diagnostic.publicCode,
      message: diagnostic.message,
    })),
    [
      {
        code: "TSTS_SOURCE_SEMANTICS_0002",
        message: "addressOf(...) requires writable storage.",
      },
      {
        code: "TSTS_SOURCE_SEMANTICS_0002",
        message: "addressOf(...) requires writable storage.",
      },
    ],
  );
  assert.notEqual(
    compiled.extensionDiagnostics[0].identity,
    compiled.extensionDiagnostics[1].identity,
  );
});

test("same-spelled local pointer functions remain ordinary source calls", () => {
  const compiled = cleanCompile(`
    import type { int32 } from "@tsonic/core/types.js";

    function equalPointer(left: int32, right: int32): boolean {
      return left === right;
    }

    function loadPointer(value: int32): int32 {
      return value;
    }

    export function run(value: int32): boolean {
      return equalPointer(loadPointer(value), value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static bool equalPointer(int left, int right)
        {
            return left == right;
        }
        public static int loadPointer(int value)
        {
            return value;
        }
        public static bool run(int value)
        {
            return equalPointer(loadPointer(value), value);
        }
    }
}
`);
});

function cleanCompile(sourceText, options = {}) {
  const compiled = compileCsharpSource({ ...options, sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}

function occurrences(text, fragment) {
  assert.equal(typeof text, "string");
  return text.split(fragment).length - 1;
}
