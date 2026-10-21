import { access } from "node:fs/promises";
import path from "node:path";
import {
  CaatingaError,
  CaatingaErrorCode,
  loadConfig,
  readArtifacts,
  resolveNetwork,
} from "@caatinga/core";
import { npxCli } from "../utils/cli-name.js";
import type { Diagnostic } from "./types.js";

export async function configDiagnostic(): Promise<Diagnostic | undefined> {
  try {
    await loadConfig();
    return { ok: true, label: "caatinga.config.ts found" };
  } catch (error) {
    if (error instanceof CaatingaError) {
      if (error.code === CaatingaErrorCode.DEPENDENCIES_NOT_INSTALLED) {
        // The dependencies diagnostic already owns this line; reporting it here
        // too duplicates "Project dependencies not installed" in doctor output.
        return undefined;
      }

      if (error.code === CaatingaErrorCode.CONFIG_NOT_FOUND) {
        return {
          ok: false,
          label: "caatinga.config.ts not found",
          fix: error.hint ?? "Run this command from a Caatinga project root.",
        };
      }

      if (error.code === CaatingaErrorCode.INVALID_CONFIG) {
        return {
          ok: false,
          label: "caatinga.config.ts is invalid",
          fix: error.hint ?? "Fix schema errors in caatinga.config.ts.",
        };
      }

      return {
        ok: false,
        label: "caatinga.config.ts not ready",
        fix: error.hint ?? "Run this command from a Caatinga project root.",
      };
    }

    return {
      ok: false,
      label: "caatinga.config.ts not ready",
      fix: "Run this command from a Caatinga project root.",
    };
  }
}

export async function artifactsDiagnostic(cwd = process.cwd()): Promise<Diagnostic> {
  try {
    await access(path.resolve(cwd, "caatinga.artifacts.json"));
    await readArtifacts(cwd);
    return { ok: true, label: "caatinga.artifacts.json found" };
  } catch {
    let projectName: string | undefined;
    try {
      const config = await loadConfig({ cwd });
      projectName = config.project;
    } catch {
      for (const configFile of ["caatinga.config.ts", "caatinga.config.js"]) {
        try {
          await access(path.resolve(cwd, configFile));
          projectName = "<project-name>";
          break;
        } catch {
          // not found
        }
      }
    }

    if (projectName) {
      return {
        ok: false,
        label: "caatinga.artifacts.json not found or invalid",
        fix: `Create caatinga.artifacts.json in this directory (e.g. { "project": "${projectName}", "version": 2, "networks": {} }), or run deploy to generate it.`,
      };
    }

    return {
      ok: false,
      label: "caatinga.artifacts.json not found or invalid",
      fix: `Run ${npxCli("init")}, or restore a valid caatinga.artifacts.json file.`,
    };
  }
}

export async function networkDiagnostic(
  networkName: string | undefined
): Promise<Diagnostic | undefined> {
  if (!networkName) {
    return { ok: true, label: "network (skipped — no --network provided)" };
  }

  try {
    const config = await loadConfig();
    const network = resolveNetwork(config, networkName);
    return { ok: true, label: `network ${network.name} found` };
  } catch (error) {
    if (
      error instanceof CaatingaError &&
      (error.code === CaatingaErrorCode.DEPENDENCIES_NOT_INSTALLED ||
        error.code === CaatingaErrorCode.CONFIG_NOT_FOUND)
    ) {
      // The config cannot be loaded for a reason unrelated to the network, so we
      // cannot tell whether the network exists. Skip rather than falsely report
      // it missing; the dependencies/config diagnostics carry the real signal.
      return undefined;
    }

    const hint = error instanceof CaatingaError ? error.hint : undefined;
    return {
      ok: false,
      label: `network ${networkName} not found`,
      fix: hint ?? `Add "${networkName}" to caatinga.config.ts networks.`,
    };
  }
}
