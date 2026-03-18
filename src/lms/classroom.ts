import { load } from "cheerio";

import {
  LMS_BASE,
  STUDENT_CLASSROOM_ENTER_PATH,
  STUDENT_CLASSROOM_MAIN_URL,
  STUDENT_CLASSROOM_RETURN_URI
} from "./constants.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type { ClassroomContext } from "./types.js";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface ClassroomEnterResponse {
  isError?: boolean;
  message?: string;
  returnURL?: string;
}

function parseClassroomEnterResponse(text: string): ClassroomEnterResponse {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("강의실 진입 응답이 비어 있습니다.");
  }

  try {
    return JSON.parse(trimmed) as ClassroomEnterResponse;
  } catch (error) {
    throw new Error(
      `강의실 진입 응답을 해석하지 못했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function extractCourseTitle(html: string): string | undefined {
  const $ = load(html);
  const title = normalizeText($(".lecture_title").first().text());
  return title || undefined;
}

export async function enterStudentClassroom(
  client: MjuLmsSsoClient,
  kjkey: string
): Promise<ClassroomContext> {
  const response = await client.postForm(
    new URL(STUDENT_CLASSROOM_ENTER_PATH, LMS_BASE).toString(),
    {
      KJKEY: kjkey,
      returnURI: STUDENT_CLASSROOM_RETURN_URI
    }
  );
  const parsed = parseClassroomEnterResponse(response.text);

  if (parsed.isError) {
    throw new Error(parsed.message || "강의실 진입에 실패했습니다.");
  }

  const mainUrl = new URL(
    parsed.returnURL || STUDENT_CLASSROOM_RETURN_URI,
    LMS_BASE
  ).toString();
  const mainResponse = await client.getPage(mainUrl || STUDENT_CLASSROOM_MAIN_URL);
  const courseTitle = extractCourseTitle(mainResponse.text);

  return {
    kjkey,
    mainUrl: mainResponse.url,
    mainHtml: mainResponse.text,
    ...(courseTitle ? { courseTitle } : {})
  };
}
