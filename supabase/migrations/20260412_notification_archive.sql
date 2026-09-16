-- Migration: notification_archive
-- Description: Adds soft-delete (archiving) support to notifications for forensic immutability.

-- 1. Add archived_at column to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON public.notifications (archived_at);

-- 3. Immutability Enforcement (Optional but recommended)
-- This ensures that once a notification is created, it can never be truly deleted,
-- only moved to the archive view.
CREATE OR REPLACE FUNCTION public.notification_immutability_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FORENSIC ALERT: Notifications are immutable. Use soft-delete (archived_at) instead of hard deletion.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_immutability ON public.notifications;
CREATE TRIGGER trg_notification_immutability
BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notification_immutability_guard();
