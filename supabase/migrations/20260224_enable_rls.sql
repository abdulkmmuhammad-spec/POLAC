-- Migration: Enable Row Level Security (RLS) and Set Policies
-- Description: Moves RBAC from client-side only to the database level.
-- Note: These policies assume a future migration to Supabase Auth where 'role' is stored in user metadata or a profiles table linked to auth.uid().

-- 1. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parade_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadet_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadet_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Commandants can view and edit all profiles
CREATE POLICY "Commandants can manage all profiles" ON profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'commandant'
        )
    );

-- 3. Parade Records Policies
-- Course Officers can view/create records for their own course
CREATE POLICY "Officers can manage own course records" ON parade_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'course_officer' 
            AND course_number = parade_records.course_number
        )
    );

-- Commandants can view all records
CREATE POLICY "Commandants can view all records" ON parade_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'commandant'
        )
    );

-- 4. Cadet Registry Policies
-- All authenticated users can view the registry
CREATE POLICY "Authenticated users can view registry" ON cadet_registry
    FOR SELECT TO authenticated USING (true);

-- Only Commandants can modify the master registry
CREATE POLICY "Commandants can manage registry" ON cadet_registry
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'commandant'
        )
    );

-- 5. App Settings Policies
-- Only Commandants can change app settings (like Active RC)
CREATE POLICY "Commandants can manage app settings" ON app_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'commandant'
        )
    );
