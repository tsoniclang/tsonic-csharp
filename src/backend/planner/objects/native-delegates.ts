import type { CsharpPlanningContext } from "../context.js";
import type { CsharpOutputSourceFile } from "../../artifact-model/output.js";
import type { CsharpInterfaceMethodDeclaration, CsharpParameter, CsharpTypeDeclaration, CsharpTypeParameter } from "../../target-ast/syntax/index.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { CsharpRepresentedTypeParameter } from "../../../target-model/types/generic-constraints.js";
import type { CsharpNativeCallableEmissionMember } from "../../../target-model/records/callables/native-delegates.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../types/type-parameters.js";
import { finalizeCsharpCompilationUnit } from "../program/compilation-unit.js";
import { csharpTypeSafetyModifiers } from "../safety/explicit-safety.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpNativeDelegateFile(input: CsharpPlanningContext):
  { readonly source: CsharpOutputSourceFile; readonly requiresUnsafe: boolean } | undefined {
  const declarations: CsharpTypeDeclaration[] = [];
  let requiresUnsafe = false;
  for (const record of input.program.records.nativeDelegates.get()) {
    const names = new Map(record.typeParameters.map((parameter, index) => [parameter.identity, `T${index}`]));
    const owner = csharpTypeFromTargetTypeRef(record.carrier, names);
    if (owner?.kind !== "IdentifierName") failCsharpPlannerInvariant(
      "A Native callable requires its exact physical declaration name.", record.site);
    const typeParameters = (parameters: readonly CsharpRepresentedTypeParameter[], scope: ReadonlyMap<string, string>): readonly CsharpTypeParameter[] =>
      parameters.map(selected => ({ name: scope.get(selected.identity)
        ?? failCsharpPlannerInvariant("A Native callable binder requires its exact scoped name.", record.site),
        constraints: selected.csharpConstraints.constraints.map(constraint =>
          csharpGenericConstraintFromTargetTypeParameterConstraint(scope, constraint, record.site, [])) }));
    const parameter = (selected: CsharpTargetParameter, scope: ReadonlyMap<string, string>): CsharpParameter => {
      const type = csharpTypeFromTargetTypeRef(selected.type, scope)
        ?? failCsharpPlannerInvariant("A Native callable requires its exact physical parameter type.", record.site);
      const mode = selected.passingMode;
      if (mode !== "by-value" && mode !== "byref-readwrite" && mode !== "byref-readonly" && mode !== "byref-writeonly-must-init") {
        failCsharpPlannerInvariant("A Native callable declaration requires a selected legal CLR passing mode.", record.site);
      }
      return { name: selected.name, type,
        ...(mode === "by-value" ? selected.paramsArray ? { isParams: true } : {}
          : { passing: mode === "byref-readwrite" ? "ref" as const : mode === "byref-readonly" ? "in" as const : "out" as const }) };
    };
    let unsafe = false;
    const method = (member: CsharpNativeCallableEmissionMember): CsharpInterfaceMethodDeclaration => {
      const scope = new Map(names);
      member.typeParameters.forEach((selected, index) => scope.set(selected.identity, `M${index}`));
      const returned = csharpTypeFromTargetTypeRef(member.signature.returnType, scope)
        ?? failCsharpPlannerInvariant("A Native callable requires its exact physical result type.", record.site);
      unsafe ||= [member.signature.returnType, ...member.parameters.map(value => value.type),
        ...(member.receiver === undefined ? [] : [member.receiver.type])]
        .some(type => csharpTypeSafetyModifiers(input, type).includes("unsafe"));
      return { kind: "MethodDeclaration", name: member.name, typeParameters: typeParameters(member.typeParameters, scope),
        returnType: returned, ...(member.signature.returnPassing === undefined ? {} : {
          returnPassing: member.signature.returnPassing === "byref-readwrite" ? "ref" as const : "ref-readonly" as const }),
        parameters: [...(member.receiver === undefined ? [] : [parameter(member.receiver, scope)]),
          ...member.parameters.map(selected => parameter(selected, scope))] };
    };
    const members = record.members.map(method);
    const modifiers = ["public" as const, ...(unsafe ? ["unsafe" as const] : [])];
    if (record.kind === "delegate") {
      const member = members[0];
      if (members.length !== 1 || member === undefined || member.typeParameters?.length !== 0) {
        failCsharpPlannerInvariant("A Native delegate requires exactly one nongeneric invocation signature.", record.site);
      }
      declarations.push({ kind: "DelegateDeclaration", name: owner.name, modifiers,
        typeParameters: typeParameters(record.typeParameters, names), returnType: member.returnType,
        ...(member.returnPassing === undefined ? {} : { returnPassing: member.returnPassing }), parameters: member.parameters });
    } else {
      declarations.push({ kind: "InterfaceDeclaration", name: owner.name, modifiers,
        typeParameters: typeParameters(record.typeParameters, names), members });
    }
    requiresUnsafe ||= unsafe;
  }
  if (declarations.length === 0) return undefined;
  const finalized = finalizeCsharpCompilationUnit({ kind: "CompilationUnit", usings: [],
    members: [{ kind: "NamespaceDeclaration", name: input.program.records.compilation.get().namespace, members: declarations }] }, requiresUnsafe);
  return { source: { path: "generated/TsonicNativeDelegates.cs", unit: finalized.unit }, requiresUnsafe: finalized.requiresUnsafe };
}
