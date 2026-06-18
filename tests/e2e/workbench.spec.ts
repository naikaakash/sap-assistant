import { test, expect } from '@playwright/test';

test.describe('Buyer Workbench End-to-End Regression Suite', () => {

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(90000);
    // Navigate to dashboard
    await page.goto('/');
    // Wait for client-side hydration (sidebar overview tab to render and be visible)
    await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
    // Wait for initial data hydration (stats not showing '-')
    await expect(page.locator('[data-testid="overview-overdue-count"]')).not.toHaveText('-', { timeout: 45000 });
    // Additional short cooldown for React event listeners to bind (avoiding the hydration uncanny valley)
    await page.waitForTimeout(1000);
  });

  test('1. Initial Load & Tab Navigation', async ({ page }) => {
    // Verify Executive Overview is active by default
    await expect(page.locator('[data-testid="sidebar-tab-overview"]')).toHaveClass(/active/);

    // Switch to Overdue workbench
    await page.click('[data-testid="sidebar-tab-overdue"]');
    await expect(page.locator('[data-testid="sidebar-tab-overdue"]')).toHaveClass(/active/);
    await expect(page.locator('[data-testid="sidebar-tab-overview"]')).not.toHaveClass(/active/);

    // Switch to Supplier Acks
    await page.click('[data-testid="sidebar-tab-acknowledgement"]');
    await expect(page.locator('[data-testid="sidebar-tab-acknowledgement"]')).toHaveClass(/active/);

    // Switch to Recommendation Worklist
    await page.click('[data-testid="sidebar-tab-recommendations"]');
    await expect(page.locator('[data-testid="sidebar-tab-recommendations"]')).toHaveClass(/active/);
  });

  test('2. Dynamic Count Reconciliation', async ({ page }) => {
    // Wait for the overview stats to populate (not "-" or loading state)
    const overdueCountLocator = page.locator('[data-testid="overview-overdue-count"]');
    await expect(overdueCountLocator).not.toHaveText('-', { timeout: 30000 });
    
    // Read the Overdue card count dynamically
    const overdueCardText = await overdueCountLocator.innerText();
    const expectedOverdueCount = parseInt(overdueCardText.trim(), 10);
    expect(expectedOverdueCount).toBeGreaterThan(0);

    // Click on the overdue card to navigate
    await page.click('[data-testid="overview-overdue-card"]');
    await expect(page.locator('[data-testid="sidebar-tab-overdue"]')).toHaveClass(/active/);
    
    // Read total count badge in the overdue workbench list
    await page.waitForSelector('[data-testid="overdue-total-count-badge"]');
    const overdueTotalBadgeText = await page.locator('[data-testid="overdue-total-count-badge"]').innerText();
    const actualOverdueCount = parseInt(overdueTotalBadgeText.trim(), 10);
    
    // Assert Overview Card matches Workbench Count
    expect(actualOverdueCount).toBe(expectedOverdueCount);

    // Go back to Overview
    await page.click('[data-testid="sidebar-tab-overview"]');
    
    const missingAckCountLocator = page.locator('[data-testid="overview-missing-ack-count"]');
    await expect(missingAckCountLocator).not.toHaveText('-', { timeout: 30000 });

    // Read Missing Acks card count dynamically
    const missingAckCardText = await missingAckCountLocator.innerText();
    const expectedAckCount = parseInt(missingAckCardText.trim(), 10);
    expect(expectedAckCount).toBeGreaterThan(0);

    // Click on the missing acks card
    await page.click('[data-testid="overview-missing-ack-card"]');
    await expect(page.locator('[data-testid="sidebar-tab-acknowledgement"]')).toHaveClass(/active/);

    // Read total count badge in acknowledgements page
    await page.waitForSelector('[data-testid="ack-total-count-badge"]');
    const ackTotalBadgeText = await page.locator('[data-testid="ack-total-count-badge"]').innerText();
    const actualAckCount = parseInt(ackTotalBadgeText.trim(), 10);

    // Assert Overview Card matches Workbench Count
    expect(actualAckCount).toBe(expectedAckCount);
  });

  test('3. Overdue PO Context Drawer & Lateness Alert', async ({ page }) => {
    // Navigate to Overdue PO Workbench
    await page.click('[data-testid="sidebar-tab-overdue"]');
    await page.waitForSelector('[data-testid="overdue-row-4500002022-00020"]');

    // Click on row for PO 4500002022 Item 00020
    const row = page.locator('[data-testid="overdue-row-4500002022-00020"]').first();
    await row.click();

    // Verify committed date field is visible inside details panel
    const committedLabel = page.locator('text=Supplier Acknowledgement status');
    await expect(committedLabel).toBeVisible();

    // Verify Late Alert is rendered
    const lateAlert = page.locator('text=Late by');
    await expect(lateAlert).toBeVisible();

    // Verify Supplier Sentiment label is rendered
    const sentimentLabel = page.locator('text=Sentiment');
    await expect(sentimentLabel).toBeVisible();
  });

  test('4. Outbound Supplier Reminders Manual Action Flow', async ({ page }) => {
    // Navigate to Recommendation Worklist tab
    await page.click('[data-testid="sidebar-tab-recommendations"]');
    await page.waitForSelector('[data-testid="rec-row-4500002008-00010"]');

    // Select recommendation row for PO 4500002008 item 00010
    const row = page.locator('[data-testid="rec-row-4500002008-00010"]').first();
    await row.click();

    // Click '✉️ Send Reminder'
    await page.click('[data-testid="recommendation-send-reminder-trigger-btn"]');

    // Assert email form fields are pre-populated
    const toInput = page.locator('[data-testid="recommendation-email-to-input"]');
    await expect(toInput).not.toHaveValue('');

    const subjectInput = page.locator('[data-testid="recommendation-email-subject-input"]');
    await expect(subjectInput).not.toHaveValue('');

    const bodyInput = page.locator('[data-testid="recommendation-email-body-input"]');
    await expect(bodyInput).not.toHaveValue('');

    // Click Confirm Send
    await page.click('[data-testid="recommendation-email-send-confirm-btn"]');

    // Check timeline shows outbound reminder email event
    const sentEvent = page.locator('text=Reminder Logged').first();
    await expect(sentEvent).toBeVisible({ timeout: 30000 });
  });

  test('5. Recommendation Closure Flow', async ({ page }) => {
    // Navigate to Recommendation Worklist tab
    await page.click('[data-testid="sidebar-tab-recommendations"]');
    await page.waitForSelector('[data-testid="rec-row-4500002004-00010"]');

    // Click row for PO 4500002004 item 00010
    const row = page.locator('[data-testid="rec-row-4500002004-00010"]').first();
    await row.click();

    // Click Close...
    await page.click('[data-testid="recommendation-close-trigger-btn"]');

    // Input closure reason
    const reasonInput = page.locator('[data-testid="recommendation-closure-reason-input"]');
    await reasonInput.fill('Resolved by buyer in Playwright E2E');

    // Click Confirm Close
    await page.click('[data-testid="recommendation-confirm-close-btn"]');

    // Verify status tag shows Closed Without Action
    const statusText = page.locator('text=Closed Without Action').first();
    await expect(statusText).toBeVisible({ timeout: 15000 });
  });

  test('6. Sourcing Copilot Grounding Checks', async ({ page }) => {
    // Navigate to Sourcing Copilot
    await page.click('[data-testid="sidebar-tab-copilot"]');
    await page.waitForSelector('[data-testid="copilot-chat-input"]');

    // Helper function to send message and wait for AI response
    const askCopilot = async (prompt: string) => {
      const input = page.locator('[data-testid="copilot-chat-input"]');
      await input.fill(prompt);
      await page.click('[data-testid="copilot-chat-send-btn"]');
      
      // Wait for loading indicator to disappear
      await page.waitForSelector('text=Copilot is analyzing', { state: 'detached', timeout: 30000 });
      
      // Extract latest response content
      const bubbles = page.locator('[data-testid="copilot-message-bubble"]');
      const count = await bubbles.count();
      return await bubbles.nth(count - 1).innerText();
    };

    // Query A: Outbound reminder check for PO 4500002010
    const response1 = await askCopilot('Have we sent mail to supplier for PO 4500002010 item 00010?');
    expect(response1.toLowerCase()).toContain('4500002010');
    expect(response1.toLowerCase()).toMatch(/yes|sent/);

    // Query B: Exception status check for PO 4500002010
    const response2 = await askCopilot('What is the exception status for PO 4500002010 item 00010?');
    expect(response2.toLowerCase()).toMatch(/closed|resolved|no_action/);

    // Query C: Excluded status check for PO 4500002027
    const response3 = await askCopilot('Why is PO 4500002027 item 00010 not in overdue?');
    expect(response3.toLowerCase()).toMatch(/deleted|cancelled|exclude/);

    // Query D: Off-topic conciseness constraint
    const response4 = await askCopilot('What is procurement?');
    const lines = response4.split('\n').filter(l => l.trim()).length;
    expect(lines).toBeLessThanOrEqual(4);
  });
});
