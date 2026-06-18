import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ITEM_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/purchase_order_items.csv');
const SCHED_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/po_schedule_lines.csv');
const HEADER_CSV_PATH = path.resolve(process.cwd(), 'procurement_data_sample/purchase_order_headers.csv');

test.describe('ACK confirmation_control_key Source Correction E2E Tests', () => {

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(90000);
    await page.addInitScript(() => {
      window.localStorage.setItem('PLAYWRIGHT_TEST', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
    await expect(page.locator('[data-testid="overview-overdue-count"]')).not.toHaveText('-', { timeout: 45000 });
  });

  test('1. Item-level ZACK makes child schedule line acknowledgement-required', async ({ page }) => {
    const backupHeaders = fs.readFileSync(HEADER_CSV_PATH, 'utf-8');
    const backupItems = fs.readFileSync(ITEM_CSV_PATH, 'utf-8');
    const backupSched = fs.readFileSync(SCHED_CSV_PATH, 'utf-8');

    try {
      // Step A: Append a PO header
      const headerLines = backupHeaders.trim().split('\n');
      const newHeader = '4500001000,NB,US01,PO01,PG2,VEND-001,2026-05-10,USD,Sarah Planner,RELEASED,OPEN,NET30,FCA,2026-05-10';
      fs.writeFileSync(HEADER_CSV_PATH, [...headerLines, newHeader].join('\n') + '\n', 'utf-8');

      // Append a PO item with ZACK
      const itemLines = backupItems.trim().split('\n');
      const newItem = '4500001000,00010,M100001,Microprocessor Core v1,PL01,SL01,100,PC,15.00,1,1500.00,2026-06-25,STANDARD,,N,N,Y,Y,ZACK';
      fs.writeFileSync(ITEM_CSV_PATH, [...itemLines, newItem].join('\n') + '\n', 'utf-8');

      // Append a matching schedule line (9 columns)
      const schedLines = backupSched.trim().split('\n');
      const newSched = '4500001000,00010,0001,2026-06-25,100,0,100,2026-06-25,';
      fs.writeFileSync(SCHED_CSV_PATH, [...schedLines, newSched].join('\n') + '\n', 'utf-8');

      // Step B: Reload page and navigate to Supplier Acks
      await page.reload();
      await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
      await page.click('[data-testid="sidebar-tab-acknowledgement"]');

      // Step C: Verify PO 4500001000 is present in the worklist (derived as MISSING due to item-level ZACK)
      await page.waitForSelector('[data-testid="ack-total-count-badge"]');
      const row = page.locator('[data-testid="ack-row-4500001000-00010"]').first();
      await expect(row).toBeVisible({ timeout: 15000 });
    } finally {
      // Restore backups
      fs.writeFileSync(HEADER_CSV_PATH, backupHeaders, 'utf-8');
      fs.writeFileSync(ITEM_CSV_PATH, backupItems, 'utf-8');
      fs.writeFileSync(SCHED_CSV_PATH, backupSched, 'utf-8');
    }
  });

  test('2. Blank item-level confirmation_control_key makes child schedule line ACK_NOT_REQUIRED', async ({ page }) => {
    const backupHeaders = fs.readFileSync(HEADER_CSV_PATH, 'utf-8');
    const backupItems = fs.readFileSync(ITEM_CSV_PATH, 'utf-8');
    const backupSched = fs.readFileSync(SCHED_CSV_PATH, 'utf-8');

    try {
      // Step A: Append a PO header
      const headerLines = backupHeaders.trim().split('\n');
      const newHeader = '4500001000,NB,US01,PO01,PG2,VEND-001,2026-05-10,USD,Sarah Planner,RELEASED,OPEN,NET30,FCA,2026-05-10';
      fs.writeFileSync(HEADER_CSV_PATH, [...headerLines, newHeader].join('\n') + '\n', 'utf-8');

      // Append a PO item with blank confirmation_control_key
      const itemLines = backupItems.trim().split('\n');
      const newItem = '4500001000,00010,M100001,Microprocessor Core v1,PL01,SL01,100,PC,15.00,1,1500.00,2026-06-25,STANDARD,,N,N,Y,Y,';
      fs.writeFileSync(ITEM_CSV_PATH, [...itemLines, newItem].join('\n') + '\n', 'utf-8');

      // Append a matching schedule line (9 columns)
      const schedLines = backupSched.trim().split('\n');
      const newSched = '4500001000,00010,0001,2026-06-25,100,0,100,2026-06-25,';
      fs.writeFileSync(SCHED_CSV_PATH, [...schedLines, newSched].join('\n') + '\n', 'utf-8');

      // Step B: Reload page and navigate to Supplier Acks
      await page.reload();
      await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
      await page.click('[data-testid="sidebar-tab-acknowledgement"]');

      // Step C: Verify PO 4500001000 is NOT present in the worklist (blank item overrides any schedule line default)
      await page.waitForSelector('[data-testid="ack-total-count-badge"]');
      const row = page.locator('[data-testid="ack-row-4500001000-00010"]').first();
      await expect(row).not.toBeVisible({ timeout: 5000 });
    } finally {
      // Restore backups
      fs.writeFileSync(HEADER_CSV_PATH, backupHeaders, 'utf-8');
      fs.writeFileSync(ITEM_CSV_PATH, backupItems, 'utf-8');
      fs.writeFileSync(SCHED_CSV_PATH, backupSched, 'utf-8');
    }
  });

  test('3. No fallback/data-integrity: missing item-level record does not fall back to schedule lines and is not acknowledgement-required', async ({ page }) => {
    const backupHeaders = fs.readFileSync(HEADER_CSV_PATH, 'utf-8');
    const backupItems = fs.readFileSync(ITEM_CSV_PATH, 'utf-8');
    const backupSched = fs.readFileSync(SCHED_CSV_PATH, 'utf-8');

    try {
      // Step A: Append a PO header
      const headerLines = backupHeaders.trim().split('\n');
      const newHeader = '4500001000,NB,US01,PO01,PG2,VEND-001,2026-05-10,USD,Sarah Planner,RELEASED,OPEN,NET30,FCA,2026-05-10';
      fs.writeFileSync(HEADER_CSV_PATH, [...headerLines, newHeader].join('\n') + '\n', 'utf-8');

      // Do NOT append any PO item to ITEM_CSV (so item-level record is missing)

      // Append a matching schedule line (9 columns)
      const schedLines = backupSched.trim().split('\n');
      const newSched = '4500001000,00010,0001,2026-06-25,100,0,100,2026-06-25,';
      fs.writeFileSync(SCHED_CSV_PATH, [...schedLines, newSched].join('\n') + '\n', 'utf-8');

      // Step B: Reload page and navigate to Supplier Acks
      await page.reload();
      await page.waitForSelector('[data-testid="sidebar-tab-overview"]');
      await page.click('[data-testid="sidebar-tab-acknowledgement"]');

      // Step C: Verify PO 4500001000 is NOT present in the worklist (proves no fallback is active)
      await page.waitForSelector('[data-testid="ack-total-count-badge"]');
      const row = page.locator('[data-testid="ack-row-4500001000-00010"]').first();
      await expect(row).not.toBeVisible({ timeout: 5000 });
    } finally {
      // Restore backups
      fs.writeFileSync(HEADER_CSV_PATH, backupHeaders, 'utf-8');
      fs.writeFileSync(ITEM_CSV_PATH, backupItems, 'utf-8');
      fs.writeFileSync(SCHED_CSV_PATH, backupSched, 'utf-8');
    }
  });

});
