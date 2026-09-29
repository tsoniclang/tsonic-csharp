import type { Node, SourceFile } from "@tsonic/tsts";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { createTsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";
import { diagnoseCsharpAttributeTypeValues } from "./type-validation.js";
import type { CsharpAttributeApplication, CsharpAttributeApplicationIndex } from "./model.js";

const emptyApplications: readonly CsharpAttributeApplication[] = Object.freeze([]);

export function analyzeCsharpAttributeApplications(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
): { readonly index: CsharpAttributeApplicationIndex; readonly diagnostics: readonly TargetDiagnostic[] } {
  const applications = createTsonicAttributeApplicationFactIndex({
    ast: source.ast, sourceFiles, sourceFacts: source.sourceFacts,
  });
  const diagnostics = [...diagnoseCsharpAttributeTypeValues(source, applications)];
  const byDeclaration = new Map<Node, CsharpAttributeApplication[]>();
  const reject = (message: string, subject?: Node): void => {
    diagnostics.push({ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION", category: "error", source: "tsonic-csharp",
      message: `C# attribute application ${message}`, ...(subject === undefined ? {} : { sourceNode: subject }) });
  };
  for (const application of applications.all) {
    const invocation = isAstNode(source.ast, application.invocation) ? application.invocation : undefined;
    const target = isAstNode(source.ast, application.applicationTarget) ? application.applicationTarget : undefined;
    if (target === undefined) {
      reject("must carry an AST application target from finalized TSTS facts before C# emission.", invocation);
      continue;
    }
    const selected = isAstNode(source.ast, application.selectedMember) ? application.selectedMember
      : source.navigation.referenceFor(target)?.declaration ?? source.navigation.declarationFor(target);
    if (selected === undefined) {
      reject("target must resolve to a project source declaration from finalized TSTS facts before C# emission.", invocation);
      continue;
    }
    const selectedKind = source.ast.kindName(selected);
    const memberKind = application.applicationMemberKind;
    if (memberKind !== undefined && !memberKindMatches(memberKind, selectedKind)) {
      reject(`uses a ${memberKind} selector whose exact selected declaration is ${selectedKind}.`, invocation);
      continue;
    }
    const declaration = application.applicationPlacement !== "constructor" || source.ast.is.IsConstructorDeclaration(selected)
      ? selected : source.ast.members(selected).find(member => member !== undefined && source.ast.is.IsConstructorDeclaration(member));
    if (declaration === undefined) {
      reject("requires an explicit source constructor declaration; implicit default constructors have no finalized source declaration to attach attributes to.", invocation);
      continue;
    }
    const subject = application.applicationParameterName === undefined ? declaration
      : source.ast.parameters(declaration).find(parameter => parameter !== undefined &&
        source.ast.text(source.ast.name(parameter)) === application.applicationParameterName);
    if (subject === undefined) {
      reject(`could not find parameter '${application.applicationParameterName}' on the finalized source declaration target.`, invocation);
      continue;
    }
    const specifier = application.applicationTargetSpecifier;
    if (specifier !== undefined && !isTargetSpecifier(specifier)) {
      reject(`uses unsupported explicit target specifier '${specifier}'. Supported C# attribute target specifiers are 'field', 'property', 'param', and 'return'.`, invocation);
      continue;
    }
    if (specifier !== undefined && !targetSpecifierSupportsSubject(specifier, source.ast.kindName(subject))) {
      reject(`uses explicit target specifier '${specifier}' on ${source.ast.kindName(subject)}, which is outside the finalized C# attribute placement surface.`, invocation);
      continue;
    }
    if (invocation === undefined) continue;
    const applicationFact = Object.freeze({ invocation, ...(specifier === undefined ? {} : { targetSpecifier: specifier }) });
    const selectedApplications = byDeclaration.get(subject);
    if (selectedApplications === undefined) byDeclaration.set(subject, [applicationFact]);
    else selectedApplications.push(applicationFact);
  }
  for (const selectedApplications of byDeclaration.values()) Object.freeze(selectedApplications);
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    index: Object.freeze({
      forDeclaration: (declaration: Node) => byDeclaration.get(declaration) ?? emptyApplications,
      isErasedSubject: (subject: Node) => applications.forSubject(subject) !== undefined,
    }),
  });
}

function memberKindMatches(member: "property" | "method", kind: string): boolean {
  return member === "property"
    ? kind === "KindPropertyDeclaration" || kind === "KindPropertySignature" || kind === "KindGetAccessor" || kind === "KindSetAccessor"
    : kind === "KindMethodDeclaration" || kind === "KindMethodSignature" || kind === "KindFunctionDeclaration";
}

function isTargetSpecifier(specifier: string): specifier is NonNullable<CsharpAttributeApplication["targetSpecifier"]> {
  return specifier === "field" || specifier === "property" || specifier === "param" || specifier === "return";
}

function targetSpecifierSupportsSubject(specifier: NonNullable<CsharpAttributeApplication["targetSpecifier"]>, kind: string): boolean {
  switch (specifier) {
    case "field": return kind === "KindPropertyDeclaration";
    case "property": return memberKindMatches("property", kind);
    case "param": return kind === "KindParameter";
    case "return": return memberKindMatches("method", kind);
  }
}
