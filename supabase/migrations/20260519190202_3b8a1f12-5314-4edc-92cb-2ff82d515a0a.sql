
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  company_id uuid NOT NULL,
  activity_id uuid,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_unread
  ON public.notifications (recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modtager ser egne notifikationer"
ON public.notifications FOR SELECT TO authenticated
USING (recipient_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Alle opretter notifikationer"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Modtager opdaterer egne notifikationer"
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Admin sletter notifikationer"
ON public.notifications FOR DELETE TO authenticated
USING (is_admin(auth.uid()));
