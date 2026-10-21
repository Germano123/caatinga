import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CaatingaError, CaatingaErrorCode } from "../errors/CaatingaError.js";
import {
  CaatingaArtifactsSchema,
  CURRENT_ARTIFACTS_SCHEMA_VERSION,
  type CaatingaArtifacts,
} from "./artifact.schema.js";

export async function readArtifacts(cwd = process.cwd()): Promise<CaatingaArtifacts> {
  const artifactsPath = path.resolve(cwd, "caatinga.artifacts.json");

  try {
    const json = await readFile(artifactsPath, "utf8");
    const parsedJson = JSON.parse(json);

    if (parsedJson && typeof parsedJson === "object" && "version" in parsedJson) {
      const version = Number(parsedJson.version);
      if (version > CURRENT_ARTIFACTS_SCHEMA_VERSION) {
        throw new CaatingaError(
          `caatinga.artifacts.json version ${version} is not supported by this CLI version.`,
          CaatingaErrorCode.ARTIFACT_INVALID,
          "Upgrade your @caatinga/cli package to the latest version to support this artifacts schema version."
        );
      }
    }

    return CaatingaArtifactsSchema.parse(parsedJson);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      let projectName: string | undefined;
      for (const configFile of ["caatinga.config.ts", "caatinga.config.js"]) {
        try {
          const configContent = await readFile(path.resolve(cwd, configFile), "utf8");
          const match = configContent.match(/project\s*:\s*["'`]([^"'`]+)["'`]/);
          projectName = match ? match[1] : "<project-name>";
          break;
        } catch {
          // not found
        }
      }

      const hint = projectName
        ? `Create caatinga.artifacts.json in this directory (e.g. { "project": "${projectName}", "version": 2, "networks": {} }), or run deploy to generate it.`
        : "Run ctg init, or create the artifacts file before deploying or generating bindings.";

      throw new CaatingaError(
        "caatinga.artifacts.json was not found.",
        CaatingaErrorCode.ARTIFACT_NOT_FOUND,
        hint
      );
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new CaatingaError(
        "caatinga.artifacts.json is invalid.",
        CaatingaErrorCode.ARTIFACT_INVALID,
        "Fix the JSON shape before running Caatinga commands."
      );
    }

    throw error;
  }
}
