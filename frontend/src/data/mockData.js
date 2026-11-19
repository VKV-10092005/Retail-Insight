// DỮ LIỆU DEMO: chỉ số tổng hợp từ kết quả nghiên cứu, bản ghi chi tiết là ví dụ giao diện.
export const kpis = {revenue:332230025498, unitsSold:1174509, forecast:26029.41, order:18097, products:94867, branches:8, coveredSkus:12085, forecastSkus:27411};
export const salesTrend = [
 {month:'01/22',revenue:29.6,units:96457},{month:'02/22',revenue:13.13,units:44906},{month:'03/22',revenue:10.15,units:36253},{month:'04/22',revenue:19.14,units:80694},{month:'05/22',revenue:12.89,units:51016},{month:'06/22',revenue:12.82,units:50815},{month:'07/22',revenue:21.56,units:90353},{month:'08/22',revenue:26.70,units:99550},{month:'09/22',revenue:14.83,units:49531},{month:'10/22',revenue:14.26,units:44096},{month:'11/22',revenue:23.35,units:76868},{month:'12/22',revenue:29.59,units:87401},
 {month:'01/23',revenue:23.27,units:67121},{month:'02/23',revenue:10.40,units:35066},{month:'03/23',revenue:11.97,units:41715},{month:'04/23',revenue:18.75,units:74651},{month:'05/23',revenue:10.63,units:40642},{month:'06/23',revenue:10.74,units:38337},{month:'07/23',revenue:18.45,units:69037}
];
export const branches = [
 {id:1100,name:'Chi nhánh 1100',region:'Khu vực A',status:'Hoạt động',orders:3812},{id:1200,name:'Chi nhánh 1200',region:'Khu vực B',status:'Hoạt động',orders:2406},{id:1300,name:'Chi nhánh 1300',region:'Khu vực C',status:'Hoạt động',orders:1780},{id:1400,name:'Chi nhánh 1400',region:'Khu vực D',status:'Hoạt động',orders:1525},{id:1500,name:'Chi nhánh 1500',region:'Khu vực E',status:'Hoạt động',orders:1236},{id:1600,name:'Chi nhánh 1600',region:'Khu vực F',status:'Hoạt động',orders:1110},{id:1700,name:'Chi nhánh 1700',region:'Khu vực G',status:'Hoạt động',orders:954},{id:1800,name:'Chi nhánh 1800',region:'Khu vực H',status:'Hoạt động',orders:840}
];
export const productSeeds = [
 ['26a3574e5e244ae0a948296c80232780XNH25','Sản phẩm XNH25','Thời trang',120000,51,128.3125,'SKU bán thường xuyên'],
 ['d3fdadf707de46058009b94b2e4a86fdTRG25','Sản phẩm TRG25','Thời trang',159000,26,73.6875,'Cần bổ sung'],
 ['c0ad24e036be4f268fd5fe889834c0afXNH23','Sản phẩm XNH23','Thời trang',89000,27,71.375,'Bán thường xuyên'],
 ['841b43d2d4d3472aa5e4763af2b9871eTRG25','Sản phẩm TRG25-B','Phụ kiện',99000,23,47.6978,'Bán gián đoạn'],
 ['33628652d1c841819a0dfe5901425e8dXAM25','Sản phẩm XAM25','Thời trang',135000,18,44.0251,'Bán thường xuyên'],
 ['2cf1ddd734ad4181aad28e927a5a2406NAU39','Sản phẩm NAU39','Giày dép',219000,17,41.4035,'Cần bổ sung'],
 ['cfdc28cea6234b4987ef50cba4a92fadDEN25','Sản phẩm DEN25','Thời trang',175000,22,44.6847,'Bán gián đoạn'],
 ['224646772819482082b60b93770a92f1HOG23','Sản phẩm HOG23','Phụ kiện',45000,18,40.8128,'Cần bổ sung'],
 ['260ea12c2d284536b01f71b51b62b58fTRG25','Sản phẩm TRG25-C','Thời trang',125000,18,38.0703,'Bán thường xuyên'],
 ['94cce9953db8421eb820800409dee7a9XAM23','Sản phẩm XAM23','Giày dép',230000,14,33.8728,'Cần bổ sung']
];
export const products=productSeeds.map(([id,name,category,price,stock,forecast,tag],index)=>({id,name,category,price,stock,forecast,tag,branch:index===5?1400:1100,code:id.slice(-5),status:stock<30?'Cần theo dõi':'Ổn định'}));
export const replenishment = [
 [1100,0,128.3125,51,154,103],[1100,1,73.6875,26,89,63],[1100,2,71.375,27,86,59],[1100,3,47.6978,23,58,35],[1100,4,44.0251,18,53,35],[1400,5,41.4035,17,50,33],[1100,6,44.6847,22,54,32],[1100,7,40.8128,18,49,31],[1100,8,38.0703,18,46,28],[1100,9,33.8728,14,41,27]
].map(([branch,idx,forecast,stock,target,order])=>({id:`RP-${idx+1}`,branch,product:products[idx],forecast,stock,target,order,status:'REPLENISH',source:'SIMULATED'}));
export const inventory=products.map((p,i)=>({...p,opening:[0,63,0,38,44,17,12,35,6,11][i],sold:[311,393,266,305,293,466,251,248,261,247][i],received:[362,395,298,317,297,525,283,257,304,277][i],date:'31/07/2023',source:'SIMULATED'}));
export const segments=[{name:'Bán thường xuyên',wape:53.52,share:45.36,count:10510,color:'#4f69dc'},{name:'Bán gián đoạn',wape:99.93,share:38.68,count:23412,color:'#e1a44d'},{name:'Không bán 3 tháng',wape:107.81,share:15.95,count:48311,color:'#8b92a7'}];
export const modelComparisons=[{name:'SES α=0,5',mae:0.6605,rmse:1.8477,wape:72.33,chosen:true},{name:'Lag-1',mae:0.6765,rmse:1.8877,wape:74.07},{name:'Moving Average 2',mae:0.6586,rmse:1.8557,wape:72.12}];
