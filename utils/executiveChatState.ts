import { CommandReport, User } from '../types';

const READ_STORAGE_PREFIX = 'polac_exec_chat_read_';

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

export const markExecutiveChatRead = (userId?: string | number, partnerKey?: string): void => {
  if (typeof window === 'undefined' || !userId || !partnerKey) return;
  try {
    localStorage.setItem(`${READ_STORAGE_PREFIX}${userId}_${partnerKey}`, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('command-reports-updated'));
  } catch {
    // ignore storage errors
  }
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

