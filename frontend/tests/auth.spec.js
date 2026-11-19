import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
dotenv.config({path:new URL('../../backend/.env',import.meta.url)});
test('register, login, restore session, real dashboard and logout',async({page,context})=>{
 const {connectionOptions,verifyDatabase}=await import('../../backend/src/db/pool.js');const {createRequire}=await import('node:module');const mysql=createRequire(new URL('../../backend/package.json',import.meta.url))('mysql2/promise');const pool=mysql.createPool(connectionOptions);
 await verifyDatabase(pool);
 const email=`sprint1-browser-${randomUUID()}@example.test`,password='Browser-test-password-2026',store=`Browser Store ${randomUUID().slice(0,8)}`;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto('/');await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link',{name:'Đăng ký cửa hàng',exact:true}).click();
  await page.getByLabel('Họ tên').fill('Browser Test');await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Tên cửa hàng').fill(store);await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button',{name:'Đăng ký',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản');
  await page.getByRole('link',{name:'Đăng nhập',exact:true}).first().click();
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill('wrong-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('heading',{name:store,exact:true})).toBeVisible();
  await expect(page.getByText(email,{exact:true})).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==='session');expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(()=>document.cookie.includes('session='))).toBe(false);
  await page.reload();await expect(page.getByRole('heading',{name:store,exact:true})).toBeVisible();
  await page.goto('/branches');await expect(page.getByRole('heading',{name:store,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
 } finally {
  const [rows]=await pool.execute('SELECT organization_id FROM users WHERE email=?',[email]);
  for(const {organization_id:id} of rows){for(const table of ['auth_sessions','user_branch_roles','branches','users'])await pool.execute(`DELETE FROM ${table} WHERE organization_id=?`,[id]);await pool.execute('DELETE FROM organizations WHERE id=?',[id]);}
  await pool.end();
 }
});
