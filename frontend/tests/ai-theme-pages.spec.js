import {test,expect} from '@playwright/test';

const pages=[
  '/stock-operations',
  '/forecast',
  '/forecast/total',
  '/forecast/multi',
  '/alerts',
  '/replenishment'
];

test('six inventory and AI pages keep guide, cards and controls theme-safe',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const request=route.request();
    if(request.method()!=='GET')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=new URL(request.url()).pathname;
    const user={id:1,organization_id:101,name:'Theme Fixture',full_name:'Theme Fixture',email:'theme@example.invalid',role:'OWNER',branches:[{id:11,name:'Chi nhánh trung tâm'},{id:12,name:'Chi nhánh phụ'}]};
    let data={};
    if(path.endsWith('/auth/me'))data={user};
    else if(path.endsWith('/branches'))data={branches:user.branches};
    else if(path.endsWith('/settings'))data={general:{theme:'light'},ai:{forecastHorizonDays:14,safetyFactor:1.5}};
    else if(path.endsWith('/products'))data={items:[{id:1,sku:'SP-001',name:'Sản phẩm mẫu',status:'ACTIVE',stock:8,min_stock:5,cost_price:10000,sale_price:15000}],total:1,page:1};
    else if(path.endsWith('/ai/readiness'))data={status:'READY'};
    else if(path.endsWith('/ai/forecast'))data={status:'READY',items:[{product_id:1,sku:'SP-001',name:'Sản phẩm mẫu',quantity:10,predicted:10,stock:8,min_stock:5,recommended_quantity:7,days_of_supply:6,probability:.4,forecasts:[{horizon:1,quantity:10},{horizon:2,quantity:11},{horizon:3,quantity:12}]}],history:[{period:'2026-09',quantity:8},{period:'2026-10',quantity:9}]};
    else if(path.endsWith('/stock-operations'))data={items:[],total:0,page:1};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });

  await page.goto('/welcome');
  for(const theme of ['light','dark']){
    await page.evaluate(value=>localStorage.setItem('ri.theme',value),theme);
    for(const path of pages){
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      const guide=page.locator('.ai-feature-guide');
      await expect(guide).toBeVisible();
      const styles=await guide.evaluate(element=>{
        const section=getComputedStyle(element);
        const title=getComputedStyle(element.querySelector('strong'));
        const body=getComputedStyle(element.querySelector('p'));
        const icon=getComputedStyle(element.querySelector('.ai-feature-guide-icon'));
        const button=getComputedStyle(element.querySelector('.ai-feature-guide-dismiss'));
        const card=document.querySelector('.card');
        const control=document.querySelector('.ri-control');
        return {
          background:section.backgroundColor,
          border:section.borderTopColor,
          title:title.color,
          body:body.color,
          icon:icon.color,
          buttonBackground:button.backgroundColor,
          buttonBorder:button.borderTopColor,
          buttonText:button.color,
          cardBackground:card?getComputedStyle(card).backgroundColor:null,
          expectedCard:getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
          controlBackground:control?getComputedStyle(control).backgroundColor:null
        };
      });
      if(theme==='dark'){
        expect(styles).toMatchObject({
          background:'rgba(79, 70, 229, 0.13)',
          border:'rgba(129, 140, 248, 0.26)',
          title:'rgb(248, 250, 252)',
          body:'rgb(203, 213, 225)',
          icon:'rgb(129, 140, 248)',
          buttonBackground:'rgba(15, 23, 42, 0.65)',
          buttonBorder:'rgba(148, 163, 184, 0.25)',
          buttonText:'rgb(226, 232, 240)'
        });
        expect(styles.cardBackground).not.toBe('rgb(255, 255, 255)');
        if(styles.controlBackground)expect(styles.controlBackground).not.toBe('rgb(255, 255, 255)');
      }else{
        expect(styles.background).toBe('rgb(238, 242, 255)');
        expect(styles.border).toBe('rgb(199, 210, 254)');
      }
    }
  }
  expect(errors).toEqual([]);
});
