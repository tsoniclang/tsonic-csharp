import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import type {
  TargetSourcePackageGraph,
} from "@tsonic/target-api";
import {
  projectSourceNodeIdentity,
} from "@tsonic/target-api/source";
import { relative, resolve } from "node:path";

export interface CsharpSourceIdentityPolicy {
  node(node: Node | undefined): string | undefined;
}

export function createCsharpSourceIdentityPolicy(
  ast: AstReader,
  projectRoot: string,
  sourcePackages: TargetSourcePackageGraph,
): CsharpSourceIdentityPolicy {
  return Object.freeze({
    node(node: Node | undefined): string | undefined {
      return projectSourceNodeIdentity(ast, node, projectRoot) ??
        sourcePackageNodeIdentity(ast, node, sourcePackages);
    },
  });
}

function sourcePackageNodeIdentity(
  ast: AstReader,
  node: Node | undefined,
  sourcePackages: TargetSourcePackageGraph,
): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const kind = ast.kind(node);
  if (sourceFile === undefined || kind === undefined) {
    return undefined;
  }
  const fileName = resolve(ast.getFileName(sourceFile));
  const sourcePackage = sourcePackages.packages.find((candidate) =>
    candidate.sourceFiles.some((candidateFile) => resolve(candidateFile) === fileName)
  );
  if (sourcePackage === undefined) {
    return undefined;
  }
  const relativeName = normalizePath(relative(
    resolve(sourcePackage.sourceRoot),
    fileName,
  ));
  if (
    relativeName.length === 0 ||
    relativeName === "." ||
    relativeName === ".." ||
    relativeName.startsWith("../")
  ) {
    return undefined;
  }
  return [
    sourcePackage.id,
    relativeName,
    kind,
    ast.pos(node),
    ast.end(node),
  ].join("\u0000");
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}
