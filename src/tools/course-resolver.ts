import * as z from "zod/v4";

import { listRegularTakenCourses } from "../lms/courses.js";
import type { CourseSummary } from "../lms/types.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { AppContext } from "../mcp/app-context.js";
import type { MjuLmsSsoClient } from "../lms/sso-client.js";

export interface CourseReferenceInput {
  course?: string | undefined;
  kjkey?: string | undefined;
}

export interface ToolSessionExtra {
  sessionId?: string;
}

export const courseReferenceInputSchemaShape = {
  course: z
    .string()
    .optional()
    .describe(
      "강의 KJKEY 또는 강의명입니다. 생략하면 같은 세션에서 마지막으로 사용한 강의를 기본값으로 씁니다."
    ),
  kjkey: z
    .string()
    .optional()
    .describe("기존 KJKEY 입력입니다. course 사용을 권장합니다.")
};

export interface ResolvedCourseReference {
  kjkey: string;
  courseTitle?: string | undefined;
  courseCode?: string | undefined;
  year?: number | undefined;
  term?: number | undefined;
  termLabel?: string | undefined;
  resolvedBy:
    | "kjkey"
    | "course-kjkey"
    | "course-title-latest"
    | "course-code-latest"
    | "course-search-latest"
    | "course-title-all-terms"
    | "course-code-all-terms"
    | "course-search-all-terms"
    | "session-context";
  usedSessionContext: boolean;
}

interface CourseSelection {
  course?: CourseSummary | undefined;
  resolvedBy?:
    | "course-title-latest"
    | "course-code-latest"
    | "course-search-latest"
    | "course-title-all-terms"
    | "course-code-all-terms"
    | "course-search-all-terms"
    | undefined;
  ambiguousCandidates?: CourseSummary[] | undefined;
  ambiguousReason?: string | undefined;
}

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\[\](){}\-_.]/g, "");
}

function looksLikeKjkey(value: string): boolean {
  return /^[A-Za-z0-9]{12,}$/.test(value);
}

function formatCourseCandidates(candidates: CourseSummary[]): string {
  return candidates
    .slice(0, 5)
    .map(
      (course) =>
        `- ${course.termLabel} | ${course.title} | ${course.courseCode} | ${course.professor} | ${course.kjkey}`
    )
    .join("\n");
}

function createAmbiguousCourseError(
  query: string,
  candidates: CourseSummary[],
  reason: string
): Error {
  return new Error(
    [
      `강의 식별자 "${query}" 로 여러 강의가 검색되었습니다. ${reason}`,
      "더 구체적인 강의명이나 KJKEY를 사용해주세요.",
      "",
      formatCourseCandidates(candidates)
    ].join("\n")
  );
}

function createNotFoundCourseError(query: string): Error {
  return new Error(
    [
      `강의 식별자 "${query}" 에 해당하는 강의를 찾지 못했습니다.`,
      "강의명을 더 정확히 입력하거나 KJKEY를 직접 사용해주세요."
    ].join("\n")
  );
}

function pickCourseFromCandidates(
  query: string,
  candidates: CourseSummary[],
  scope: "latest" | "all-terms"
): CourseSelection {
  if (candidates.length === 0) {
    return {};
  }

  const normalizedQuery = normalizeLookupValue(query);
  const exactTitleMatches = candidates.filter(
    (course) => normalizeLookupValue(course.title) === normalizedQuery
  );
  if (exactTitleMatches.length === 1) {
    return {
      course: exactTitleMatches[0]!,
      resolvedBy:
        scope === "latest" ? "course-title-latest" : "course-title-all-terms"
    };
  }
  if (exactTitleMatches.length > 1) {
    return {
      ambiguousCandidates: exactTitleMatches,
      ambiguousReason: "같은 강의명이 여러 개 있습니다."
    };
  }

  const exactCourseCodeMatches = candidates.filter(
    (course) => normalizeLookupValue(course.courseCode) === normalizedQuery
  );
  if (exactCourseCodeMatches.length === 1) {
    return {
      course: exactCourseCodeMatches[0]!,
      resolvedBy:
        scope === "latest" ? "course-code-latest" : "course-code-all-terms"
    };
  }
  if (exactCourseCodeMatches.length > 1) {
    return {
      ambiguousCandidates: exactCourseCodeMatches,
      ambiguousReason: "같은 과목코드에 해당하는 강의가 여러 개 있습니다."
    };
  }

  if (candidates.length === 1) {
    return {
      course: candidates[0]!,
      resolvedBy:
        scope === "latest" ? "course-search-latest" : "course-search-all-terms"
    };
  }

  return {
    ambiguousCandidates: candidates,
    ambiguousReason: "검색 결과가 여러 개 남았습니다."
  };
}

