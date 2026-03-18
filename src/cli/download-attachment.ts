import { parseArgs } from "node:util";

import {
  downloadAssignmentAttachment,
  downloadMaterialAttachment,
  downloadNoticeAttachment
} from "../lms/attachment-downloads.js";
import { createAppContext } from "../mcp/app-context.js";

const USAGE = [
  "Usage:",
  "  npm run download:attachment -- --kind notice --kjkey KJKEY --article-id 1234567",
  "  npm run download:attachment -- --kind material --kjkey KJKEY --article-id 1234567",
  "  npm run download:attachment -- --kind assignment --kjkey KJKEY --rt-seq 1234567",
  "",
  "Flags:",
  "  --kind               notice | material | assignment",
  "  --kjkey              KJKEY",
  "  --article-id         ARTL_NUM for notice/material",
  "  --rt-seq             RT_SEQ for assignment",
  "  --attachment-index   0-based attachment index (default: 0)",
  "  --attachment-kind    prompt | submission (assignment only, default: prompt)",
  "  --output-dir         override output directory",
  "  --help               show this message"
].join("\n");

function parsePositiveInt(
  value: string | undefined,
  label: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${label} 는 0 이상의 정수여야 합니다.`);
  }

  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "article-id": { type: "string" },
      "attachment-index": { type: "string" },
      "attachment-kind": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      kind: { type: "string" },
      kjkey: { type: "string" },
      "output-dir": { type: "string" },
      "rt-seq": { type: "string" }
    }
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const kind = values.kind?.trim();
  const kjkey = values.kjkey?.trim();
  if (!kind || !kjkey) {
    throw new Error(`--kind 와 --kjkey 는 필수입니다.\n\n${USAGE}`);
  }

  const attachmentIndex = parsePositiveInt(
    values["attachment-index"],
    "attachment-index"
  ) ?? 0;
  const outputDir = values["output-dir"]?.trim() || undefined;

  const context = createAppContext();
  const credentials = await context.getCredentials();
  const client = context.createLmsClient();

  switch (kind) {
    case "notice": {
      const articleId = parsePositiveInt(values["article-id"], "article-id");
      if (articleId === undefined) {
        throw new Error(`공지 다운로드에는 --article-id 가 필요합니다.\n\n${USAGE}`);
      }

      const result = await downloadNoticeAttachment(client, context.lmsConfig, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey,
        articleId,
        attachmentIndex,
        ...(outputDir ? { outputDir } : {})
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case "material": {
      const articleId = parsePositiveInt(values["article-id"], "article-id");
      if (articleId === undefined) {
        throw new Error(`자료 다운로드에는 --article-id 가 필요합니다.\n\n${USAGE}`);
      }

      const result = await downloadMaterialAttachment(client, context.lmsConfig, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey,
        articleId,
        attachmentIndex,
        ...(outputDir ? { outputDir } : {})
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case "assignment": {
      const rtSeq = parsePositiveInt(values["rt-seq"], "rt-seq");
      if (rtSeq === undefined) {
        throw new Error(`과제 다운로드에는 --rt-seq 가 필요합니다.\n\n${USAGE}`);
      }

      const attachmentKind = values["attachment-kind"]?.trim();
      if (
        attachmentKind !== undefined &&
        attachmentKind !== "prompt" &&
        attachmentKind !== "submission"
      ) {
        throw new Error("--attachment-kind 는 prompt 또는 submission 이어야 합니다.");
      }

      const result = await downloadAssignmentAttachment(client, context.lmsConfig, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey,
        rtSeq,
        attachmentIndex,
        attachmentKind: attachmentKind === "submission" ? "submission" : "prompt",
        ...(outputDir ? { outputDir } : {})
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    default:
      throw new Error(`지원하지 않는 kind 입니다: ${kind}\n\n${USAGE}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
