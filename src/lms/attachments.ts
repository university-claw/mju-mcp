import { load } from "cheerio";

import { FILE_LIST_URL, LMS_BASE } from "./constants.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type { AttachmentRequestParams, LmsAttachment } from "./types.js";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, LMS_BASE).toString();
}

export function extractAttachmentRequestParams(
  html: string
): AttachmentRequestParams | undefined {
  const match = html.match(
    /url:\s*"\/ilos\/co\/efile_list\.acl"[\s\S]*?ud\s*:\s*"([^"]+)"[\s\S]*?ky\s*:\s*"([^"]+)"[\s\S]*?pf_st_flag\s*:\s*"([^"]+)"[\s\S]*?CONTENT_SEQ\s*:\s*"([^"]+)"/
  );

  if (!match) {
    return undefined;
  }

  const [, userId, kjkey, pfStFlag, contentSeq] = match;
  if (!userId || !kjkey || !pfStFlag || !contentSeq) {
    return undefined;
  }

  return {
    userId,
    kjkey,
    pfStFlag,
    contentSeq
  };
}

export function parseAttachmentsFromHtml(html: string): LmsAttachment[] {
  const $ = load(html);
  const attachments: LmsAttachment[] = [];

  $("ul.attach_list > li").each((_, element) => {
    const item = $(element);
    const downloadLink = item.find("a.file_down").first();
    const previewLink = item.find("a.icon_preview").first();
    const filename = normalizeText(downloadLink.text());
    const downloadUrl = toAbsoluteUrl(downloadLink.attr("href"));

    if (!filename || !downloadUrl) {
      return;
    }

    const attachment: LmsAttachment = {
      name: filename,
      downloadUrl
    };

    const previewUrl = toAbsoluteUrl(previewLink.attr("href"));
    if (previewUrl) {
      attachment.previewUrl = previewUrl;
    }

    const sizeLabel = normalizeText(item.find(".file_size").first().text());
    if (sizeLabel) {
      attachment.sizeLabel = sizeLabel;
    }

    const fileIconClass = item
      .find(".file_icon")
      .first()
      .attr("class")
      ?.split(/\s+/)
      .find((className) => className.startsWith("icon_"));
    if (fileIconClass) {
      attachment.fileType = fileIconClass.replace(/^icon_/, "");
    }

    attachments.push(attachment);
  });

  return attachments;
}

export async function fetchAttachments(
  client: MjuLmsSsoClient,
  params: AttachmentRequestParams
): Promise<LmsAttachment[]> {
  const response = await client.postForm(FILE_LIST_URL, {
    ud: params.userId,
    ky: params.kjkey,
    pf_st_flag: params.pfStFlag,
    CONTENT_SEQ: params.contentSeq,
    encoding: "utf-8"
  });

  return parseAttachmentsFromHtml(response.text);
}
