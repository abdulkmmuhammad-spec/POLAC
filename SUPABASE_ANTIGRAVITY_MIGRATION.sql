-- Project Antigravity: Cadet At-Risk Alert System Migration
-- IMPORTANT: Run this entire script in your Supabase SQL Editor.

-- 1. Create the cadet_alerts table
CREATE TABLE IF NOT EXISTS public.cadet_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadet_name TEXT NOT NULL,
    squad TEXT NOT NULL,
    course_number INT,
    alert_level TEXT CHECK (alert_level IN ('CRITICAL', 'FLAGRANT')) NOT NULL,
    status TEXT CHECK (status IN ('ACTIVE', 'RESOLVED')) NOT NULL DEFAULT 'ACTIVE',
    trigger_count INT NOT NULL DEFAULT 3,
    acknowledged_by TEXT,
    resolution_notes TEXT,
    commandant_directive TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safe alter for existing tables:
ALTER TABLE IF EXISTS public.cadet_alerts ADD COLUMN IF NOT EXISTS commandant_directive TEXT;

-- Turn on Realtime for cadet_alerts (Idempotent block to prevent relation already member error)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'cadet_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cadet_alerts;
    END IF;
END $$;

-- Enable RLS and add policies for both anon and authenticated clients
ALTER TABLE public.cadet_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadet_alerts TO anon, authenticated;
DROP POLICY IF EXISTS "Allow authenticated read/write access" ON public.cadet_alerts;
CREATE POLICY "Allow authenticated read/write access"
  ON public.cadet_alerts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Create the Trigger Function
CREATE OR REPLACE FUNCTION check_parade_absences() 
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_absence_count INT;
    v_course_number INT;
    v_parade_date DATE;
    v_alert_level TEXT;
    v_existing_alert_id UUID;
    v_existing_alert_level TEXT;
BEGIN
    -- Only process if the cadet was marked 'absent'
    IF LOWER(TRIM(NEW.status)) != 'absent' THEN
        RETURN NEW;
    END IF;

    -- Fetch the date and course_number of the submitted parade record
    SELECT COALESCE(date::date, CURRENT_DATE), COALESCE(course_number::int, year_group::int)
    INTO v_parade_date, v_course_number
    FROM public.parade_records
    WHERE id = NEW.record_id
    LIMIT 1;

    v_parade_date := COALESCE(v_parade_date, CURRENT_DATE);

    -- Count all 'absent' activities for this cadet within the 5-day rolling window of the parade date
    -- (Includes 3 activities in 1 single day: Muster + Tattoo + Special)
    SELECT COUNT(*) INTO v_absence_count
    FROM public.cadet_details cd
    JOIN public.parade_records pr ON cd.record_id = pr.id
    WHERE LOWER(TRIM(cd.name)) = LOWER(TRIM(NEW.name))
      AND LOWER(TRIM(cd.squad)) = LOWER(TRIM(NEW.squad))
      AND LOWER(TRIM(cd.status)) = 'absent'
      AND pr.date::date >= (v_parade_date - INTERVAL '5 days')
      AND pr.date::date <= (v_parade_date + INTERVAL '1 day');

    IF v_absence_count >= 3 THEN
        IF v_absence_count >= 4 THEN
            v_alert_level := 'FLAGRANT';
        ELSE
            v_alert_level := 'CRITICAL';
        END IF;

        -- Check if there's an ACTIVE alert already
        SELECT id, alert_level INTO v_existing_alert_id, v_existing_alert_level
        FROM public.cadet_alerts
        WHERE LOWER(TRIM(cadet_name)) = LOWER(TRIM(NEW.name))
          AND LOWER(TRIM(squad)) = LOWER(TRIM(NEW.squad))
          AND status = 'ACTIVE'
        LIMIT 1;

        IF v_existing_alert_id IS NOT NULL THEN
            UPDATE public.cadet_alerts
            SET trigger_count = v_absence_count,
                alert_level = CASE WHEN v_absence_count >= 4 THEN 'FLAGRANT' ELSE alert_level END,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_existing_alert_id;
        ELSE
            INSERT INTO public.cadet_alerts (
                cadet_name, squad, course_number, alert_level, status, trigger_count
            ) VALUES (
                TRIM(NEW.name), TRIM(NEW.squad), v_course_number, v_alert_level, 'ACTIVE', v_absence_count
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Bind the Trigger to cadet_details table
DROP TRIGGER IF EXISTS trigger_check_absences ON public.cadet_details;
CREATE TRIGGER trigger_check_absences
AFTER INSERT ON public.cadet_details
FOR EACH ROW EXECUTE FUNCTION check_parade_absences();

-- 4. Update Fitness Index SQL view/function (if exists) 
-- (Assuming FI is computed on the fly or needs a penalty function)
CREATE OR REPLACE FUNCTION calculate_at_risk_penalty(p_name TEXT, p_squad TEXT, p_rolling_absences INT)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_flagrant INT := 0;
    v_penalty FLOAT := 0;
BEGIN
    SELECT 1 INTO v_is_flagrant
    FROM public.cadet_alerts
    WHERE cadet_name = p_name AND squad = p_squad AND alert_level = 'FLAGRANT' AND status = 'ACTIVE'
    LIMIT 1;
    
    v_penalty := (p_rolling_absences * 1.5) + (COALESCE(v_is_flagrant, 0) * 2.5);
    RETURN v_penalty;
END;
$$;

-- Done!
