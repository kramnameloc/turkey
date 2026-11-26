import { expect, test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('reportPolicyViolation', (directive, url) => {
      errors.push(directive + ' blocked ' + url);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        window.reportPolicyViolation(
          event.effectiveDirective,
          event.blockedURI
        );
      });
    });
    await use(page);
    expect(errors).toEqual([]);
  },
});

export { expect };
