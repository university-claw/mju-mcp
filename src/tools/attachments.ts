import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  downloadAssignmentAttachment,
  downloadMaterialAttachment,
  downloadNoticeAttachment
} from "../lms/attachment-downloads.js";
import type { AppContext } from "../mcp/app-context.js";
import {
  courseReferenceInputSchemaShape,
  rememberCourseContext,
  resolveCourseReference
} from "./course-resolver.js";
import { requireCredentials } from "./credentials.js";

function formatDownloadText(result: {
  fileName: string;
  savedPath: string;
  byteLength: number;
  statusCode: number;
  contentType?: string;
}): string {
  const lines = [
    `다운로드 완료: ${result.fileName}`,
    `저장 경로: ${result.savedPath}`,
    `크기: ${result.byteLength} bytes`,
    `응답 코드: ${result.statusCode}`
  ];

  if (result.contentType) {
    lines.push(`형식: ${result.contentType}`);
  }

  return lines.join("\n");
}

export function registerAttachmentTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_download_attachment",
    {
      title: "첨부파일 로컬 다운로드",
      description:
        "공지, 자료, 과제 첨부파일을 로컬 디렉터리에 저장합니다. assignment는 prompt/submission 첨부를 모두 지원하며, course 또는 kjkey 를 생략하면 같은 세션의 마지막 강의를 사용합니다.",
      inputSchema: {
        kind: z
          .enum(["notice", "material", "assignment"])
          .describe("다운로드 대상 종류입니다."),
        ...courseReferenceInputSchemaShape,
        articleId: z
          .number()
          .int()
          .optional()
          .describe("공지/자료의 ARTL_NUM 입니다."),
        rtSeq: z
          .number()
          .int()
          .optional()
          .describe("과제의 RT_SEQ 입니다."),
        attachmentIndex: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("0부터 시작하는 첨부 인덱스입니다. 기본값은 0입니다."),
        attachmentKind: z
          .enum(["prompt", "submission"])
          .optional()
          .describe("assignment일 때 첨부 종류입니다. 기본값은 prompt입니다."),
        outputDir: z
          .string()
          .optional()
          .describe("기본 다운로드 경로 대신 사용할 로컬 디렉터리입니다.")
      },
      outputSchema: {
        fileName: z.string(),
        savedPath: z.string(),
        finalUrl: z.string(),
        sourceUrl: z.string(),
        byteLength: z.number().int(),
        statusCode: z.number().int(),
        contentType: z.string().optional(),
        contentDisposition: z.string().optional()
      }
    },
    async ({
      kind,
      course,
      kjkey,
      articleId,
      rtSeq,
      attachmentIndex,
      attachmentKind,
      outputDir
    }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );

      let result;
      switch (kind) {
        case "notice":
          if (articleId === undefined) {
            throw new Error("공지 첨부 다운로드에는 articleId 가 필요합니다.");
          }
          result = await downloadNoticeAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleId,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "material":
          if (articleId === undefined) {
            throw new Error("자료 첨부 다운로드에는 articleId 가 필요합니다.");
          }
          result = await downloadMaterialAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleId,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "assignment":
          if (rtSeq === undefined) {
            throw new Error("과제 첨부 다운로드에는 rtSeq 가 필요합니다.");
          }
          result = await downloadAssignmentAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            rtSeq,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(attachmentKind ? { attachmentKind } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
      }
      rememberCourseContext(context, extra, {
        kjkey: resolvedCourse.kjkey,
        courseTitle: resolvedCourse.courseTitle,
        courseCode: resolvedCourse.courseCode,
        year: resolvedCourse.year,
        term: resolvedCourse.term,
        termLabel: resolvedCourse.termLabel
      });

      return {
        content: [
          {
            type: "text",
            text: formatDownloadText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );
}
