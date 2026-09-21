-- Fix foreign key constraint for push_subscriptions to reference public.users instead of auth.users
-- since this application uses a custom pure hashing authentication system.

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;
