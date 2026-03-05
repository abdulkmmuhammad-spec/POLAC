-- Migration: Phase 3 - Officer Management Utilities
-- Description: Simplifies administration by providing helper functions for rotations.

-- 1. Function to "Vacate" a course (Remove the officer assigned to it)
-- This is useful if a course is temporarily without an officer.
CREATE OR REPLACE FUNCTION public.vacate_course(target_course_number INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles 
  SET assigned_course_number = NULL 
  WHERE assigned_course_number = target_course_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to quickly check assignment conflicts
-- Ensures two officers aren't accidentally assigned to the same course.
CREATE OR REPLACE VIEW public.assignment_conflicts AS
SELECT assigned_course_number, count(*)
FROM public.profiles
WHERE assigned_course_number IS NOT NULL
GROUP BY assigned_course_number
HAVING count(*) > 1;

-- 3. Reminder for User
-- You DO NOT need to manually insert users into SQL.
-- Use the "Create Account" button in the Commandant Dashboard.
-- It uses the dbService.inviteOfficer() method which is much safer.
