import {Router} from 'express';
import {z} from 'zod';
import {requireRoles} from '../middlewares/auth.js';
import {asyncRoute} from '../utils/http.js';
import {getSettings,saveSettings} from '../services/appSettings.js';

const router=Router();
const prefs=z.object({
 general:z.object({theme:z.enum(['light','dark','system']).optional(),sound:z.boolean().optional(),numberFormat:z.enum(['vi-VN','en-US']).optional(),timezone:z.string().max(80).optional()}).optional(),
 operations:z.object({autoPrint:z.boolean().optional(),receiptFooter:z.string().max(180).optional(),lowStockThreshold:z.number().finite().min(0).max(100000).optional(),dailyDigest:z.boolean().optional(),monthlyDigest:z.boolean().optional()}).optional()
}).strict();
router.get('/settings',requireRoles('OWNER','MANAGER','INVENTORY','CASHIER'),asyncRoute(async(req,res)=>res.json(await getSettings('USER',req.user.id))));
router.put('/settings',requireRoles('OWNER','MANAGER','INVENTORY','CASHIER'),asyncRoute(async(req,res)=>{
 const input=prefs.parse(req.body),current=await getSettings('USER',req.user.id),next={...current,...input,general:{...current.general,...input.general},operations:{...current.operations,...input.operations}};
 res.json(await saveSettings('USER',req.user.id,next));
}));
export async function getCurrentUserSettings(userId){return getSettings('USER',userId);}
export default router;
