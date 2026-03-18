export interface DecodedResponse {
  statusCode: number;
  url: string;
  text: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface SsoForm {
  action: string;
  c_r_t: string;
  publicKey: string;
}

export interface CourseCandidate {
  title: string;
  href: string;
}

export interface CourseTermRef {
  year: number;
  term: number;
  key: string;
}

export interface CourseTermSummary extends CourseTermRef {
  order: number;
  sourceLabel?: string;
}

export interface CourseSummary {
  kjkey: string;
  title: string;
  courseCode: string;
  professor: string;
  year: number;
  term: number;
  termLabel: string;
  classroomLabel: string;
  enterPath: string;
  coverImageUrl?: string;
}

export interface CourseListResult {
  mode: "taken";
  search: string;
  requested: {
    year?: number;
    term?: number;
    allTerms: boolean;
  };
  availableTerms: CourseTermSummary[];
  selectedTerms: CourseTermSummary[];
  courses: CourseSummary[];
}

export interface AttachmentRequestParams {
  userId: string;
  kjkey: string;
  pfStFlag: string;
  contentSeq: string;
}

export interface LmsAttachment {
  name: string;
  downloadUrl: string;
  previewUrl?: string;
  sizeLabel?: string;
  fileType?: string;
}

export interface ClassroomContext {
  kjkey: string;
  courseTitle?: string;
  mainUrl: string;
  mainHtml: string;
}

export interface NoticeSummary {
  articleId: number;
  title: string;
  previewText: string;
  postedAt?: string;
  viewCount?: number;
  isUnread: boolean;
  isExpired: boolean;
}

export interface NoticeListResult {
  kjkey: string;
  courseTitle?: string;
  search: string;
  page: number;
  pageSize: number;
  start: number;
  total: number;
  totalPages: number;
  notices: NoticeSummary[];
}

export interface NoticeDetailResult {
  kjkey: string;
  courseTitle?: string;
  articleId: number;
  title: string;
  author?: string;
  postedAt?: string;
  expireAt?: string;
  viewCount?: number;
  bodyHtml: string;
  bodyText: string;
  contentSeq?: string;
  attachments: LmsAttachment[];
}

export interface LoginSnapshotResult {
  loggedIn: boolean;
  usedSavedSession: boolean;
  mainFinalUrl: string;
  cookieCount: number;
  courseCandidatesCount: number;
  sessionPath: string;
  mainHtmlPath: string;
  coursesPath: string;
}
