// Offline catalogue based on VietQR Kit's public bank directory. The manual BIN
// option remains available because the directory can change independently.
export const VIETQR_BANKS=[
 {bin:'970415',code:'ICB',name:'VietinBank'},{bin:'970436',code:'VCB',name:'Vietcombank'},{bin:'970418',code:'BIDV',name:'BIDV'},{bin:'970405',code:'VBA',name:'Agribank'},
 {bin:'970448',code:'OCB',name:'OCB'},{bin:'970422',code:'MB',name:'MB Bank'},{bin:'970407',code:'TCB',name:'Techcombank'},{bin:'970416',code:'ACB',name:'ACB'},
 {bin:'970432',code:'VPB',name:'VPBank'},{bin:'970423',code:'TPB',name:'TPBank'},{bin:'970403',code:'STB',name:'Sacombank'},{bin:'970437',code:'HDB',name:'HDBank'},
 {bin:'970454',code:'VCCB',name:'BVBank / VietCapitalBank'},{bin:'970429',code:'SCB',name:'SCB'},{bin:'970441',code:'VIB',name:'VIB'},{bin:'970443',code:'SHB',name:'SHB'},
 {bin:'970431',code:'EIB',name:'Eximbank'},{bin:'970426',code:'MSB',name:'MSB'},{bin:'546034',code:'CAKE',name:'CAKE by VPBank'},{bin:'546035',code:'UBank',name:'Ubank by VPBank'},
 {bin:'963388',code:'TIMO',name:'Timo'},{bin:'971005',code:'VTLMONEY',name:'Viettel Money'},{bin:'971011',code:'VNPTMONEY',name:'VNPT Money'},{bin:'970400',code:'SGICB',name:'Saigonbank'},
 {bin:'970409',code:'BAB',name:'Bac A Bank'},{bin:'971133',code:'PVDB',name:'PVcomBank Pay'},{bin:'971025',code:'MOMO',name:'MoMo'},{bin:'970412',code:'PVCB',name:'PVcomBank'},
 {bin:'970414',code:'MBV',name:'MBV'},{bin:'970419',code:'NCB',name:'NCB'},{bin:'970424',code:'SHBVN',name:'Shinhan Bank'},{bin:'970425',code:'ABB',name:'ABBank'},
 {bin:'970427',code:'VAB',name:'VietABank'},{bin:'970428',code:'NAB',name:'Nam A Bank'},{bin:'970430',code:'PGB',name:'PGBank'},{bin:'970433',code:'VIETBANK',name:'VietBank'},
 {bin:'970438',code:'BVB',name:'BaoVietBank'},{bin:'970440',code:'SEAB',name:'SeABank'},{bin:'970446',code:'COOPBANK',name:'Co-opBank'},{bin:'970449',code:'LPB',name:'LPBank (LienVietPostBank)'},
 {bin:'970452',code:'KLB',name:'KienlongBank'},{bin:'668888',code:'KBANK',name:'Kasikornbank'},{bin:'970466',code:'KEBHANAHCM',name:'KEB Hana Bank HCMC'},{bin:'970467',code:'KEBHANAHN',name:'KEB Hana Bank Hanoi'},
 {bin:'977777',code:'MAFC',name:'Mirae Asset Finance'},{bin:'999888',code:'VBSP',name:'Vietnam Bank for Social Policies'},{bin:'963668',code:'BNPHN',name:'BNP Paribas Hanoi'},{bin:'555666',code:'BIDC',name:'BIDC'},
 {bin:'963666',code:'BNPHCM',name:'BNP Paribas HCMC'},{bin:'971101',code:'ZALOPAY',name:'ZaloPay'},{bin:'963688',code:'BOCHK',name:'Bank of China HCMC'},{bin:'970465',code:'BSP',name:'SinoPac HCMC'},
 {bin:'168999',code:'CUBHCM',name:'Cathay United Bank HCMC'},{bin:'963686',code:'ESUN',name:'E.SUN Bank Dong Nai'},{bin:'963669',code:'ICBC',name:'ICBC Hanoi'},{bin:'971032',code:'MVAS',name:'MobiFone Money'},
 {bin:'963326',code:'TNEX',name:'TNEX by MSB'},{bin:'458761',code:'HSBC',name:'HSBC'},{bin:'970442',code:'HLBVN',name:'Hong Leong Bank'},{bin:'970455',code:'IBKHN',name:'Industrial Bank of Korea Hanoi'},
 {bin:'970456',code:'IBKHCM',name:'Industrial Bank of Korea HCMC'},{bin:'970434',code:'IVB',name:'IndovinaBank'},{bin:'970406',code:'VIKKI',name:'Vikki Digital Bank'},{bin:'801011',code:'NHBHN',name:'Nonghyup Hanoi'},
 {bin:'796500',code:'DBS',name:'DBS HCMC'},{bin:'970439',code:'PBVN',name:'Public Bank Vietnam'},{bin:'970410',code:'SCVN',name:'Standard Chartered Vietnam'},{bin:'533948',code:'CITIBANK',name:'Citibank Hanoi'},
 {bin:'422589',code:'CIMB',name:'CIMB Vietnam'},{bin:'970458',code:'UOB',name:'UOB HCMC'},{bin:'970444',code:'CBB',name:'CBBank / Vietcombank Neo'},{bin:'970408',code:'GPB',name:'GPBank'},
 {bin:'970421',code:'VRB',name:'Vietnam-Russia Joint Venture Bank'},{bin:'970457',code:'WVN',name:'Woori Bank Vietnam'},{bin:'970462',code:'KBHN',name:'Kookmin Bank Hanoi'},{bin:'970463',code:'KBHCM',name:'Kookmin Bank HCMC'}
].map(bank=>({...bank,logo:`https://api.vietqr.io/img/${bank.code}.png`}));
