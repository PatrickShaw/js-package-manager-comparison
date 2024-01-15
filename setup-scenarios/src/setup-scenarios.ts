#!/usr/bin/env -S ts-node -T

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { merge } from "lodash";
import { rimraf } from "rimraf";

const readJson = async (filePath: string) => {
  const data = await readFile(filePath, { encoding: "utf-8" });

  return JSON.parse(data);
};

const rootDir = resolve(__dirname, "../..");
const testProjectsPath = resolve(rootDir, "test-projects");

export type ProjectData = {
  projectPath: string;
};

const createProject = async (projectName: string): Promise<ProjectData> => {
  const projectPath = resolve(rootDir, testProjectsPath, projectName);

  await mkdir(projectPath);

  return { projectPath };
};

type OnProjectCallback = (project: NodeProjectData) => Promise<NodeProjectData>;

const createProjects = async (projectName: string) => {
  const scriptlessProjectPath = resolve(
    testProjectsPath,
    `${projectName}-scriptless`
  );
  const mixedProjectPath = resolve(testProjectsPath, `${projectName}-mixed`);

  const postInstallScriptsProjectPath = resolve(
    testProjectsPath,
    `${projectName}-postInstallScriptsOnly`
  );

  await Promise.all([
    createProject(scriptlessProjectPath),
    createProject(mixedProjectPath),
    createProject(postInstallScriptsProjectPath),
  ]);

  return {
    scriptlessProjectPath,
    postInstallScriptsProjectPath,
    mixedProjectPath,
  };
};
export type NodeProjectData = ProjectData & {
  packageJson: Record<string, any>;
};

const install = async (strings: TemplateStringsArray, ...args: string[]) => {
  const { $ } = await import("zx");

  return process.env.INSTALL === "true" ? $(strings, ...args) : undefined;
};

const main = async () => {
  await rimraf(testProjectsPath);
  await mkdir(testProjectsPath);

  const [
    scriptlessDependenciesPackageJson,
    postInstallScriptsDependenciesPackageJson,
  ] = await Promise.all([
    readJson(resolve(__dirname, "no-post-install-scripts-packages.json")),
    readJson(resolve(__dirname, "post-install-scripts-packages.json")),
  ]);

  const createPackageJson = (partial: Record<string, any>) => {
    return merge(
      {
        // Name the all exactly the same - Can't have extra bytes getting in the way of fairness now can we? :3
        name: "test-project",
      },
      partial
    );
  };

  const createNodeProject = async (
    projectName: string,
    onProjectCreated: OnProjectCallback
  ) => {
    const {
      scriptlessProjectPath,
      postInstallScriptsProjectPath,
      mixedProjectPath,
    } = await createProjects(projectName);

    const scriptlessProject: NodeProjectData = {
      projectPath: scriptlessProjectPath,
      packageJson: createPackageJson(scriptlessDependenciesPackageJson),
    };

    const mixedProject: NodeProjectData = {
      projectPath: mixedProjectPath,
      packageJson: createPackageJson(
        merge(
          scriptlessDependenciesPackageJson,
          postInstallScriptsDependenciesPackageJson
        )
      ),
    };

    const postInstallScriptsProject: NodeProjectData = {
      projectPath: postInstallScriptsProjectPath,
      packageJson: createPackageJson(postInstallScriptsDependenciesPackageJson),
    };

    await Promise.all(
      [mixedProject, scriptlessProject, postInstallScriptsProject].map(
        async (project): Promise<void> => {
          await writeFile(
            resolve(project.projectPath, "package.json"),
            JSON.stringify(project.packageJson),
            {
              encoding: "utf-8",
            }
          );
        }
      )
    );

    const finalScriptlessProject = await onProjectCreated(scriptlessProject);
    const finalPostInstallScriptsProject = await onProjectCreated(
      postInstallScriptsProject
    );

    const finalMixedProject = await onProjectCreated(mixedProject);
  };

  const createYarnBerryProject = async (
    projectName: string,
    onProject: OnProjectCallback
  ) => {
    await createNodeProject("yarn-berry-pnp", async (project) => {
      const { $, cd, within } = await import("zx");

      await within(async () => {
        cd(project.projectPath);

        await $`yarn set version 4.0.2`;

        await onProject(project);

        await install`yarn install`;
      });

      return project;
    });
  };
};

main();
