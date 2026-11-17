import { test, expect } from '@playwright/test';

// Session payload for pseudo-auth bypass (Admin Portal)
const mockSession = {
  id: 'a0000000-0000-4000-8000-000000000001',
  fullName: 'SYSTEM ADMINISTRATOR',
  username: 'admin',
  role: 'admin',
  designation: 'System Administrator',
  email: 'admin@gmail.com',
  courseName: 'Academy HQ',
  isActive: true,
  sessionVersion: 1
};

test.beforeEach(async ({ page }) => {
  // Mock Supabase API calls to isolate testing from active DB state
  await page.route('**/rest/v1/users?select=id&id=eq.*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: mockSession.id }),
    });
  });

  await page.route('**/rest/v1/users?select=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([mockSession]),
    });
  });

  await page.route('**/rest/v1/app_settings*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { key: 'active_rc', value: '8' },
        { key: 'muster_start_hour', value: '7' },
        { key: 'muster_end_hour', value: '9' },
        { key: 'tattoo_start_hour', value: '21' }
      ]),
    });
  });

  // Inject session directly into localStorage before page loads
  await page.addInitScript((sessionVal) => {
    window.localStorage.setItem('polac_session', JSON.stringify(sessionVal));
  }, mockSession);
});

test.describe('Admin & Commandant Role Separation E2E Tests', () => {
  
  test('should load Admin dashboard settings page and switch tabs', async ({ page }) => {
    await page.goto('/admin/settings');

    // Verify header title
    await expect(page.getByRole('heading', { name: 'System Settings & Forensics' })).toBeVisible();

    // Verify Tab switching works
    const tabs = [
      { name: 'Administrative Parameters', heading: 'Global Reference RC' },
      { name: 'Forensic Archive', heading: 'Institutional Audit Trail' },
      { name: 'Tactical Access Control', heading: 'Strategic Personnel Registry' },
      { name: 'Alert History', heading: 'Historical Alerts View' },
      { name: 'Lifecycle Engine', heading: 'Lifecycle Control' }
    ];

    for (const tab of tabs) {
      const tabButton = page.getByRole('button', { name: tab.name });
      await tabButton.click();
      await expect(page.getByText(tab.heading)).toBeVisible();
    }
  });

  test('should handle paginated audit logs correctly', async ({ page }) => {
    // Generate mock audit events
    const mockLogs = Array.from({ length: 45 }, (_, idx) => ({
      id: `evt-${idx}`,
      actor_id: mockSession.id,
      actor_name: mockSession.fullName,
      action_type: 'CADET_ADDED',
      target_id: `cadet-${idx}`,
      payload: { cadet_name: `Cadet Name ${idx}`, squad: 'Squad Delta', course_number: 8 },
      created_at: new Date(Date.now() - idx * 60000).toISOString()
    }));

    // Intercept audit_events network requests
    await page.route('**/rest/v1/audit_events*', async (route) => {
      const url = new URL(route.request().url());
      const range = url.searchParams.get('limit') || '20'; // range offset or limit
      const parsedRange = parseInt(range);
      
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-14/45`,
        },
        contentType: 'application/json',
        body: JSON.stringify(mockLogs.slice(0, 15)),
      });
    });

    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Forensic Archive' }).click();

    // Verify pagination readout string matches responsive limits
    await expect(page.locator('text=Showing 1 to 15 of 45 administrative logs.')).toBeVisible();
    
    // Verify Previous button is disabled on page 1
    const prevBtn = page.getByRole('button', { name: 'Previous' });
    await expect(prevBtn).toBeDisabled();
    
    // Verify Next button is enabled
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(nextBtn).toBeEnabled();
  });

  test('should adapt table grids to card lists on mobile viewports', async ({ page, viewport }) => {
    // Test responsiveness logic
    const isMobile = viewport && viewport.width < 768;

    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Tactical Access Control' }).click();

    if (isMobile) {
      // Mobile view card expectations
      await expect(page.locator('table')).toBeHidden();
      await expect(page.locator('text=Admin')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Security Override' }).first()).toBeVisible();
    } else {
      // Desktop view table expectations
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=System Admin')).toBeVisible();
    }
  });
});
