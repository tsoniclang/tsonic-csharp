import type { CsharpPublishedNativeCallBinding } from "../../../policy/operations/source-profiles/published-calls.js";

export const csharpPublishedNativeCalls: readonly CsharpPublishedNativeCallBinding[] = Object.freeze([
  ...["Array", "ReadonlyArray"].flatMap(declaringName => [
    { source: { owner: "js" as const, kind: "member" as const, declaringName, name: "sort" },
      targetId: "Tsonic.CSharp.Js.JSArray.sort", targetName: "sort", receiver: "js-array" as const },
    { source: { owner: "js" as const, kind: "member" as const, declaringName, name: "toSorted" },
      targetId: "Tsonic.CSharp.Js.JSArray.toSorted", targetName: "toSorted", receiver: "js-array" as const },
  ]),
  { source: { owner: "js", kind: "member", declaringName: "TypedArray", name: "sort" },
    targetId: "Tsonic.CSharp.Js.TypedArray.sort", targetName: "sort", receiver: "typed-array" },
]);
