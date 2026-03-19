import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  checkAssignmentSubmission,
  deleteAssignment,
  submitAssignment
} from "../lms/assignment-submit.js";
import type {
  AssignmentDeleteResult,
  AssignmentSubmitCheckResult,
  AssignmentSubmitResult
} from "../lms/types.js";
import type { AppContext } from "../mcp/app-context.js";
import {
  courseReferenceInputSchemaShape,
  rememberCourseContext,
  resolveCourseReference
} from "./course-resolver.js";
import { requireCredentials } from "./credentials.js";

const WRITE_APPROVAL_TTL_MS = 5 * 60 * 1000;

const draftFileSchema = {
  path: z.string(),
  fileName: z.string(),
  exists: z.boolean(),
  sizeBytes: z.number().int().optional(),
  withinMaxFileSize: z.boolean().optional(),
  blockingReason: z.string().optional()
};

const existingAttachmentSchema = {
  fileSeq: z.string(),
  name: z.string(),
  sizeBytes: z.number().int().optional(),
  contentSeq: z.string().optional()
};

const uploadedFileSchema = {
  path: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  fileSeq: z.string()
};

const submitToolOutputSchema = {
  status: z.enum(["approval-required", "submitted"]),
  requiresApproval: z.boolean(),
  approvalToken: z.string().optional(),
  approvalExpiresAt: z.string().optional(),
  approvalMessage: z.string().optional(),
  kjkey: z.string(),
  rtSeq: z.number().int(),
  title: z.string(),
  courseTitle: z.string().optional(),
  submissionFormat: z.string().optional(),
  submissionMode: z.enum(["initial-submit", "update-submit"]),
  submittedTextLength: z.number().int(),
  usedExistingTextFallback: z.boolean().optional(),
  existingAttachmentCount: z.number().int().optional(),
  localFiles: z.array(z.object(draftFileSchema)).optional(),
  uploadedFiles: z.array(z.object(uploadedFileSchema)).optional(),
  submitUrl: z.string().optional(),
  verified: z.boolean().optional(),
  alreadySubmittedBeforeSubmit: z.boolean().optional(),
  finalSubmissionStatus: z.string().optional(),
  finalSubmittedAt: z.string().optional(),
  finalSubmissionText: z.string().optional(),
  finalSubmissionAttachmentCount: z.number().int().optional(),
  warnings: z.array(z.string())
};

const deleteToolOutputSchema = {
  status: z.enum(["approval-required", "deleted"]),
  requiresApproval: z.boolean(),
  approvalToken: z.string().optional(),
  approvalExpiresAt: z.string().optional(),
  approvalMessage: z.string().optional(),
  kjkey: z.string(),
  rtSeq: z.number().int(),
  title: z.string(),
  courseTitle: z.string().optional(),
  deleteUrl: z.string().optional(),
  hadSubmission: z.boolean(),
  existingSubmissionStatus: z.string().optional(),
  verified: z.boolean().optional(),
  finalHasSubmission: z.boolean().optional(),
  finalHasSubmitButton: z.boolean().optional(),
  warnings: z.array(z.string())
};

async function resolveDraftText(
  inlineText: string | undefined,
  textFilePath: string | undefined
): Promise<string | undefined> {
  const text = inlineText?.trim();
  const filePath = textFilePath?.trim();

  if (text && filePath) {
    throw new Error("text 와 textFilePath 는 동시에 사용할 수 없습니다.");
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return text || undefined;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createSubmitApprovalFingerprint(
  checkResult: AssignmentSubmitCheckResult,
  effectiveText: string
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action: "assignment-submit",
        kjkey: checkResult.kjkey,
        rtSeq: checkResult.rtSeq,
        submissionMode: checkResult.submissionMode,
        effectiveTextHash: hashText(effectiveText),
        localFiles: checkResult.localFiles.map((file) => ({
          path: file.path,
          exists: file.exists,
          sizeBytes: file.sizeBytes ?? null
        }))
      })
    )
    .digest("hex");
}

function createDeleteApprovalFingerprint(params: {
  kjkey: string;
  rtSeq: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action: "assignment-delete",
        kjkey: params.kjkey,
        rtSeq: params.rtSeq
      })
    )
    .digest("hex");
}

