import { CommandReport, CommandantRemark, User, UserRole } from '../types';

const READ_STORAGE_PREFIX = 'polac_exec_chat_read_';
const REMARK_READ_STORAGE_PREFIX = 'polac_remark_chat_read_';

const isSameOfficer = (
  senderId?: string,
  senderDesignation?: string,
  currentUser?: User | null
): boolean => {
  if (!currentUser) return false;
  if (senderId && String(senderId) === String(currentUser.id)) return true;
  const sDes = (senderDesignation || '').trim().toLowerCase();
  const uDes = (currentUser.designation || '').trim().toLowerCase();
  if (sDes && uDes && sDes === uDes) return true;
  return false;
};

export const getLastReadTimestamp = (userId?: string | number, partnerKey?: string): string | null => {
  if (typeof window === 'undefined' || !userId || !partnerKey) return null;
  try {
    return localStorage.getItem(`${READ_STORAGE_PREFIX}${userId}_${partnerKey}`);
  } catch {
    return null;
  }
};

/**
 * Clock-skew-safe read receipt: stores max(now, latestItemMs) + 1000ms
 * so server timestamps slightly ahead of the device clock never remain unread.
 */
export const markExecutiveChatRead = (
  userId?: string | number,
  partnerKey?: string,
  latestItemMs?: number
): void => {
  if (typeof window === 'undefined' || !userId || !partnerKey) return;
  try {
    const safeMs = Math.max(Date.now(), latestItemMs || 0) + 1000;
    localStorage.setItem(`${READ_STORAGE_PREFIX}${userId}_${partnerKey}`, new Date(safeMs).toISOString());
    window.dispatchEvent(new CustomEvent('command-reports-updated'));
  } catch {
    // ignore storage errors
  }
};

export const getLatestExecutiveItemMs = (reports: CommandReport[]): number => {
  let maxMs = 0;
  for (const rep of reports || []) {
    const repMs = new Date(rep.createdAt).getTime();
    if (!Number.isNaN(repMs) && repMs > maxMs) maxMs = repMs;
    for (const msg of rep.messages || []) {
      const msgMs = new Date(msg.createdAt).getTime();
      if (!Number.isNaN(msgMs) && msgMs > maxMs) maxMs = msgMs;
    }
  }
  return maxMs;
};

export interface ExecutiveActivitySummary {
  previewText: string;
  latestTimestamp: string | null;
  isLastFromPartner: boolean;
}

export const getLatestExecutiveActivity = (
  reports: CommandReport[],
  currentUser?: User | null
): ExecutiveActivitySummary => {
  if (!reports || reports.length === 0) {
    return {
      previewText: '',
      latestTimestamp: null,
      isLastFromPartner: false
    };
  }

  let latestTimeMs = -1;
  let latestTimestamp: string | null = null;
  let previewText = '';
  let isLastFromPartner = false;

  for (const rep of reports) {
    const repMs = new Date(rep.createdAt).getTime();
    if (!Number.isNaN(repMs) && repMs >= latestTimeMs) {
      latestTimeMs = repMs;
      latestTimestamp = rep.createdAt;
      const fromMe = isSameOfficer(rep.senderId, 'Director Field Studies', currentUser);
      isLastFromPartner = !fromMe;
      const rate = rep.summaryPayload?.attendanceRate ?? 100;
      previewText = rep.executiveNote
        ? `${fromMe ? 'You: ' : ''}${rep.executiveNote}`
        : `Weekly Brief (${rep.weekStart} – ${rep.weekEnd}) • ${rate.toFixed(1)}%`;
    }

    for (const msg of rep.messages || []) {
      const msgMs = new Date(msg.createdAt).getTime();
      if (!Number.isNaN(msgMs) && msgMs >= latestTimeMs) {
        latestTimeMs = msgMs;
        latestTimestamp = msg.createdAt;
        const fromMe = isSameOfficer(msg.senderId, msg.senderDesignation, currentUser);
        isLastFromPartner = !fromMe;
        previewText = fromMe ? `You: ${msg.text}` : msg.text;
      }
    }
  }

  return {
    previewText,
    latestTimestamp,
    isLastFromPartner
  };
};

