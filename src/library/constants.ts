export const LIBRARY_BASE_URL = "https://lib.mju.ac.kr";
export const LIBRARY_API_BASE_URL = `${LIBRARY_BASE_URL}/pyxis-api`;
export const LIBRARY_HOMEPAGE_ID = 1;
export const LIBRARY_AUTH_HEADER = "Pyxis-Auth-Token";
export const LIBRARY_STUDY_ROOM_TYPE_ID = 1;
export const LIBRARY_SMUF_METHOD_CODE = "PC";

export const LIBRARY_BRANCH_GROUPS = {
  humanities: {
    id: 1,
    name: "인문캠퍼스",
    alias: "인문"
  },
  nature: {
    id: 2,
    name: "자연캠퍼스",
    alias: "자연"
  }
} as const;

export type LibraryCampusKey = keyof typeof LIBRARY_BRANCH_GROUPS;
