import path from "node:path";

export function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return slug || "project";
}

function normalizeInputPath(inputPath: string): string {
  return inputPath.replace(/\/+$/g, "") || "/";
}

export function projectSlugForPath(inputPath: string): string {
  const normalizedPath = normalizeInputPath(inputPath);
  const projectName = path.basename(normalizedPath);
  return slugifyProjectName(projectName);
}

export function computeTmuxSessionName(inputPath: string, piSessionId: string): string {
  return `pi-${projectSlugForPath(inputPath)}-${piSessionId}`;
}
