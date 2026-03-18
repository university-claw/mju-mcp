import path from "node:path";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";

export interface LmsRuntimeConfig {
  userId: string | undefined;
  password: string | undefined;
  sessionFile: string;
  mainHtmlFile: string;
  coursesFile: string;
  userAgent: string;
}

export interface LmsRuntimeConfigOverrides {
  userId?: string | undefined;
  password?: string | undefined;
  sessionFile?: string | undefined;
  mainHtmlFile?: string | undefined;
  coursesFile?: string | undefined;
  userAgent?: string | undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveLmsRuntimeConfig(
  overrides: LmsRuntimeConfigOverrides = {}
): LmsRuntimeConfig {
  const workspaceRoot = process.cwd();

  return {
    userId: clean(overrides.userId ?? process.env.MJU_LMS_USER_ID),
    password: clean(overrides.password ?? process.env.MJU_LMS_PASSWORD),
    sessionFile: path.resolve(
      overrides.sessionFile ??
        process.env.MJU_LMS_SESSION_FILE ??
        path.join(workspaceRoot, ".cache", "mju-lms-session.json")
    ),
    mainHtmlFile: path.resolve(
      overrides.mainHtmlFile ??
        process.env.MJU_LMS_MAIN_HTML_FILE ??
        path.join(workspaceRoot, ".cache", "mju-lms-main.html")
    ),
    coursesFile: path.resolve(
      overrides.coursesFile ??
        process.env.MJU_LMS_COURSES_FILE ??
        path.join(workspaceRoot, ".cache", "mju-lms-courses.json")
    ),
    userAgent:
      clean(overrides.userAgent ?? process.env.MJU_LMS_USER_AGENT) ??
      DEFAULT_USER_AGENT
  };
}
