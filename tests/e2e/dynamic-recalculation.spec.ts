import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EXCEPTION_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/exception_worklist.csv');
const ITEM_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/purchase_order_items.csv');
const SCHED_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/po_schedule_lines.csv');
const REMINDERS_JSON_PATH = path.resolve(process.cwd(), 'data/app-supplier-reminders.json');

test.describe('Dynamic Recalculation & Grounding Freshness Tests', () => {

  test.beforeEach(async ({ page }, testInfo) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err));
    page.on('requestfailed', request => console.error('BROWSER REQUEST FAILED:', request.url(), request.failure()));
    // Large timeout for Windows dev compilation
    testInfo.setTimeout(90000);
    await page.addInitScript(() => {
      window.localStorage.setItem('PLAYWRIGHT_TEST', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
    await expect(page.locator('[data-testid="overview-overdue-count"]')).not.toHaveText('-', { timeout: 45000 });
  });

  test('1. Plant Health Status Recalculation (Risk vs Optimal)', async ({ page }) => {
    const backupContent = fs.readFileSync(EXCEPTION_CSV_PATH, 'utf-8');
    const backupItems = fs.readFileSync(ITEM_CSV_PATH, 'utf-8');
    const backupSched = fs.readFileSync(SCHED_CSV_PATH, 'utf-8');

    try {
      // Step A: Assert plant health is initially Optimal (or Warning, but exceptions count is below threshold for RISK)
      // Central threshold is 4 active exceptions for RISK. Let's append 5 exceptions for Plant AUS1.
      const lines = backupContent.trim().split('\n');
      const dummyExceptions = [
        'DUMMY_EX_1,PO_OVERDUE,HIGH,NEW,4500009991,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exceptions,1000,Alex Buyer',
        'DUMMY_EX_2,PO_OVERDUE,HIGH,NEW,4500009992,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exceptions,1000,Alex Buyer',
        'DUMMY_EX_3,PO_OVERDUE,HIGH,NEW,4500009993,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exceptions,1000,Alex Buyer',
        'DUMMY_EX_4,PO_OVERDUE,HIGH,NEW,4500009994,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exceptions,1000,Alex Buyer',
        'DUMMY_EX_5,PO_OVERDUE,HIGH,NEW,4500009995,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exceptions,1000,Alex Buyer'
      ];
      const newContent = [...lines, ...dummyExceptions].join('\n') + '\n';
      fs.writeFileSync(EXCEPTION_CSV_PATH, newContent, 'utf-8');

      // Append dummy PO items
      const itemLines = backupItems.trim().split('\n');
      const dummyItems = [
        '4500009991,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y',
        '4500009992,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y',
        '4500009993,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y',
        '4500009994,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y',
        '4500009995,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y'
      ];
      const newItemContent = [...itemLines, ...dummyItems].join('\n') + '\n';
      fs.writeFileSync(ITEM_CSV_PATH, newItemContent, 'utf-8');

      // Append dummy schedule lines
      const schedLines = backupSched.trim().split('\n');
      const dummyScheds = [
        '4500009991,00010,0001,2026-06-05,100,0,100,2026-06-05,,',
        '4500009992,00010,0001,2026-06-05,100,0,100,2026-06-05,,',
        '4500009993,00010,0001,2026-06-05,100,0,100,2026-06-05,,',
        '4500009994,00010,0001,2026-06-05,100,0,100,2026-06-05,,',
        '4500009995,00010,0001,2026-06-05,100,0,100,2026-06-05,,'
      ];
      const newSchedContent = [...schedLines, ...dummyScheds].join('\n') + '\n';
      fs.writeFileSync(SCHED_CSV_PATH, newSchedContent, 'utf-8');

      // Reload page and navigate to Sourcing Copilot tab to see Plant Health ratings in sidebar
      await page.reload();
      await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
      await page.click('[data-testid="sidebar-tab-copilot"]');
      await page.waitForSelector('[data-testid="copilot-chat-input"]');

      // Look for the Plant AUS1 card in the Plant Health list and verify it shows RISK
      const plantCard = page.locator('text=Plant AUS1').locator('xpath=..');
      await expect(plantCard.locator('text=RISK')).toBeVisible({ timeout: 15000 });

    } finally {
      // Always restore backups to keep workspace clean
      fs.writeFileSync(EXCEPTION_CSV_PATH, backupContent, 'utf-8');
      fs.writeFileSync(ITEM_CSV_PATH, backupItems, 'utf-8');
      fs.writeFileSync(SCHED_CSV_PATH, backupSched, 'utf-8');
    }

    // Verify it reverts back after restore and reload
    await page.reload();
    await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
    await page.click('[data-testid="sidebar-tab-copilot"]');
    await page.waitForSelector('[data-testid="copilot-chat-input"]');
    const plantCardReverted = page.locator('text=Plant AUS1').locator('xpath=..');
    await expect(plantCardReverted.locator('text=RISK')).not.toBeVisible({ timeout: 15000 });
  });

  test('2. Overdue KPI Card Count shift', async ({ page }) => {
    const backupContent = fs.readFileSync(EXCEPTION_CSV_PATH, 'utf-8');
    const backupItems = fs.readFileSync(ITEM_CSV_PATH, 'utf-8');
    const backupSched = fs.readFileSync(SCHED_CSV_PATH, 'utf-8');

    // Read initial count from overview card
    const overdueCountLocator = page.locator('[data-testid="overview-overdue-count"]');
    const initialText = await overdueCountLocator.innerText();
    const initialCount = parseInt(initialText.trim(), 10);

    try {
      // Append a new PO_OVERDUE exception to exception_worklist.csv
      const lines = backupContent.trim().split('\n');
      const extraException = 'DUMMY_EX_OVERDUE,PO_OVERDUE,HIGH,NEW,4500009999,00010,M100001,AUS1,VEND-001,2026-06-15,2026-06-05,0,Test exception,1000,Alex Buyer';
      const newContent = [...lines, extraException].join('\n') + '\n';
      fs.writeFileSync(EXCEPTION_CSV_PATH, newContent, 'utf-8');

      // Append dummy item
      const itemLines = backupItems.trim().split('\n');
      const dummyItem = '4500009999,00010,M100001,Microprocessor Core v1,AUS1,SL01,100,PC,15.00,1,1500.00,2026-06-05,STANDARD,,N,N,Y,Y';
      const newItemContent = [...itemLines, dummyItem].join('\n') + '\n';
      fs.writeFileSync(ITEM_CSV_PATH, newItemContent, 'utf-8');

      // Append dummy schedule line
      const schedLines = backupSched.trim().split('\n');
      const dummySched = '4500009999,00010,0001,2026-06-05,100,0,100,2026-06-05,,';
      const newSchedContent = [...schedLines, dummySched].join('\n') + '\n';
      fs.writeFileSync(SCHED_CSV_PATH, newSchedContent, 'utf-8');

      // Reload and assert count increases by 1
      await page.reload();
      await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
      await expect(overdueCountLocator).not.toHaveText('-', { timeout: 45000 });

      await expect(overdueCountLocator).toHaveText(String(initialCount + 1), { timeout: 15000 });

    } finally {
      // Restore backups
      fs.writeFileSync(EXCEPTION_CSV_PATH, backupContent, 'utf-8');
      fs.writeFileSync(ITEM_CSV_PATH, backupItems, 'utf-8');
      fs.writeFileSync(SCHED_CSV_PATH, backupSched, 'utf-8');
    }

    // Verify it reverts back
    await page.reload();
    await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
    await expect(overdueCountLocator).not.toHaveText('-', { timeout: 45000 });
    await expect(overdueCountLocator).toHaveText(String(initialCount), { timeout: 15000 });
  });

  test('3. Sourcing Copilot Grounding Freshness', async ({ page }) => {
    // Navigate to Copilot tab
    await page.click('[data-testid="sidebar-tab-copilot"]');
    await page.waitForSelector('[data-testid="copilot-chat-input"]');

    const askCopilot = async (prompt: string) => {
      const input = page.locator('[data-testid="copilot-chat-input"]');
      await input.fill(prompt);
      await page.click('[data-testid="copilot-chat-send-btn"]');
      await page.waitForSelector('text=Copilot is analyzing', { state: 'detached', timeout: 30000 });
      const bubbles = page.locator('[data-testid="copilot-message-bubble"]');
      const count = await bubbles.count();
      return await bubbles.nth(count - 1).innerText();
    };

    // Ask first question with original date
    const responseOriginal = await askCopilot('Have we sent mail to supplier for PO 4500002010 item 00010?');
    expect(responseOriginal.toLowerCase()).toContain('4500002010');
    expect(responseOriginal).toContain('2026-06-11');

    // Backup and modify app-supplier-reminders.json
    const backupReminders = fs.readFileSync(REMINDERS_JSON_PATH, 'utf-8');
    try {
      const reminders = JSON.parse(backupReminders);
      const targetRem = reminders.find(
        (r: any) => String(r.purchaseOrderNumber) === '4500002010' && String(r.purchaseOrderItem) === '00010'
      );
      if (targetRem) {
        targetRem.sentAt = '2026-06-18T10:00:00.000Z';
      }
      fs.writeFileSync(REMINDERS_JSON_PATH, JSON.stringify(reminders, null, 2), 'utf-8');

      // Ask again and expect the updated date in the response (Grounding Freshness)
      const responseUpdated = await askCopilot('Have we sent mail to supplier for PO 4500002010 item 00010?');
      expect(responseUpdated.toLowerCase()).toContain('4500002010');
      expect(responseUpdated).toContain('2026-06-18');

    } finally {
      // Restore reminders JSON
      fs.writeFileSync(REMINDERS_JSON_PATH, backupReminders, 'utf-8');
    }
  });
});
