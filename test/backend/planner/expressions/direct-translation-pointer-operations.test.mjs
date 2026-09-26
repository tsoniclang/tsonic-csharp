import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("raw pointer identity preserves optional address carriers through parameters and returns", () => {
  const compiled = cleanCompile(`
    import { equalrawptr as same, hashrawptr } from "@tsonic/core/lang.js";
    import type { RawPointer } from "@tsonic/core/types.js";
    type Address = RawPointer;
    function pass(value: Address | undefined): Address | undefined { return value; }
    export function check(left: Address | undefined, right: Address | undefined): boolean {
      return same(pass(left), pass(right)) && hashrawptr(left) === hashrawptr(right);
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
    import { addressof, allocateptr, loadptr, storeptr } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";

    function increment(pointer: Pointer<int32>): void {
      storeptr(pointer, loadptr(pointer) + 1);
    }

    function create(): Pointer<int32> {
      return allocateptr<int32>(40);
    }

    export function run(): int32 {
      let local: int32 = 1;
      const alias = addressof(local);
      increment(alias);
      const allocated = create();
      increment(allocated);
      return local + loadptr(allocated);
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
    import { addressof, loadptr, storeptr } from "@tsonic/core/lang.js";
    import type { bool, int32, Pointer } from "@tsonic/core/types.js";

    export function replace<T>(pointer: Pointer<T>, value: T): T {
      storeptr(pointer, value);
      return loadptr(pointer);
    }

    export function choose(flag: bool): int32 {
      let left: int32 = 1;
      let right: int32 = 2;
      const pointer = flag ? addressof(left) : addressof(right);
      storeptr(pointer, 3);
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
    import { equalptr } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";

    export function same<T>(
      left: Pointer<T> | undefined,
      right: Pointer<T> | undefined,
    ): boolean {
      return equalptr(left, right);
    }

    export function bothMissing(): boolean {
      return equalptr<int32>(undefined, undefined);
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
    import { addressof, equalptr } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    let shared: int32 = 0;

    export class Box {
      value: int32 = 0;

      compare(parameter: int32, values: int32[]): boolean {
        let local: int32 = 0;
        return equalptr(addressof(local), addressof(local)) &&
          equalptr(addressof(parameter), addressof(parameter)) &&
          equalptr(addressof(this.value), addressof(this.value)) &&
          equalptr(addressof(values[0]), addressof(values[0])) &&
          !equalptr(addressof(values[0]), addressof(values[1])) &&
          equalptr(addressof(shared), addressof(shared));
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
      addressof,
      defaultvalue,
      equalptr,
      field,
      loadptr,
      storeptr,
      struct,
    } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export const Pair = struct({
      left: field<int32>(),
      right: field<int32>(),
    });

    export function updatePair(): int32 {
      let pair: typeof Pair = defaultvalue<typeof Pair>();
      pair.left = 1;
      const first = addressof(pair.left);
      const second = addressof(pair.left);
      storeptr(first, 3);
      return equalptr(first, second) ? loadptr(second) : pair.right;
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
      addressof,
      defaultvalue,
      equalptr,
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
      let pair: typeof Pair = defaultvalue<typeof Pair>();
      return equalptr(addressof(shared), addressof(shared)) &&
        equalptr(addressof(pair.left), addressof(pair.left));
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
    import { addressof, equalptr } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareForms(values: int32[]): bool {
      const compare: (value: int32) => bool =
        (value): bool => equalptr(addressof(value), addressof(value));
      let [first] = values;
      let loopSame: bool = true;
      for (let item of values) {
        loopSame = loopSame &&
          equalptr(addressof(item), addressof(item));
        break;
      }
      return compare(first) &&
        equalptr(addressof(first), addressof(first)) &&
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
    import { addressof, equalptr } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareSiblingLambdas(seed: int32): bool {
      const first: (value: int32) => bool =
        (value): bool => equalptr(addressof(value), addressof(value));
      const second: (value: int32) => bool =
        (value): bool => equalptr(addressof(value), addressof(value));
      const captured: () => bool =
        (): bool => equalptr(addressof(seed), addressof(seed));
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
    import { addressof, equalptr } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function compareLoops(
      values: int32[],
      record: Record<string, int32>,
    ): bool {
      let result: bool = true;
      let assigned: int32 = 0;
      for (assigned of values) {
        result = result &&
          equalptr(addressof(assigned), addressof(assigned));
        break;
      }
      for (let key in record) {
        result = result && equalptr(addressof(key), addressof(key));
        break;
      }
      for (var fromValues of values) {
        result = result &&
          equalptr(addressof(fromValues), addressof(fromValues));
        break;
      }
      for (var fromKeys in record) {
        result = result &&
          equalptr(addressof(fromKeys), addressof(fromKeys));
        break;
      }
      for (var index: int32 = 0; index < 1; index++) {
        result = result && equalptr(addressof(index), addressof(index));
      }
      return result && equalptr(addressof(index), addressof(index));
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
      import { addressof } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(): void {
        for (let index: int32 = 0; index < 1; index++) {
          addressof(index);
        }
      }

      export function rejectDestructuredVar(values: [int32][]): void {
        for (var [item] of values) {
          addressof(item);
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
    import { addressof, storeptr } from "@tsonic/core/lang.js";
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
      const field = addressof(select(box).value);
      const element = addressof(values[index()]);
      storeptr(field, 3);
      storeptr(element, 4);
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
      import { addressof } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(values: Record<string, int32>, key: string): void {
        addressof(values[key]);
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
        import { hashptr } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        export function hash(pointer: Pointer<int32>): number {
          return hashptr(pointer);
        }
      `,
    },
    {
      sourceOperation: "bind-pointer",
      emitted: /Location<int>\.Bind\(/u,
      sourceText: `
        import { bindptr } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        class Identity { value: int32 = 0; }
        export function bind(value: int32): Pointer<int32> {
          let storage = value;
          return bindptr<int32>(new Identity(), () => storage, next => { storage = next; });
        }
      `,
    },
    {
      sourceOperation: "project-pointer",
      emitted: /Location<int>\.Project<int>\(/u,
      sourceText: `
        import { projectptr } from "@tsonic/core/lang.js";
        import type { int32, Pointer } from "@tsonic/core/types.js";

        export function project(pointer: Pointer<int32>): Pointer<int32> {
          return projectptr<int32, int32>(pointer, value => value, value => value);
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
    import { projectptr, hashptr } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";
    export function project(pointer: Pointer<int32> | undefined): Pointer<int32> | undefined {
      return projectptr<int32, int32>(pointer, value => value + 1, value => value - 1);
    }
    export function hash(pointer: Pointer<int32> | undefined): number { return hashptr(pointer); }
    export function missing(): number { return hashptr<int32>(undefined); }
  `);
  assert.match(compiled.artifacts.get("src/Index.cs"), /ProjectOptional<int>\(pointer,/u);
  assert.match(compiled.artifacts.get("src/Index.cs"), /Location<int>\.Hash\(pointer\)/u);
  assert.match(compiled.artifacts.get("src/Index.cs"), /Location<int>\.Hash\(null\)/u);
});

for (const localName of ["keepAlive", "keepalive"]) {
  test(`reachability barriers consume selected aliases, not local ${localName} calls`, () => {
    const compiled = cleanCompile(`
    import { keepalive as retain } from "@tsonic/core/lang.js";
    import * as core from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export class System { value: int32 = 0; }
    function ${localName}(value: int32): int32 { return value + 1; }
    export function run(value: int32): int32 {
      retain(value);
      core.keepalive(value);
      return ${localName}(value);
    }
  `);
    const output = compiled.artifacts.get("src/Index.cs");
    assert.equal(occurrences(output, "global::System.GC.KeepAlive(value)"), 2);
    assert.match(output, new RegExp(`return ${localName}\\(value\\);`, "u"));
  });
}

test("address-of rejects each readonly or non-storage occurrence independently", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { addressof } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(): void {
        const value: int32 = 1;
        addressof(value);
        addressof(value + 1);
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
        message: "addressof(...) requires writable storage.",
      },
      {
        code: "TSTS_SOURCE_SEMANTICS_0002",
        message: "addressof(...) requires writable storage.",
      },
    ],
  );
  assert.notEqual(
    compiled.extensionDiagnostics[0].identity,
    compiled.extensionDiagnostics[1].identity,
  );
});

