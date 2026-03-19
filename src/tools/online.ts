import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  getCourseOnlineWeek,
  listCourseOnlineWeeks
} from "../lms/online.js";
import type {
  GetOnlineWeekOptions,
  ListOnlineWeeksOptions
} from "../lms/online.js";
import type {
  OnlineWeekDetailResult,
  OnlineWeekListResult
} from "../lms/types.js";
import type { AppContext } from "../mcp/app-context.js";
import {
  courseReferenceInputSchemaShape,
  rememberCourseContext,
  resolveCourseReference
} from "./course-resolver.js";
import { requireCredentials } from "./credentials.js";

const onlineWeekSchema = {
  lectureWeeks: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  statusLabel: z.string().optional(),
  statusText: z.string().optional()
};

const onlineItemSchema = {
  linkSeq: z.number().int(),
  title: z.string(),
  progressPercent: z.number().optional(),
  inPeriodProgressPercent: z.number().optional(),
  outOfPeriodProgressPercent: z.number().optional(),
  learningTime: z.string().optional(),
  attendanceTime: z.string().optional(),
  qnaCount: z.number().int().optional(),
  stampCount: z.number().int().optional(),
  thumbnailUrl: z.string().optional()
};

const onlineLaunchFormSchema = {
  action: z.string(),
  lectureWeeks: z.number().int(),
  kjkey: z.string(),
  kjLectType: z.string().optional()
};

function formatOnlineWeekListText(result: OnlineWeekListResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;

  if (result.weeks.length === 0) {
    return `${courseLabel} 강의에는 조회 가능한 온라인 학습 주차가 없습니다.`;
  }

  const lines = [`${courseLabel} 온라인 학습 주차 ${result.weeks.length}건`];

  for (const week of result.weeks) {
    const meta = [
      week.weekLabel,
      week.statusLabel && week.statusText
        ? `${week.statusLabel} ${week.statusText}`
        : week.statusText
    ].filter(Boolean);

    lines.push(`- [${week.lectureWeeks}] ${week.title}`);
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function formatOnlineWeekDetailText(result: OnlineWeekDetailResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;
  const title = result.title
    ? `[${result.lectureWeeks}] ${result.title}`
    : `[${result.lectureWeeks}] 온라인 학습`;
  const lines = [title, `강의: ${courseLabel}`];

  if (result.weekLabel) {
    lines.push(`주차: ${result.weekLabel}`);
  }
  if (result.attendanceLabel) {
    lines.push(`출석부 반영일: ${result.attendanceLabel}`);
  }
  if (result.studyPeriod) {
    lines.push(`학습인정기간: ${result.studyPeriod}`);
  }

  if (result.warningMessages.length > 0) {
    lines.push("주의사항");
    for (const message of result.warningMessages) {
      lines.push(`- ${message}`);
    }
  }

  lines.push(`학습 아이템: ${result.items.length}개`);
  for (const item of result.items) {
    const meta = [
      item.learningTime ? `학습시간 ${item.learningTime}` : undefined,
      item.attendanceTime ? `출석인정 ${item.attendanceTime}` : undefined,
      item.progressPercent !== undefined ? `진행 ${item.progressPercent}%` : undefined
    ].filter(Boolean);

    lines.push(`- [link_seq=${item.linkSeq}] ${item.title}`);
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export function registerOnlineTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_list_online_weeks",
    {
      title: "온라인 학습 주차 조회",
      description:
        "특정 강의의 온라인 학습 주차 목록을 조회합니다. course 또는 kjkey 를 입력할 수 있고, 둘 다 없으면 같은 세션의 마지막 강의를 사용합니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        weeks: z.array(z.object(onlineWeekSchema))
      }
    },
    async ({ course, kjkey }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const options: ListOnlineWeeksOptions = {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey
      };
      const result = await listCourseOnlineWeeks(client, options);
      rememberCourseContext(context, extra, {
        kjkey: result.kjkey,
        courseTitle: result.courseTitle ?? resolvedCourse.courseTitle,
        courseCode: resolvedCourse.courseCode,
        year: resolvedCourse.year,
        term: resolvedCourse.term,
        termLabel: resolvedCourse.termLabel
      });

      return {
        content: [
          {
            type: "text",
            text: formatOnlineWeekListText(result)
          }
        ],
        structuredContent: result as OnlineWeekListResult & Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_get_online_week",
    {
      title: "온라인 학습 메타 조회",
      description:
        "특정 온라인 학습 주차의 메타 정보와 학습 아이템 목록을 조회합니다. course 또는 kjkey 를 입력할 수 있고, 둘 다 없으면 같은 세션의 마지막 강의를 사용합니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        lectureWeeks: z.number().int().describe("조회할 온라인 학습의 LECTURE_WEEKS 값입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        lectureWeeks: z.number().int(),
        title: z.string().optional(),
        week: z.number().int().optional(),
        weekLabel: z.string().optional(),
        statusLabel: z.string().optional(),
        statusText: z.string().optional(),
        attendanceLabel: z.string().optional(),
        studyPeriod: z.string().optional(),
        warningMessages: z.array(z.string()),
        launchForm: z.object(onlineLaunchFormSchema),
        items: z.array(z.object(onlineItemSchema))
      }
    },
    async ({ course, kjkey, lectureWeeks }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const options: GetOnlineWeekOptions = {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        lectureWeeks
      };
      const result = await getCourseOnlineWeek(client, options);
      rememberCourseContext(context, extra, {
        kjkey: result.kjkey,
        courseTitle: result.courseTitle ?? resolvedCourse.courseTitle,
        courseCode: resolvedCourse.courseCode,
        year: resolvedCourse.year,
        term: resolvedCourse.term,
        termLabel: resolvedCourse.termLabel
      });

      return {
        content: [
          {
            type: "text",
            text: formatOnlineWeekDetailText(result)
          }
        ],
        structuredContent: result as OnlineWeekDetailResult & Record<string, unknown>
      };
    }
  );
}