function resolveEffectiveDraftText(
  checkResult: AssignmentSubmitCheckResult,
  draftText: string | undefined
): string {
  if (draftText !== undefined) {
    return draftText;
  }

  return checkResult.existingSubmissionHtml ?? checkResult.existingSubmissionText ?? "";
}

function ensureConfirmFlag(confirm: boolean): void {
  if (confirm !== true) {
    throw new Error("실제 쓰기 흐름에 들어가려면 confirm=true 가 필요합니다.");
  }
}

function formatAssignmentCheckText(result: {
  title: string;
  submissionMode: string;
  canProceed: boolean;
  hasSubmitButton: boolean;
  hasDeleteButton: boolean;
  blockingReasons: string[];
  warnings: string[];
}): string {
  const lines = [
    `${result.title}`,
    `제출 모드: ${result.submissionMode}`,
    `진행 가능: ${result.canProceed ? "예" : "아니오"}`,
    `제출/수정 버튼: ${result.hasSubmitButton ? "있음" : "없음"}`,
    `삭제 버튼: ${result.hasDeleteButton ? "있음" : "없음"}`
  ];

  if (result.blockingReasons.length > 0) {
    lines.push(`차단 사유 ${result.blockingReasons.length}건`);
    for (const reason of result.blockingReasons) {
      lines.push(`- ${reason}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`경고 ${result.warnings.length}건`);
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function formatAssignmentSubmitApprovalText(result: {
  title: string;
  courseTitle?: string | undefined;
  kjkey: string;
  submissionMode: string;
  submittedTextLength: number;
  existingAttachmentCount: number;
  localFiles: AssignmentSubmitCheckResult["localFiles"];
  approvalExpiresAt: string;
}): string {
  const lines = [
    `승인 필요: ${result.title}`,
    `강의: ${result.courseTitle ? `${result.courseTitle} (${result.kjkey})` : result.kjkey}`,
    `제출 모드: ${result.submissionMode}`,
    `제출 본문 길이: ${result.submittedTextLength}`,
    `기존 제출 첨부 수: ${result.existingAttachmentCount}`,
    `추가 로컬 첨부 수: ${result.localFiles.length}`,
    `승인 만료 시각: ${result.approvalExpiresAt}`,
    "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 제출/수정 제출이 실행됩니다."
  ];

  return lines.join("\n");
}

function formatAssignmentSubmitText(result: {
  title: string;
  submissionMode: string;
  verified: boolean;
  submitUrl: string;
  finalSubmissionStatus?: string;
  finalSubmittedAt?: string;
  finalSubmissionAttachmentCount?: number;
}): string {
  const lines = [
    `${result.title}`,
    `제출 모드: ${result.submissionMode}`,
    `검증 성공: ${result.verified ? "예" : "아니오"}`,
    `제출 URL: ${result.submitUrl}`
  ];

  if (result.finalSubmissionStatus) {
    lines.push(`최종 상태: ${result.finalSubmissionStatus}`);
  }
  if (result.finalSubmittedAt) {
    lines.push(`최종 제출 시각: ${result.finalSubmittedAt}`);
  }
  if (result.finalSubmissionAttachmentCount !== undefined) {
    lines.push(`최종 첨부 수: ${result.finalSubmissionAttachmentCount}`);
  }

  return lines.join("\n");
}

function formatAssignmentDeleteApprovalText(result: {
  title: string;
  courseTitle?: string | undefined;
  kjkey: string;
  hadSubmission: boolean;
  existingSubmissionStatus?: string | undefined;
  approvalExpiresAt: string;
}): string {
  const lines = [
    `승인 필요: ${result.title} 제출 삭제`,
    `강의: ${result.courseTitle ? `${result.courseTitle} (${result.kjkey})` : result.kjkey}`,
    `제출 흔적 있음: ${result.hadSubmission ? "예" : "아니오"}`,
    `승인 만료 시각: ${result.approvalExpiresAt}`
  ];

  if (result.existingSubmissionStatus) {
    lines.push(`현재 제출 상태: ${result.existingSubmissionStatus}`);
  }

  lines.push(
    "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 삭제가 실행됩니다."
  );
  return lines.join("\n");
}

function formatAssignmentDeleteText(result: {
  title: string;
  verified: boolean;
  finalHasSubmission: boolean;
  finalHasSubmitButton: boolean;
}): string {
  return [
    `${result.title}`,
    `삭제 검증 성공: ${result.verified ? "예" : "아니오"}`,
    `삭제 후 제출 정보 남아있음: ${result.finalHasSubmission ? "예" : "아니오"}`,
    `삭제 후 제출하기 버튼 복구: ${result.finalHasSubmitButton ? "예" : "아니오"}`
  ].join("\n");
}

function rememberResolvedCourseFromResult(
  context: AppContext,
  extra: { sessionId?: string },
  resolvedCourse: Awaited<ReturnType<typeof resolveCourseReference>>,
  result: {
    kjkey: string;
    courseTitle?: string | undefined;
  }
): void {
  rememberCourseContext(context, extra, {
    kjkey: result.kjkey,
    courseTitle: result.courseTitle ?? resolvedCourse.courseTitle,
    courseCode: resolvedCourse.courseCode,
    year: resolvedCourse.year,
    term: resolvedCourse.term,
    termLabel: resolvedCourse.termLabel
  });
}

function buildSubmitApprovalResult(
  checkResult: AssignmentSubmitCheckResult,
  approval: ReturnType<AppContext["issueWriteApproval"]>
): Record<string, unknown> {
  return {
    status: "approval-required",
    requiresApproval: true,
    approvalToken: approval.token,
    approvalExpiresAt: approval.expiresAt,
    approvalMessage:
      "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 제출/수정 제출이 실행됩니다.",
    kjkey: checkResult.kjkey,
    rtSeq: checkResult.rtSeq,
    title: checkResult.title,
    ...(checkResult.courseTitle ? { courseTitle: checkResult.courseTitle } : {}),
    ...(checkResult.submissionFormat
      ? { submissionFormat: checkResult.submissionFormat }
      : {}),
    submissionMode: checkResult.submissionMode,
    submittedTextLength: checkResult.effectiveTextLength,
    usedExistingTextFallback: checkResult.usedExistingTextFallback,
    existingAttachmentCount: checkResult.existingAttachments.length,
    localFiles: checkResult.localFiles,
    warnings: checkResult.warnings
  };
}

function buildSubmittedResult(result: AssignmentSubmitResult): Record<string, unknown> {
  return {
    status: "submitted",
    requiresApproval: false,
    kjkey: result.kjkey,
    rtSeq: result.rtSeq,
    title: result.title,
    ...(result.courseTitle ? { courseTitle: result.courseTitle } : {}),
    ...(result.submissionFormat ? { submissionFormat: result.submissionFormat } : {}),
    submissionMode: result.submissionMode,
    submittedTextLength: result.submittedTextLength,
    uploadedFiles: result.uploadedFiles,
    submitUrl: result.submitUrl,
    verified: result.verified,
    alreadySubmittedBeforeSubmit: result.alreadySubmittedBeforeSubmit,
    ...(result.finalSubmissionStatus
      ? { finalSubmissionStatus: result.finalSubmissionStatus }
      : {}),
    ...(result.finalSubmittedAt ? { finalSubmittedAt: result.finalSubmittedAt } : {}),
    ...(result.finalSubmissionText
      ? { finalSubmissionText: result.finalSubmissionText }
      : {}),
    ...(result.finalSubmissionAttachmentCount !== undefined
      ? { finalSubmissionAttachmentCount: result.finalSubmissionAttachmentCount }
      : {}),
    warnings: result.warnings
  };
}

function buildDeleteApprovalResult(
  checkResult: AssignmentSubmitCheckResult,
  approval: ReturnType<AppContext["issueWriteApproval"]>
): Record<string, unknown> {
  return {
    status: "approval-required",
    requiresApproval: true,
    approvalToken: approval.token,
    approvalExpiresAt: approval.expiresAt,
    approvalMessage:
      "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 삭제가 실행됩니다.",
    kjkey: checkResult.kjkey,
    rtSeq: checkResult.rtSeq,
    title: checkResult.title,
    ...(checkResult.courseTitle ? { courseTitle: checkResult.courseTitle } : {}),
    hadSubmission: checkResult.alreadySubmitted,
    ...(checkResult.existingSubmissionStatus
      ? { existingSubmissionStatus: checkResult.existingSubmissionStatus }
      : {}),
    ...(checkResult.deleteUrl ? { deleteUrl: checkResult.deleteUrl } : {}),
    warnings: checkResult.warnings
  };
}

function buildDeletedResult(result: AssignmentDeleteResult): Record<string, unknown> {
  return {
    status: "deleted",
    requiresApproval: false,
    kjkey: result.kjkey,
    rtSeq: result.rtSeq,
    title: result.title,
    ...(result.courseTitle ? { courseTitle: result.courseTitle } : {}),
    deleteUrl: result.deleteUrl,
    hadSubmission: result.hadSubmission,
    verified: result.verified,
    finalHasSubmission: result.finalHasSubmission,
    finalHasSubmitButton: result.finalHasSubmitButton,
    warnings: result.warnings
  };
}

export function registerAssignmentActionTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_check_assignment_submission",
    {
      title: "과제 제출 가능 여부 점검",
      description:
        "초기 제출 또는 재제출 가능한 과제인지 확인하고, 수정/삭제 버튼과 제출 스펙을 함께 점검합니다. course 또는 kjkey 를 생략하면 같은 세션의 마지막 강의를 사용합니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        text: z.string().optional().describe("검증할 제출 본문 HTML 또는 텍스트입니다."),
        textFilePath: z
          .string()
          .optional()
          .describe("검증할 본문을 읽을 로컬 파일 경로입니다."),
        localFiles: z
          .array(z.string())
          .optional()
          .describe("검증할 로컬 첨부파일 경로 배열입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        rtSeq: z.number().int(),
        courseTitle: z.string().optional(),
        title: z.string(),
        submissionFormat: z.string().optional(),
        dueAt: z.string().optional(),
        summaryStatusLabel: z.string().optional(),
        summaryStatusText: z.string().optional(),
        submissionMode: z.enum(["initial-submit", "update-submit"]),
        alreadySubmitted: z.boolean(),
        existingSubmissionStatus: z.string().optional(),
        existingSubmissionHtml: z.string().optional(),
        existingSubmissionText: z.string().optional(),
        existingAttachments: z.array(z.object(existingAttachmentSchema)),
        hasSubmitButton: z.boolean(),
        submitButtonLabel: z.string().optional(),
        submitPopupUrl: z.string().optional(),
        requiresTextInput: z.boolean(),
        textFieldName: z.string().optional(),
        hasFilePicker: z.boolean(),
        uploadUrl: z.string().optional(),
        uploadPath: z.string().optional(),
        uploadPfStFlag: z.string().optional(),
        submitCheckUrl: z.string().optional(),
        submitCheckDiv: z.string().optional(),
        submitUrl: z.string().optional(),
        submitContentSeq: z.string().optional(),
        hasDeleteButton: z.boolean(),
        deleteButtonLabel: z.string().optional(),
        deleteSubmitCheckUrl: z.string().optional(),
        deleteSubmitCheckDiv: z.string().optional(),
        deleteUrl: z.string().optional(),
        deleteContentSeq: z.string().optional(),
        uploadLimitMessage: z.string().optional(),
        maxFileSizeLabel: z.string().optional(),
        maxFileSizeBytes: z.number().int().optional(),
        providedTextLength: z.number().int(),
        effectiveTextLength: z.number().int(),
        usedExistingTextFallback: z.boolean(),
        providedTextSatisfiesRequirement: z.boolean(),
        localFiles: z.array(z.object(draftFileSchema)),
        canProceed: z.boolean(),
        blockingReasons: z.array(z.string()),
        warnings: z.array(z.string())
      }
    },
    async ({ course, kjkey, rtSeq, text, textFilePath, localFiles }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const draftText = await resolveDraftText(text, textFilePath);
      const result = await checkAssignmentSubmission(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq,
        ...(draftText ? { text: draftText } : {}),
        ...(localFiles && localFiles.length > 0 ? { localFiles } : {})
      });
      rememberResolvedCourseFromResult(context, extra, resolvedCourse, result);

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentCheckText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_submit_assignment",
    {
      title: "과제 제출 또는 재제출",
      description:
        "초기 제출 또는 수정 제출을 실제로 수행합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 실행됩니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        text: z.string().optional().describe("제출할 본문 HTML 또는 텍스트입니다."),
        textFilePath: z
          .string()
          .optional()
          .describe("제출 본문을 읽을 로컬 파일 경로입니다."),
        localFiles: z
          .array(z.string())
          .optional()
          .describe("추가할 로컬 첨부파일 경로 배열입니다."),
        confirm: z
          .boolean()
          .describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z
          .string()
          .optional()
          .describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: submitToolOutputSchema
    },
    async (
      { course, kjkey, rtSeq, text, textFilePath, localFiles, confirm, approvalToken },
      extra
    ) => {
      ensureConfirmFlag(confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const draftText = await resolveDraftText(text, textFilePath);
      const checkResult = await checkAssignmentSubmission(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq,
        ...(draftText ? { text: draftText } : {}),
        ...(localFiles && localFiles.length > 0 ? { localFiles } : {})
      });
      rememberResolvedCourseFromResult(context, extra, resolvedCourse, checkResult);

      const effectiveText = resolveEffectiveDraftText(checkResult, draftText);
      const fingerprint = createSubmitApprovalFingerprint(checkResult, effectiveText);

      if (!approvalToken) {
        if (!checkResult.canProceed) {
          throw new Error(formatAssignmentCheckText(checkResult));
        }

        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "assignment-submit",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });
        const previewResult = buildSubmitApprovalResult(checkResult, approval);

        return {
          content: [
            {
              type: "text",
              text: formatAssignmentSubmitApprovalText({
                title: checkResult.title,
                courseTitle: checkResult.courseTitle ?? resolvedCourse.courseTitle,
                kjkey: checkResult.kjkey,
                submissionMode: checkResult.submissionMode,
                submittedTextLength: checkResult.effectiveTextLength,
                existingAttachmentCount: checkResult.existingAttachments.length,
                localFiles: checkResult.localFiles,
                approvalExpiresAt: approval.expiresAt
              })
            }
          ],
          structuredContent: previewResult
        };
      }

      context.consumeWriteApproval(extra.sessionId, approvalToken, {
        action: "assignment-submit",
        fingerprint
      });

      const result = await submitAssignment(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq,
        confirm,
        ...(draftText ? { text: draftText } : {}),
        ...(localFiles && localFiles.length > 0 ? { localFiles } : {})
      });
      rememberResolvedCourseFromResult(context, extra, resolvedCourse, result);

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentSubmitText(result)
          }
        ],
        structuredContent: buildSubmittedResult(result)
      };
    }
  );

  server.registerTool(
    "mju_lms_delete_assignment_submission",
    {
      title: "과제 제출 삭제",
      description:
        "이미 제출된 과제의 제출 내역을 삭제합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 실행됩니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        confirm: z
          .boolean()
          .describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z
          .string()
          .optional()
          .describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: deleteToolOutputSchema
    },
    async ({ course, kjkey, rtSeq, confirm, approvalToken }, extra) => {
      ensureConfirmFlag(confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const checkResult = await checkAssignmentSubmission(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq
      });
      rememberResolvedCourseFromResult(context, extra, resolvedCourse, checkResult);

      const fingerprint = createDeleteApprovalFingerprint({
        kjkey: checkResult.kjkey,
        rtSeq: checkResult.rtSeq
      });

      if (!approvalToken) {
        if (!checkResult.alreadySubmitted || !checkResult.hasDeleteButton || !checkResult.deleteUrl) {
          throw new Error(formatAssignmentCheckText(checkResult));
        }

        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "assignment-delete",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });
        const previewResult = buildDeleteApprovalResult(checkResult, approval);

        return {
          content: [
            {
              type: "text",
              text: formatAssignmentDeleteApprovalText({
                title: checkResult.title,
                courseTitle: checkResult.courseTitle ?? resolvedCourse.courseTitle,
                kjkey: checkResult.kjkey,
                hadSubmission: checkResult.alreadySubmitted,
                existingSubmissionStatus: checkResult.existingSubmissionStatus,
                approvalExpiresAt: approval.expiresAt
              })
            }
          ],
          structuredContent: previewResult
        };
      }

      context.consumeWriteApproval(extra.sessionId, approvalToken, {
        action: "assignment-delete",
        fingerprint
      });

      const result = await deleteAssignment(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: resolvedCourse.kjkey,
        rtSeq,
        confirm
      });
      rememberResolvedCourseFromResult(context, extra, resolvedCourse, result);

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentDeleteText(result)
          }
        ],
        structuredContent: buildDeletedResult(result)
      };
    }
  );
}
