import { load } from "cheerio";

export interface ParsedActivityItem {
  menuId: string;
  activityId: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  attachmentCount?: number;
  hasIndicator: boolean;
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

function parseMenuFromId(
  idValue: string | undefined
): { menuId: string; activityId: number } | undefined {
  const matched = idValue?.match(/^class_menu_(.+)_(\d+)$/);
  const menuId = matched?.[1];
  const activityId = parsePositiveInt(matched?.[2]);

  if (!menuId || activityId === undefined) {
    return undefined;
  }

  return {
    menuId,
    activityId
  };
}

function parseMenuFromOnclick(
  onclickValue: string | undefined
): { menuId: string; activityId: number } | undefined {
  const matched = onclickValue?.match(
    /,\s*'([^']+)'\s*,\s*'(\d+)'\s*,/
  );
  const menuId = matched?.[1];
  const activityId = parsePositiveInt(matched?.[2]);

  if (!menuId || activityId === undefined) {
    return undefined;
  }

  return {
    menuId,
    activityId
  };
}

export function parseActivityListItems(html: string): ParsedActivityItem[] {
  const $ = load(html);
  const items: ParsedActivityItem[] = [];
  let currentWeek: number | undefined;
  let currentWeekLabel: string | undefined;
  const container = $("#class_activity_list");
  const nodes =
    container.length > 0
      ? container.find(".activity_week, .activity")
      : $.root().find(".activity_week, .activity");

  nodes.each((_, element) => {
    const item = $(element);

    if (item.hasClass("activity_week")) {
      currentWeek = parsePositiveInt(item.attr("data-week"));
      currentWeekLabel = normalizeText(item.text()) || undefined;
      return;
    }

    if (!item.hasClass("activity")) {
      return;
    }

    const menuInfo =
      parseMenuFromId(item.attr("id")) ?? parseMenuFromOnclick(item.attr("onclick"));
    const title = normalizeText(item.find(".activity_title").first().text());
    if (!menuInfo || !title) {
      return;
    }

    const statusLabel =
      normalizeText(item.find(".activity_info_title").first().text()) || undefined;
    const statusText =
      normalizeText(item.find(".activity_info_text").first().text()) || undefined;
    const attachmentCount = parsePositiveInt(
      normalizeText(item.find(".activity_attach_container .file").first().text())
    );

    items.push({
      menuId: menuInfo.menuId,
      activityId: menuInfo.activityId,
      title,
      hasIndicator: item.find(".submit_check").length > 0,
      ...(currentWeek !== undefined ? { week: currentWeek } : {}),
      ...(currentWeekLabel ? { weekLabel: currentWeekLabel } : {}),
      ...(statusLabel ? { statusLabel } : {}),
      ...(statusText ? { statusText } : {}),
      ...(attachmentCount !== undefined ? { attachmentCount } : {})
    });
  });

  return items;
}
