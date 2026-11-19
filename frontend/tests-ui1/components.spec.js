import {test,expect} from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const docs=fileURLToPath(new URL('../../docs/ui1/',import.meta.url));
test.beforeEach(async({page})=>{
 page.__violations=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://127.0.0.1:13320'||url.pathname.startsWith('/api')){
   page.__violations.push(url.origin+url.pathname);await route.abort();return;
  }await route.continue();
 });
});
test.afterEach(async({page})=>expect(page.__violations).toEqual([]));
async function ready(page){await page.goto('/ui1-preview.html');await expect(page.getByRole('heading',{name:'Nền tảng giao diện',exact:true})).toBeVisible();}
test('system follows OS, explicit choice persists and storage sync works',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await ready(page);
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByLabel('Giao diện',{exact:true}).selectOption('light');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 expect(await page.evaluate(()=>localStorage.getItem('ri.theme'))).toBe('light');
 await page.getByLabel('Giao diện',{exact:true}).selectOption('system');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'ri.theme',newValue:'light'})));
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
test('bootstrap theme is set before React content paints on reload',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('ri.theme','dark');window.__firstTheme=null;
  new MutationObserver(()=>{if(document.querySelector('.ri-lab')&&window.__firstTheme===null)window.__firstTheme=document.documentElement.dataset.theme;}).observe(document,{subtree:true,childList:true});
 });
 await ready(page);expect(await page.evaluate(()=>window.__firstTheme)).toBe('dark');
});
test('storage failures keep UI usable and are disclosed',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});
 await ready(page);await page.getByLabel('Giao diện',{exact:true}).selectOption('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.getByRole('status').filter({hasText:'Không lưu được lựa chọn'})).toBeVisible();
});
test('validation, disabled/loading and input labels are semantic',async({page})=>{
 await ready(page);const invalid=page.getByRole('textbox',{name:'Trường có lỗi',exact:true});
 await expect(invalid).toHaveAttribute('aria-invalid','true');expect(await invalid.getAttribute('aria-describedby')).toContain('-error');
 await expect(page.getByRole('button',{name:'Disabled',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Loading (mẫu UI)',exact:true})).toHaveAttribute('aria-busy','true');
 await page.getByLabel('Nhãn văn bản',{exact:true}).fill('Tiếng Việt có dấu');await expect(page.getByLabel('Nhãn văn bản',{exact:true})).toHaveValue('Tiếng Việt có dấu');
});
test('modal traps focus, closes on Escape and restores trigger',async({page})=>{
 await ready(page);const trigger=page.getByRole('button',{name:'Mở Modal',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Modal kiểm tra',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Đóng hộp thoại',exact:true}).focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Hoàn tất kiểm tra',exact:true})).toBeFocused();
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement.closest('dialog'))).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test('drawer supports keyboard close and restoration',async({page})=>{
 await ready(page);const trigger=page.getByRole('button',{name:'Mở Drawer',exact:true});await trigger.click();
 await expect(page.getByRole('dialog',{name:'Drawer kiểm tra',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
test('confirmation focuses cancel and calls callback once',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Mở xác nhận UI',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Xác nhận callback UI',exact:true});await expect(dialog.getByRole('button',{name:'Hủy',exact:true})).toBeFocused();
 await dialog.getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(dialog.getByRole('button',{name:'Xác nhận',exact:true})).toBeDisabled();
 await expect(dialog).toHaveCount(0);await expect(page.getByTestId('callback-count')).toContainText('1 callback');
});
test('failed confirmation stays open, exposes error and does not retry itself',async({page})=>{
 await ready(page);await page.getByLabel('Kiểm tra lỗi callback UI',{exact:true}).check();
 await page.getByRole('button',{name:'Mở xác nhận UI',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Xác nhận callback UI',exact:true});
 await dialog.getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Lỗi callback thử nghiệm UI1');
 await expect(page.getByTestId('callback-count')).toContainText('0 callback');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('tabs skip disabled item, preserve draft and support Home/End',async({page})=>{
 await ready(page);const tabs=page.getByRole('tablist',{name:'Ví dụ tabs',exact:true});
 await page.getByLabel('Bản nháp trong tab',{exact:true}).fill('Không mất bản nháp');
 await tabs.getByRole('tab',{name:'Thông tin',exact:true}).focus();await page.keyboard.press('ArrowRight');
 await expect(tabs.getByRole('tab',{name:'Trạng thái',exact:true})).toBeFocused();await page.keyboard.press('Home');
 await expect(page.getByLabel('Bản nháp trong tab',{exact:true})).toHaveValue('Không mất bản nháp');
 await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:'Trạng thái',exact:true})).toHaveAttribute('aria-selected','true');
});
test('tooltip is keyboard discoverable/dismissible and toast can close',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Thông tin tooltip',exact:true}).focus();
 await expect(page.getByRole('tooltip')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toBeHidden();
 await page.getByRole('button',{name:'Mở thông báo',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Thông báo UI1'})).toBeVisible();
 await page.getByRole('button',{name:'Đóng thông báo',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Thông báo UI1'})).toHaveCount(0);
});
test('legacy wrappers still use value callbacks and native controls',async({page})=>{
 await ready(page);await page.getByLabel('Legacy Select',{exact:true}).selectOption('B');
 await expect(page.getByTestId('legacy-value')).toHaveText('Giá trị legacy: B');
 await expect(page.locator('.card.ri-card').last()).toBeVisible();await expect(page.locator('.badge.ri-badge').last()).toBeVisible();
});
test('keyboard focus visible and reduced motion removes animations',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
 await page.getByRole('button',{name:'Primary',exact:true}).focus();await page.keyboard.press('Tab');
 const outline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);expect(outline).not.toBe('none');
 for(const selector of ['.ri-spinner','.ri-skeleton-line'])expect(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('isolated server never forwards API or application HTML',async({request})=>{
 for(const url of ['/api/health','/index.html','/src/main.jsx'])expect((await request.get(url)).status()).toBe(403);
});
for(const width of [360,768,1440])for(const theme of ['light','dark']){
 test('responsive '+width+' / '+theme,async({page})=>{
  await page.setViewportSize({width,height:900});await ready(page);await page.getByLabel('Giao diện',{exact:true}).selectOption(theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Mở Drawer',exact:true}).click();
  const box=await page.getByRole('dialog',{name:'Drawer kiểm tra',exact:true}).boundingBox();expect(box.width).toBeLessThanOrEqual(width);expect(box.x).toBeGreaterThanOrEqual(-1);
  await page.keyboard.press('Escape');await page.screenshot({path:path.join(docs,'ui1-'+theme+'-'+width+'.png'),fullPage:true});
 });
}
