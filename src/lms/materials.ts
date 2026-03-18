import { load } from "cheerio";

import { parseActivityListItems } from "./activity-list.js";
import {
  STUDENT_ACTIVITY_LIST_URL,
  STUDENT_MATERIAL_VIEW_URL
} from "./constants.js";
import {
  extractAttachmentRequestParams,
  fetchAttachments
} from "./attachments.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  ActivityQnaTarget,
  MaterialDetailResult,
  MaterialListResult,
  MaterialSummary
} from "./types.js";

export interface ListMaterialsOptions {
  userId: string;
  password: string;
  kjkey: string;
  week?: number;
}

export interface GetMaterialOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleId: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

export function parseMaterialListHtml(
  html: string,
  options: { week?: number } = {}
): MaterialSummary[] {
  return parseActivityListItems(html)
    .filter((item) => item.menuId === "lecture_material")
    .filter((item) => options.week === undefined || item.week === options.week)
    .map((item) => ({
      articleId: item.activityId,
      title: item.title,
      ...(item.week !== undefined ? { week: item.week } : {}),
      ...(item.weekLabel ? { weekLabel: item.weekLabel } : {}),
      ...(item.attachmentCount !== undefined
        ? { attachmentCount: item.attachmentCount }
        : {})
    }));
}

function parseDetailMeta(html: string): Map<string, string> {
  const $ = load(html);
  const meta = new Map<string, string>();

  $("table.bbsview tr").each((_, element) => {
    const row = $(element);
    const label = normalizeText(row.find("th").first().text());
    const value = normalizeText(row.find("td").first().text());

    if (label && value) {
      meta.set(label, value);
    }
  });

  return meta;
}

function parseMaterialBody(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
} {
  const $ = load(html);
  const title = normalizeText($(".view_title").first().text());
  const bodyNode = $("td.textviewer").first();
  const editorNode = bodyNode.find(".editor_content").first();
  const bodyHtml = editorNode.length > 0
    ? editorNode.html()?.trim() ?? ""
    : bodyNode
        .clone()
        .find(".attach_container")
        .remove()
        .end()
        .html()
        ?.trim() ?? "";
  const bodyText = editorNode.length > 0
    ? normalizeText(editorNode.text())
    : normalizeText(
        bodyNode
          .clone()
          .find(".attach_container")
          .remove()
          .end()
          .text()
      );

  return {
    title,
    bodyHtml,
    bodyText
  };
}

function extractQnaTarget(html: string): ActivityQnaTarget | undefined {
  const match = html.match(
    /T_MENU_ID\s*:\s*"([^"]+)"[\s\S]*?T_ARTL_NUM\s*:\s*"([^"]+)"[\s\S]*?T_SUB_ARTL_NUM\s*:\s*"([^"]*)"/
  );
  const menuId = match?.[1]?.trim();
  const articleId = parsePositiveInt(match?.[2]);
  const subArticleId = match?.[3]?.trim();

  if (!menuId || articleId === undefined) {
    return undefined;
  }

  return {
    menuId,
    articleId,
    ...(subArticleId ? { subArticleId } : {})
  };
}

export async function listCourseMaterials(
  client: MjuLmsSsoClient,
  options: ListMaterialsOptions
): Promise<MaterialListResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.postForm(STUDENT_ACTIVITY_LIST_URL, {
    MENU_ID: "",
    ARTL_NUM: "",
    encoding: "utf-8"
  });

  const materials = parseMaterialListHtml(response.text, {
    ...(options.week !== undefined ? { week: options.week } : {})
  });
  const courseTitle = classroom.courseTitle;

  return {
    kjkey: options.kjkey,
    materials,
    ...(courseTitle ? { courseTitle } : {}),
    ...(options.week !== undefined ? { week: options.week } : {})
  };
}

export async function getCourseMaterial(
  client: MjuLmsSsoClient,
  options: GetMaterialOptions
): Promise<MaterialDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.getPage(
    `${STUDENT_MATERIAL_VIEW_URL}?ARTL_NUM=${options.articleId}`
  );

  const meta = parseDetailMeta(response.text);
  const body = parseMaterialBody(response.text);
  if (!body.title) {
    throw new Error(`자료 상세를 읽지 못했습니다. articleId=${options.articleId}`);
  }

  const attachmentRequest = extractAttachmentRequestParams(response.text);
  const attachments = attachmentRequest
    ? await fetchAttachments(client, attachmentRequest)
    : [];
  const courseTitle = classroom.courseTitle;
  const openAt = meta.get("공개일");
  const author = meta.get("작성자");
  const viewCount = parsePositiveInt(meta.get("조회수"));
  const contentSeq = attachmentRequest?.contentSeq;
  const qnaTarget = extractQnaTarget(response.text);

  return {
    kjkey: options.kjkey,
    articleId: options.articleId,
    title: body.title,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    attachments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(openAt ? { openAt } : {}),
    ...(author ? { author } : {}),
    ...(viewCount !== undefined ? { viewCount } : {}),
    ...(contentSeq ? { contentSeq } : {}),
    ...(qnaTarget ? { qnaTarget } : {})
  };
}