function toResolvedCourseReference(
  course: CourseSummary,
  resolvedBy: NonNullable<CourseSelection["resolvedBy"]>
): ResolvedCourseReference {
  return {
    kjkey: course.kjkey,
    courseTitle: course.title,
    courseCode: course.courseCode,
    year: course.year,
    term: course.term,
    termLabel: course.termLabel,
    resolvedBy,
    usedSessionContext: false
  };
}

export async function resolveCourseReference(
  context: AppContext,
  extra: ToolSessionExtra,
  client: MjuLmsSsoClient,
  credentials: ResolvedLmsCredentials,
  input: CourseReferenceInput
): Promise<ResolvedCourseReference> {
  const kjkey = input.kjkey?.trim();
  const course = input.course?.trim();

  if (kjkey && course) {
    throw new Error("kjkey 와 course 는 동시에 사용할 수 없습니다.");
  }

  if (kjkey) {
    return {
      kjkey,
      resolvedBy: "kjkey",
      usedSessionContext: false
    };
  }

  if (!course) {
    const sessionCourse = context.getLastCourseContext(extra.sessionId);
    if (!sessionCourse) {
      throw new Error(
        "강의 식별자가 없습니다. course 또는 kjkey 를 입력하거나, 같은 세션에서 먼저 강의 관련 조회를 실행해주세요."
      );
    }

    return {
      kjkey: sessionCourse.kjkey,
      courseTitle: sessionCourse.courseTitle,
      courseCode: sessionCourse.courseCode,
      year: sessionCourse.year,
      term: sessionCourse.term,
      termLabel: sessionCourse.termLabel,
      resolvedBy: "session-context",
      usedSessionContext: true
    };
  }

  if (looksLikeKjkey(course)) {
    return {
      kjkey: course,
      resolvedBy: "course-kjkey",
      usedSessionContext: false
    };
  }

  const latestTermResult = await listRegularTakenCourses(client, {
    userId: credentials.userId,
    password: credentials.password,
    search: course
  });
  const latestSelection = pickCourseFromCandidates(
    course,
    latestTermResult.courses,
    "latest"
  );

  if (latestSelection.course && latestSelection.resolvedBy) {
    return toResolvedCourseReference(
      latestSelection.course,
      latestSelection.resolvedBy
    );
  }

  if (latestSelection.ambiguousCandidates) {
    throw createAmbiguousCourseError(
      course,
      latestSelection.ambiguousCandidates,
      latestSelection.ambiguousReason ?? "후보를 하나로 좁히지 못했습니다."
    );
  }

  const allTermsResult = await listRegularTakenCourses(client, {
    userId: credentials.userId,
    password: credentials.password,
    search: course,
    allTerms: true
  });
  const allTermsSelection = pickCourseFromCandidates(
    course,
    allTermsResult.courses,
    "all-terms"
  );

  if (allTermsSelection.course && allTermsSelection.resolvedBy) {
    return toResolvedCourseReference(
      allTermsSelection.course,
      allTermsSelection.resolvedBy
    );
  }

  if (allTermsSelection.ambiguousCandidates) {
    throw createAmbiguousCourseError(
      course,
      allTermsSelection.ambiguousCandidates,
      allTermsSelection.ambiguousReason ?? "후보를 하나로 좁히지 못했습니다."
    );
  }

  throw createNotFoundCourseError(course);
}

export function rememberCourseContext(
  context: AppContext,
  extra: ToolSessionExtra,
  course: {
    kjkey: string;
    courseTitle?: string | undefined;
    courseCode?: string | undefined;
    year?: number | undefined;
    term?: number | undefined;
    termLabel?: string | undefined;
  }
): void {
  context.setLastCourseContext(extra.sessionId, {
    kjkey: course.kjkey,
    ...(course.courseTitle ? { courseTitle: course.courseTitle } : {}),
    ...(course.courseCode ? { courseCode: course.courseCode } : {}),
    ...(course.year !== undefined ? { year: course.year } : {}),
    ...(course.term !== undefined ? { term: course.term } : {}),
    ...(course.termLabel ? { termLabel: course.termLabel } : {})
  });
}
