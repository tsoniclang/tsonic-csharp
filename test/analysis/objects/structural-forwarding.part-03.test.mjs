import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpDelegateTargetType, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/structural-implementation.js";
import { planCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/declarations/interfaces/structural.js";
import { analyzeCsharpStructuralInterfaceEmission } from "../../../dist/analysis/declarations/structural-interfaces.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { printCsharpCompilationUnit } from "../../../dist/print/source/index.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { instantiateCsharpInheritedCallable } from "../../../dist/analysis/callables/generics/instantiation.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../../../dist/analysis/objects/structural-forwarding.js";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { csharpCopiedObjectShapeMembers } from "../../../dist/policy/types/objects/method-environments.js";
import { selectCsharpObjectMethodImplementation } from "../../../dist/analysis/objects/shapes/method-implementations.js";
import { selectCsharpObjectMemberEmission } from "../../../dist/policy/types/objects/object-members.js";
import { unexpectedNativeDispatchRead, emptyNativeDispatch, integer, noAuthoredNativeMethod, defaultEvidenceFixture, structuralInterfaceRecords, sourceContract, fixture, nativeBoundBase, nativeBoundDerived, genericBoundFixture, programs, nativeModes, adaptedNativeForwarder, nativeProofSource, buildNativeProof, buildNativeProject, genericCases, genericSource } from "./structural-forwarding.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [group, controls, presentFunction] of Array.from([
    ["complete", genericCases, "anonymous"],
    ["independent named", genericCases.filter(control => control.name !== "anonymous" && control.name !== "outer"), "named"],
  ]).slice(0, 2)) {
test(`${group} generic source project matches handwritten native observations and allocation costs (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericSource(controls) });
    assert.equal(compiled.result.diagnostics.length, 0,
      `generic project: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const observations = controls.map(control => `
if (Tsonic.Generated.Index.${control.name}(false) != 7 || Tsonic.Generated.Index.${control.name}(true) != 11)
    throw new System.Exception("${control.name}: omission, present value or single body call");`).join("\n");
    const program = `${observations}
for (int index = 0; index < 4096; index++) { _ = Tsonic.Generated.Index.named(false); _ = Tsonic.Generated.Index.${presentFunction}(true); _ = NativeBaseline.Read(false); }
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread();
long generatedSum = 0;
for (int index = 0; index < 4096; index++) generatedSum += Tsonic.Generated.Index.named(false) + Tsonic.Generated.Index.${presentFunction}(true);
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread();
long nativeSum = 0;
for (int index = 0; index < 4096; index++) nativeSum += NativeBaseline.Read(false) + NativeBaseline.Read(true);
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 4096L * 18 || nativeSum != generatedSum || generatedBytes != nativeBytes)
    throw new System.Exception($"native cost mismatch: generated={generatedBytes}, native={nativeBytes}, sums={generatedSum}/{nativeSum}");
System.Console.Write($"generic native-equivalent; generated={generatedBytes}; native={nativeBytes}");
interface NativeView { int read<T>(int? value); }
sealed class NativeBody : NativeView {
    public int Calls;
    public int read(int? value = null) { Calls++; return value ?? 7; }
    int NativeView.read<T>(int? value) { return this.read(value); }
}
static class NativeBaseline {
    public static int Read(bool present) {
        var body = new NativeBody(); NativeView view = body;
        int value = present ? view.read<string>(11) : view.read<string>(null);
        if (body.Calls != 1) return -100;
        return value;
    }
}`;
    const proof = buildNativeProject(`generic-source-${group}-${surface}`, program, compiled.artifacts);
    writeFileSync(join(proof.root, "source.ts"), genericSource(controls));
    assert.equal(proof.build.status, 0, `complete native generic project: ${String(proof.build.stdout).slice(-4096)}`);
    const executed = proof.run();
    assert.equal(executed.status, 0, `generic observations/cost: ${String(executed.stderr).slice(-4096)}`);
    assert.equal(/^generic native-equivalent; generated=\d+; native=\d+$/u.test(executed.stdout), true,
      "native allocations match exactly after warmup; no measured tolerance or wrapper allowance");
    const omitted = new Map([...compiled.artifacts].map(([path, text]) => [path,
      path.endsWith(".cs") ? text.replace(/(\bint [^()\r\n]+\.read)<[^>]+>(\(int\? )/gu, "$1$2") : text]));
    assert.equal([...omitted].some(([path, text]) => text !== compiled.artifacts.get(path)), true,
      "the native red changes an actual generated destination declaration, never a build-model error");
    const negative = buildNativeProject(`generic-omitted-binder-${group}-${surface}`, program, omitted);
    assert.equal(negative.build.status === 0, false, "the otherwise identical complete project cannot omit the destination binder");
    assert.equal(/error CS(?:0535|0539)/u.test(String(negative.build.stdout)), true,
      "Roslyn rejects the missing explicit generic implementation, not an unrelated compiler failure");
  });
}
}
