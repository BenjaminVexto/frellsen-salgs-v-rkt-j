
-- Tilføj nye værdier til activity_type enum
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'telefonopkald';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'ikke_truffet';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'opfølgning_aftalt';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'andet';

-- Tilføj notification_type til notifications-tabellen for gruppering
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'mention';

-- Partielt unikt indeks så automatiske notifikationer (sovende kunde + konkurrentvindue + opfølgning)
-- ikke duplikeres pr. modtager pr. virksomhed pr. dag
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_auto_unique
  ON public.notifications (recipient_id, notification_type, company_id)
  WHERE notification_type IN ('sovende_kunde','konkurrentvindue','opfølgning');
