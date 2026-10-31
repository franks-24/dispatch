import {test,expect} from '@playwright/test';
test('generated mobile applicant site stays closed and excludes operational pages',async({page})=>{
 const requests=[];page.on('request',req=>{if(req.url().includes('/api/'))requests.push(req.url());});
 await page.goto('/driver/apply.html');
 await expect(page.locator('#applicant-status')).toContainText('Applications are not yet open');
 await expect(page.locator('#applicant-login')).toBeDisabled();
 await expect(page.locator('#application-panel')).toBeHidden();
 await page.getByLabel('Vehicle you intend to use').selectOption('bakkie');
 await page.getByRole('button',{name:'Check readiness'}).click();
 await expect(page.locator('#readiness-status')).toContainText('Still to prepare');
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const path of ['/dispatcher/','/operations/','/driver/','/deliveries/','/workspaces/app.js']){
  const response=await page.request.get(path);expect(response.status()).toBe(404);
 }
 expect(requests).toEqual([]);
});