export const getUnreadExecutiveCount = (
  reports: CommandReport[],
  currentUser: User | null | undefined,
  partnerKey: string
): number => {
  if (!currentUser || !reports || reports.length === 0) return 0;

  const lastReadIso = getLastReadTimestamp(currentUser.id, partnerKey);
  const lastReadMs = lastReadIso ? new Date(lastReadIso).getTime() : 0;
  let unread = 0;

  for (const rep of reports) {
    const repMs = new Date(rep.createdAt).getTime();
    const isPartnerReport = !isSameOfficer(rep.senderId, 'Director Field Studies', currentUser);
    if (isPartnerReport) {
      if (lastReadMs > 0) {
        if (!Number.isNaN(repMs) && repMs > lastReadMs) unread += 1;
      } else if (rep.status !== 'acknowledged') {
        unread += 1;
      }
    }

    for (const msg of rep.messages || []) {
      const isPartnerMsg = !isSameOfficer(msg.senderId, msg.senderDesignation, currentUser);
      if (!isPartnerMsg) continue;
      const msgMs = new Date(msg.createdAt).getTime();
      if (!Number.isNaN(msgMs) && msgMs > lastReadMs) {
        unread += 1;
      }
    }
  }

  return unread;
};

// ── WhatsApp-style read tracking for Course Officer & DFS Remarks threads ──

export const markRemarkChatRead = (
  userId?: string | number,
  threadKey?: string,
  latestItemMs?: number
): void => {
  if (typeof window === 'undefined' || !userId || !threadKey) return;
  try {
    const safeMs = Math.max(Date.now(), latestItemMs || 0) + 1000;
    localStorage.setItem(
      `${REMARK_READ_STORAGE_PREFIX}${userId}_${threadKey}`,
      new Date(safeMs).toISOString()
    );
    window.dispatchEvent(new CustomEvent('remarks-read-updated'));
  } catch {
    // ignore storage errors
  }
};

export const getRemarkChatLastReadMs = (userId?: string | number, threadKey?: string): number => {
  if (typeof window === 'undefined' || !userId || !threadKey) return 0;
  try {
    const raw = localStorage.getItem(`${REMARK_READ_STORAGE_PREFIX}${userId}_${threadKey}`);
    return raw ? new Date(raw).getTime() || 0 : 0;
  } catch {
    return 0;
  }
};

export const getUnreadRemarkCount = (
  remarks: CommandantRemark[],
  currentUser: User | null | undefined
): number => {
  if (!currentUser || !remarks || remarks.length === 0) return 0;

  if (currentUser.role === UserRole.COURSE_OFFICER) {
    let unread = 0;
    for (const r of remarks) {
      const matchesOfficer =
        (r.courseOfficerId && String(r.courseOfficerId) === String(currentUser.id)) ||
        (r.courseNumber &&
          currentUser.courseNumber &&
          Number(r.courseNumber) === Number(currentUser.courseNumber)) ||
        (r.courseOfficerName &&
          currentUser.fullName &&
          r.courseOfficerName.toLowerCase() === currentUser.fullName.toLowerCase());
      if (!matchesOfficer || r.status === 'resolved') continue;

      const threadKey = `course_${r.courseNumber || currentUser.courseNumber || '0'}`;
      const lastReadMs = getRemarkChatLastReadMs(currentUser.id, threadKey);
      const itemMs = new Date(r.createdAt).getTime();
      if (!r.officerResponse && (lastReadMs === 0 || (!Number.isNaN(itemMs) && itemMs > lastReadMs))) {
        unread += 1;
      }
    }
    return unread;
  }

  // DFS / Senior Officer: count unread Course Officer replies
  let unread = 0;
  for (const r of remarks) {
    if (r.status === 'resolved') continue;
    const hasReply = Boolean(r.officerResponse) || r.status === 'addressed';
    if (!hasReply) continue;

    const threadKey = `course_${r.courseNumber || '0'}`;
    const lastReadMs = getRemarkChatLastReadMs(currentUser.id, threadKey);
    const replyIso = r.respondedAt || r.createdAt;
    const replyMs = new Date(replyIso).getTime();
    if (lastReadMs === 0 || (!Number.isNaN(replyMs) && replyMs > lastReadMs)) {
      unread += 1;
    }
  }
  return unread;
};