test("address-of rejects imported constants before target planning", () => {
  const compiled = compileCsharpSource({ files: {
    "values.ts": `export const fixed = 7;`,
    "exports.ts": `export { fixed } from "./values.js";`,
  }, sourceText: `
    import { addressof } from "@tsonic/core/lang.js";
    import { fixed } from "./values.js";
    import { fixed as alias } from "./exports.js";
    export function reject(): void { addressof(fixed); addressof(alias); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics.map(diagnostic => diagnostic.publicCode),
    ["TSTS_SOURCE_SEMANTICS_0002", "TSTS_SOURCE_SEMANTICS_0002"]);
  assert.equal(compiled.artifacts.size, 0);
});

for (const [equalityName, loadName] of [["equalPointer", "loadPointer"], ["equalptr", "loadptr"]]) {
  test(`local ${equalityName}/${loadName} pointer functions remain ordinary source calls`, () => {
    const compiled = cleanCompile(`
    import type { int32 } from "@tsonic/core/types.js";

    function ${equalityName}(left: int32, right: int32): boolean {
      return left === right;
    }

    function ${loadName}(value: int32): int32 {
      return value;
    }

    export function run(value: int32): boolean {
      return ${equalityName}(${loadName}(value), value);
    }
  `);

    assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static bool ${equalityName}(int left, int right)
        {
            return left == right;
        }
        public static int ${loadName}(int value)
        {
            return value;
        }
        public static bool run(int value)
        {
            return ${equalityName}(${loadName}(value), value);
        }
    }
}
`);
  });
}

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
