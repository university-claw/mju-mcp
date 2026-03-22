import type { LibraryCampusKey } from "./constants.js";

export interface LibraryApiEnvelope<T> {
  success: boolean;
  code?: string;
  message?: string;
  data?: T;
}

export interface LibrarySessionPayload {
  savedAt: string;
  accessToken: string;
}

export interface LibraryUserInfo {
  id: number;
  name: string;
  memberNo: string;
  branchId?: number;
  branchName?: string;
  branchAlias?: string;
}

export interface LibraryFloorOption {
  value: number;
  label: string;
}

export interface LibraryStudyRoomSummary {
  roomId: number;
  roomName: string;
  roomTypeName?: string;
  floorValue?: number;
  floorLabel?: string;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable: boolean;
  unableMessage?: string;
}

export interface LibraryCampusAvailability {
  campus: LibraryCampusKey;
  branchGroupId: number;
  branchName: string;
  branchAlias: string;
  selectedDate: string;
  availableDates: string[];
  floors: LibraryFloorOption[];
  rooms: LibraryStudyRoomSummary[];
}

export interface LibraryUseSection {
  id: number;
  code: string;
  name: string;
}

export interface LibraryTimeSlot {
  time: string;
  className: string;
  selectable: boolean;
  stepMinutes: number;
}

export interface LibraryBlockedTimeRange {
  startTime: string;
  endTime: string;
  className: string;
}

export interface LibraryStudyRoomDetail {
  roomId: number;
  roomName: string;
  campusId?: number;
  campusName?: string;
  campusAlias?: string;
  buildingName?: string;
  floorValue?: number;
  floorLabel?: string;
  roomTypeName?: string;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable: boolean;
  description?: string;
  attention?: string;
  note?: string;
  date: string;
  availableDates: string[];
  availableMonths: string[];
  timeUnit?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  useCompanionRegistration: boolean;
  useOutsiderRegistration: boolean;
  equipments: Array<{
    id: number;
    name: string;
  }>;
  expansionFields: Array<{
    code: string;
    name: string;
    isMandatory: boolean;
  }>;
  useSections: LibraryUseSection[];
  timeline: LibraryTimeSlot[];
  blockedRanges: LibraryBlockedTimeRange[];
  reservableStartTimes: string[];
  reservableEndTimes?: string[];
}

export interface LibraryCompanionInput {
  name: string;
  memberNo: string;
}

export interface LibraryCompanion {
  id: number;
  name: string;
  memberNo: string;
}

export interface LibraryRoomReservationSummary {
  reservationId: number;
  roomId?: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  useSectionName?: string;
  stateCode?: string;
  stateLabel?: string;
  reservationTime: string;
  beginTime?: string;
  endTime?: string;
  companionCount: number;
}

export interface LibraryRoomReservationDetail {
  reservationId: number;
  roomId: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  buildingName?: string;
  floorLabel?: string;
  reservationTime: string;
  beginTime: string;
  endTime: string;
  stateCode?: string;
  stateLabel?: string;
  useSection?: LibraryUseSection;
  isEditable: boolean;
  isCheckinable: boolean;
  isReturnable: boolean;
  isRenewable: boolean;
  companionCount: number;
  companions: LibraryCompanion[];
  patronMessage?: string;
  workerMessage?: string;
  dateCreated?: string;
  timeUnit?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  minQuota?: number;
  maxQuota?: number;
  useCompanionRegistration: boolean;
  useOutsiderRegistration: boolean;
  equipmentIds: number[];
  additionalInfoValues: Record<string, string>;
}

export interface LibraryReservationRequestInput {
  roomId: number;
  date: string;
  beginTime: string;
  endTime: string;
  useSectionId?: number;
  useSectionCode?: string;
  useSectionName?: string;
  companionCount?: number;
  companions?: LibraryCompanionInput[];
  patronMessage?: string;
  equipmentIds?: number[];
  additionalInfoValues?: Record<string, string>;
}

export interface LibraryReservationMutationPreview {
  roomId: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  date: string;
  beginTime: string;
  endTime: string;
  reservationTime: string;
  useSection: LibraryUseSection;
  companionCount: number;
  resolvedCompanions: LibraryCompanion[];
  approvalWarnings: string[];
}

export interface LibraryReservationMutationResult
  extends LibraryReservationMutationPreview {
  reservationId: number;
  stateCode?: string;
  stateLabel?: string;
}
