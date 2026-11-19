import { pool } from '../src/db/pool.js';

const OWNER_EMAIL = 'vovuong535@gmail.com';

const CATEGORIES_DATA = [
  {
    name: 'Nước giải khát',
    products: [
      { sku: 'NGK-COCA-320', name: 'Coca-Cola lon 320ml', sale_price: 10000, cost_price: 8500, unit: 'Lon', min_stock: 12 },
      { sku: 'NGK-PEPSI-320', name: 'Pepsi lon 320ml', sale_price: 10000, cost_price: 8000, unit: 'Lon', min_stock: 12 },
      { sku: 'NGK-7UP-320', name: '7Up lon 320ml', sale_price: 10000, cost_price: 8000, unit: 'Lon', min_stock: 12 },
      { sku: 'NGK-KHONGDO-455', name: 'Trà xanh Không Độ 455ml', sale_price: 10000, cost_price: 8000, unit: 'Chai', min_stock: 10 },
      { sku: 'NGK-REDBULL-250', name: 'Nước tăng lực Red Bull 250ml', sale_price: 14000, cost_price: 11500, unit: 'Lon', min_stock: 12 },
      { sku: 'NGK-STING-330', name: 'Nước tăng lực Sting dâu 330ml', sale_price: 10000, cost_price: 8000, unit: 'Chai', min_stock: 12 },
      { sku: 'NGK-TEAPLUS-455', name: 'Trà Ô Long Tea Plus 455ml', sale_price: 11000, cost_price: 9000, unit: 'Chai', min_stock: 10 },
      { sku: 'NGK-LAVIE-500', name: 'Nước khoáng Lavie 500ml', sale_price: 6000, cost_price: 4500, unit: 'Chai', min_stock: 15 },
      { sku: 'NGK-AQUAFINA-500', name: 'Nước tinh khiết Aquafina 500ml', sale_price: 6000, cost_price: 4500, unit: 'Chai', min_stock: 15 },
      { sku: 'NGK-TWISTER-455', name: 'Nước ép cam Twister 455ml', sale_price: 12000, cost_price: 9500, unit: 'Chai', min_stock: 10 },
      { sku: 'NGK-C2-DAO-455', name: 'Trà sữa C2 vị hồng trà đào 455ml', sale_price: 9000, cost_price: 7500, unit: 'Chai', min_stock: 10 },
      { sku: 'NGK-SANEST-190', name: 'Nước yến sào Sanest lon 190ml', sale_price: 38000, cost_price: 32000, unit: 'Lon', min_stock: 6 }
    ]
  },
  {
    name: 'Mì ăn liền và thực phẩm ăn nhanh',
    products: [
      { sku: 'MIL-HAOHAO-75', name: 'Mì Hảo Hảo tôm chua cay 75g', sale_price: 4500, cost_price: 3800, unit: 'Gói', min_stock: 30 },
      { sku: 'MIL-OMACHI-80', name: 'Mì Omachi sườn hầm ngũ quả 80g', sale_price: 9000, cost_price: 7200, unit: 'Gói', min_stock: 20 },
      { sku: 'MIL-KOKOMI-90', name: 'Mì Kokomi đại 90g', sale_price: 4000, cost_price: 3200, unit: 'Gói', min_stock: 24 },
      { sku: 'MIL-DENHAT-82', name: 'Mì Đệ Nhất thịt bằm 82g', sale_price: 7500, cost_price: 6000, unit: 'Gói', min_stock: 15 },
      { sku: 'MIL-CUNGDINH-80', name: 'Mì Cung Đình sườn hầm 80g', sale_price: 9500, cost_price: 7500, unit: 'Gói', min_stock: 15 },
      { sku: 'MIL-SAMYANG-140', name: 'Mì trộn tương đen Samyang cay 140g', sale_price: 28000, cost_price: 23000, unit: 'Gói', min_stock: 10 },
      { sku: 'MIL-LYHAOHAO-67', name: 'Mì ly Hảo Hảo tôm chua cay 67g', sale_price: 9500, cost_price: 7500, unit: 'Ly', min_stock: 12 },
      { sku: 'MIL-HUTIEU-65', name: 'Hủ tiếu Nam Vang Vifon 65g', sale_price: 8500, cost_price: 6800, unit: 'Gói', min_stock: 15 },
      { sku: 'MIL-PHOBO-65', name: 'Phở bò Vifon 65g', sale_price: 9000, cost_price: 7000, unit: 'Gói', min_stock: 15 },
      { sku: 'MIL-MIENPH-55', name: 'Miến Phú Hương sườn heo 55g', sale_price: 11000, cost_price: 8800, unit: 'Gói', min_stock: 15 },
      { sku: 'MIL-XXVISSAN-40', name: 'Xúc xích tiệt trùng Vissan heo 40g', sale_price: 6500, cost_price: 5000, unit: 'Cây', min_stock: 20 },
      { sku: 'MIL-CHAOCAYTHI-240', name: 'Cháo sườn thơm ngon Cây Thị 240g', sale_price: 21000, cost_price: 17000, unit: 'Gói', min_stock: 8 }
    ]
  },
  {
    name: 'Sữa và sản phẩm từ sữa',
    products: [
      { sku: 'SUA-VNM-CD-180', name: 'Sữa tươi Vinamilk có đường 180ml', sale_price: 9500, cost_price: 7800, unit: 'Hộp', min_stock: 24 },
      { sku: 'SUA-VNM-ITD-180', name: 'Sữa tươi Vinamilk ít đường 180ml', sale_price: 9500, cost_price: 7800, unit: 'Hộp', min_stock: 24 },
      { sku: 'SUA-TH-CD-180', name: 'Sữa tươi TH True Milk có đường 180ml', sale_price: 10500, cost_price: 8800, unit: 'Hộp', min_stock: 24 },
      { sku: 'SUA-TH-ITD-180', name: 'Sữa tươi TH True Milk ít đường 180ml', sale_price: 10500, cost_price: 8800, unit: 'Hộp', min_stock: 24 },
      { sku: 'SUA-MILO-200', name: 'Sữa dinh dưỡng Milo nắp vặn 200ml', sale_price: 11500, cost_price: 9500, unit: 'Hộp', min_stock: 20 },
      { sku: 'SUA-ONGTHO-380', name: 'Sữa đặc Có Đường Ông Thọ đỏ 380g', sale_price: 26000, cost_price: 22000, unit: 'Lon', min_stock: 12 },
      { sku: 'SUA-SCHUAVNM-100', name: 'Sữa chua ăn Vinamilk có đường 100g', sale_price: 7000, cost_price: 5500, unit: 'Hộp', min_stock: 16 },
      { sku: 'SUA-BETAGEN-400', name: 'Sữa chua uống Betagen hương tự nhiên 400ml', sale_price: 25000, cost_price: 21000, unit: 'Chai', min_stock: 8 },
      { sku: 'SUA-PROBI-65', name: 'Sữa chua uống Probi việt quất 65ml', sale_price: 6500, cost_price: 5200, unit: 'Chai', min_stock: 20 },
      { sku: 'SUA-FAMI-200', name: 'Sữa đậu nành Fami nguyên chất 200ml', sale_price: 5500, cost_price: 4500, unit: 'Hộp', min_stock: 24 },
      { sku: 'SUA-BOCOI-112', name: 'Phô mai Con Bò Cười 8 miếng 112g', sale_price: 40000, cost_price: 34000, unit: 'Hộp', min_stock: 6 },
      { sku: 'SUA-DIELAC1-400', name: 'Sữa bột Dielac Alpha Gold 1 400g', sale_price: 155000, cost_price: 130000, unit: 'Hộp', min_stock: 4 }
    ]
  },
  {
    name: 'Bánh kẹo và đồ ăn vặt',
    products: [
      { sku: 'BK-CHOCOPIE-396', name: 'Bánh ChocoPie Orion hộp 12 cái 396g', sale_price: 56000, cost_price: 48000, unit: 'Hộp', min_stock: 6 },
      { sku: 'BK-COSY-288', name: 'Bánh quy sữa Cosy Kinh Đô 288g', sale_price: 28000, cost_price: 23000, unit: 'Gói', min_stock: 10 },
      { sku: 'BK-CUSTAS-141', name: 'Bánh Custas kem trứng Orion 6 cái 141g', sale_price: 32000, cost_price: 27000, unit: 'Hộp', min_stock: 8 },
      { sku: 'BK-POCKY-40', name: 'Bánh que Pocky sôcôla Glico 40g', sale_price: 14000, cost_price: 11000, unit: 'Hộp', min_stock: 12 },
      { sku: 'BK-LAYS-56', name: "Snack khoai tây Lay's tự nhiên 56g", sale_price: 14000, cost_price: 11500, unit: 'Gói', min_stock: 15 },
      { sku: 'BK-OSTAR-63', name: "Snack khoai tây O'Star vị kim chi 63g", sale_price: 14000, cost_price: 11500, unit: 'Gói', min_stock: 15 },
      { sku: 'BK-CHUPACHUPS-90', name: 'Kẹo dẻo Chupa Chups lốc xoáy 90g', sale_price: 17000, cost_price: 14000, unit: 'Gói', min_stock: 12 },
      { sku: 'BK-COOLAIR-58', name: 'Kẹo cao su Cool Air hũ 58.4g', sale_price: 28000, cost_price: 23000, unit: 'Hũ', min_stock: 8 },
      { sku: 'BK-HATDIEU-150', name: 'Hạt điều rang muối Tân Tân 150g', sale_price: 50000, cost_price: 42000, unit: 'Lon', min_stock: 6 },
      { sku: 'BK-TAOKAENOI-32', name: 'Rong biển sấy giòn Tao Kae Noi vị cay 32g', sale_price: 27000, cost_price: 22000, unit: 'Gói', min_stock: 10 },
      { sku: 'BK-BMCHABONG-50', name: 'Bánh mì tươi chà bông Kinh Đô 50g', sale_price: 12000, cost_price: 9000, unit: 'Gói', min_stock: 12 },
      { sku: 'BK-ONEONE-150', name: 'Bánh gạo One One vị ngọt dịu 150g', sale_price: 29000, cost_price: 24000, unit: 'Gói', min_stock: 10 }
    ]
  },
  {
    name: 'Gia vị và thực phẩm khô',
    products: [
      { sku: 'GV-NAMNGU-900', name: 'Nước mắm Nam Ngư Đệ Nhị 900ml', sale_price: 29000, cost_price: 24000, unit: 'Chai', min_stock: 12 },
      { sku: 'GV-MAGGI-700', name: 'Nước tương Maggi Đậm Đặc 700ml', sale_price: 34000, cost_price: 28000, unit: 'Chai', min_stock: 12 },
      { sku: 'GV-SIMPLY-1L', name: 'Dầu ăn Simply đậu nành 1 lít', sale_price: 62000, cost_price: 54000, unit: 'Chai', min_stock: 12 },
      { sku: 'GV-NEPTUNE-1L', name: 'Dầu ăn Neptune Gold 1 lít', sale_price: 65000, cost_price: 56000, unit: 'Chai', min_stock: 12 },
      { sku: 'GV-KNORR-400', name: 'Hạt nêm Knorr thịt thăn tủy 400g', sale_price: 38000, cost_price: 32000, unit: 'Gói', min_stock: 15 },
      { sku: 'GV-AJI-454', name: 'Bột ngọt Ajinomoto 454g', sale_price: 36000, cost_price: 31000, unit: 'Gói', min_stock: 15 },
      { sku: 'GV-CHINSU-250', name: 'Tương ớt Chinsu 250g', sale_price: 15000, cost_price: 12500, unit: 'Chai', min_stock: 20 },
      { sku: 'GV-MUOI-1KG', name: 'Muối tinh I-ốt Bạc Liêu 1kg', sale_price: 8000, cost_price: 6000, unit: 'Gói', min_stock: 20 },
      { sku: 'GV-TIEUDH-55', name: 'Tiêu đen xay sọ Dh Foods 55g', sale_price: 28000, cost_price: 23000, unit: 'Hũ', min_stock: 10 },
      { sku: 'GV-GIAM-450', name: 'Giấm gạo lứt lên men Ajinomoto 450ml', sale_price: 14000, cost_price: 11000, unit: 'Chai', min_stock: 10 },
      { sku: 'GV-BOTBAP-150', name: 'Bột bắp TaiKy 150g', sale_price: 10000, cost_price: 8000, unit: 'Gói', min_stock: 10 },
      { sku: 'GV-DUONGBH-1KG', name: 'Đường tinh luyện Biên Hòa Daily 1kg', sale_price: 29000, cost_price: 25000, unit: 'Gói', min_stock: 20 }
    ]
  },
  {
    name: 'Đồ hộp và thực phẩm đóng gói',
    products: [
      { sku: 'DH-CA3COGAI-155', name: 'Cá nục sốt cà chua Ba Cô Gái 155g', sale_price: 17500, cost_price: 14500, unit: 'Lon', min_stock: 18 },
      { sku: 'DH-HEOHAMVIS-150', name: 'Thịt heo hầm Vissan 150g', sale_price: 33000, cost_price: 28000, unit: 'Lon', min_stock: 10 },
      { sku: 'DH-PATEHALONG-170', name: 'Pate gan heo Hạ Long 170g', sale_price: 27000, cost_price: 23000, unit: 'Lon', min_stock: 12 },
      { sku: 'DH-CANGUSEA-140', name: 'Cá ngừ ngâm dầu Sea Crown 140g', sale_price: 37000, cost_price: 31000, unit: 'Lon', min_stock: 8 },
      { sku: 'DH-BAPNGOT-425', name: 'Bắp ngọt đóng hộp Song Hương 425g', sale_price: 26000, cost_price: 21000, unit: 'Lon', min_stock: 8 },
      { sku: 'DH-NAMROM-400', name: 'Nấm rơm đóng hộp Đồng Giao 400g', sale_price: 35000, cost_price: 29000, unit: 'Lon', min_stock: 6 },
      { sku: 'DH-XXCP-200', name: 'Xúc xích Cocktail tiệt trùng CP 200g', sale_price: 34000, cost_price: 28000, unit: 'Gói', min_stock: 8 },
      { sku: 'DH-CHABONG-100', name: 'Chà bông thịt heo Cầu Tre 100g', sale_price: 50000, cost_price: 42000, unit: 'Hũ', min_stock: 6 },
      { sku: 'DH-DAUDO-425', name: 'Đậu đỏ đóng hộp Hosen 425g', sale_price: 32000, cost_price: 26000, unit: 'Lon', min_stock: 6 },
      { sku: 'DH-HEO2LAT-150', name: 'Heo hai lát Vissan 150g', sale_price: 29000, cost_price: 24000, unit: 'Lon', min_stock: 10 },
      { sku: 'DH-VAINGAM-565', name: 'Trái vải ngâm đường Eufood 565g', sale_price: 53000, cost_price: 45000, unit: 'Lon', min_stock: 6 },
      { sku: 'DH-SUPLUON-200', name: 'Súp lươn đóng hộp Cây Thị 200g', sale_price: 26000, cost_price: 21000, unit: 'Gói', min_stock: 6 }
    ]
  },
  {
    name: 'Hóa mỹ phẩm và chất tẩy rửa',
    products: [
      { sku: 'HMP-SUNLIGHT-750', name: 'Nước rửa chén Sunlight chanh 750g', sale_price: 29000, cost_price: 24000, unit: 'Chai', min_stock: 15 },
      { sku: 'HMP-LAUSAN-1KG', name: 'Nước lau sàn Sunlight hương hoa hạ 1kg', sale_price: 32000, cost_price: 27000, unit: 'Chai', min_stock: 12 },
      { sku: 'HMP-COMFORT-18L', name: 'Nước xả vải Comfort một lần xả ban mai 1.8L', sale_price: 125000, cost_price: 110000, unit: 'Túi', min_stock: 8 },
      { sku: 'HMP-OMOMATIC-2KG', name: 'Nước giặt OMO Matic cửa trên túi 2kg', sale_price: 142000, cost_price: 125000, unit: 'Túi', min_stock: 8 },
      { sku: 'HMP-ABA-770', name: 'Bột giặt Aba hương nước hoa 770g', sale_price: 32000, cost_price: 27000, unit: 'Túi', min_stock: 10 },
      { sku: 'HMP-VIM-880', name: 'Nước tẩy bồn cầu Vim diệt khuẩn xanh 880ml', sale_price: 40000, cost_price: 34000, unit: 'Chai', min_stock: 10 },
      { sku: 'HMP-GLADE-280', name: 'Xịt phòng Glade hương sớm mai 280ml', sale_price: 45000, cost_price: 38000, unit: 'Chai', min_stock: 6 },
      { sku: 'HMP-JAVEL-1L', name: 'Nước tẩy quần áo Javel Mỹ Hảo 1 lít', sale_price: 19000, cost_price: 15000, unit: 'Chai', min_stock: 8 },
      { sku: 'HMP-RTLIFEBUOY-450', name: 'Nước rửa tay Lifebuoy bảo vệ vượt trội 450g', sale_price: 54000, cost_price: 46000, unit: 'Túi', min_stock: 10 },
      { sku: 'HMP-RAID-600', name: 'Bình xịt côn trùng Raid hương cam chanh 600ml', sale_price: 72000, cost_price: 62000, unit: 'Chai', min_stock: 6 },
      { sku: 'HMP-SUMO-175', name: 'Bột thông cống Sumo 175g', sale_price: 30000, cost_price: 24000, unit: 'Gói', min_stock: 8 },
      { sku: 'HMP-SCOTCH-3M', name: 'Khăn lau bếp đa năng Scotch-Brite 3 miếng', sale_price: 32000, cost_price: 26000, unit: 'Gói', min_stock: 10 }
    ]
  },
  {
    name: 'Chăm sóc cá nhân',
    products: [
      { sku: 'CSC-CLEAR-630', name: 'Dầu gội Clear thảo dược sạch gàu 630g', sale_price: 162000, cost_price: 142000, unit: 'Chai', min_stock: 6 },
      { sku: 'CSC-SUNSILK-650', name: 'Dầu gội Sunsilk óng mượt rạng ngời 650g', sale_price: 145000, cost_price: 125000, unit: 'Chai', min_stock: 6 },
      { sku: 'CSC-STLIFEBUOY-800', name: 'Sữa tắm Lifebuoy chăm sóc da 800g', sale_price: 155000, cost_price: 135000, unit: 'Chai', min_stock: 6 },
      { sku: 'CSC-COLGATE-225', name: 'Kem đánh răng Colgate ngừa sâu răng 225g', sale_price: 38000, cost_price: 32000, unit: 'Tuýp', min_stock: 12 },
      { sku: 'CSC-PS123-230', name: 'Kem đánh răng P/S bảo vệ 123 230g', sale_price: 34000, cost_price: 28000, unit: 'Tuýp', min_stock: 12 },
      { sku: 'CSC-BCCOLGATE-1C', name: 'Bàn chải đánh răng Colgate than hoạt tính', sale_price: 28000, cost_price: 22000, unit: 'Cây', min_stock: 15 },
      { sku: 'CSC-KOTEX-8M', name: 'Băng vệ sinh Kotex khô thoáng cánh 8 miếng', sale_price: 21000, cost_price: 17000, unit: 'Gói', min_stock: 15 },
      { sku: 'CSC-GILLETTE-VEC', name: 'Dao cạo râu Gillette Vector 1 cán 2 lưỡi', sale_price: 50000, cost_price: 42000, unit: 'Vỉ', min_stock: 8 },
      { sku: 'CSC-XBLIFEBUOY-90', name: 'Xà bông cục Lifebuoy bảo vệ vượt trội 90g', sale_price: 15000, cost_price: 12000, unit: 'Cục', min_stock: 20 },
      { sku: 'CSC-BOBBY-80M', name: 'Khăn ướt Bobby không mùi 80 miếng', sale_price: 38000, cost_price: 31000, unit: 'Gói', min_stock: 10 },
      { sku: 'CSC-NIVA-200Q', name: 'Tăm bông người lớn Niva hũ 200 que', sale_price: 20000, cost_price: 16000, unit: 'Hũ', min_stock: 12 },
      { sku: 'CSC-LISTERINE-250', name: 'Nước súc miệng Listerine Cool Mint 250ml', sale_price: 56000, cost_price: 48000, unit: 'Chai', min_stock: 8 }
    ]
  },
  {
    name: 'Đồ dùng gia đình',
    products: [
      { sku: 'DDG-PULPPY-10C', name: 'Giấy vệ sinh Pulppy 10 cuộn 3 lớp có lõi', sale_price: 88000, cost_price: 75000, unit: 'Lốc', min_stock: 8 },
      { sku: 'DDG-PULPPYRUT-180', name: 'Khăn giấy rút Pulppy 180 tờ 2 lớp', sale_price: 22000, cost_price: 18000, unit: 'Gói', min_stock: 15 },
      { sku: 'DDG-RINGO-50M', name: 'Màng bọc thực phẩm Ringo 30cm x 50m', sale_price: 39000, cost_price: 32000, unit: 'Hộp', min_stock: 10 },
      { sku: 'DDG-GOODFOIL-5M', name: 'Giấy bạc nướng thực phẩm Goodfoil 5m', sale_price: 30000, cost_price: 24000, unit: 'Cuộn', min_stock: 8 },
      { sku: 'DDG-TUIRAC-1KG', name: 'Túi rác đen tự hủy sinh học Opec 3 cuộn 1kg', sale_price: 46000, cost_price: 38000, unit: 'Bịch', min_stock: 10 },
      { sku: 'DDG-GANGTAY-M', name: 'Găng tay cao su tự nhiên Nam Long size M', sale_price: 23000, cost_price: 18000, unit: 'Đôi', min_stock: 12 },
      { sku: 'DDG-MIENGCO-3M', name: 'Miếng cọ rửa chén cước xanh 3M Scotch-Brite', sale_price: 9500, cost_price: 7000, unit: 'Miếng', min_stock: 20 },
      { sku: 'DDG-BIC-MAXI', name: 'Bật lửa Bic Maxi J26 chính hãng', sale_price: 15000, cost_price: 12000, unit: 'Cái', min_stock: 20 },
      { sku: 'DDG-PINAA-4V', name: 'Pin tiểu AA Panasonic khô lốc 4 viên', sale_price: 28000, cost_price: 22000, unit: 'Vỉ', min_stock: 10 },
      { sku: 'DDG-TUIINOCHI-2030', name: 'Túi đựng thực phẩm tự hủy sinh học Inochi 20x30cm', sale_price: 44000, cost_price: 36000, unit: 'Hộp', min_stock: 8 },
      { sku: 'DDG-CHOIDUYTTAN', name: 'Chổi quét nhà đót cán nhựa Duy Tân', sale_price: 45000, cost_price: 35000, unit: 'Cây', min_stock: 5 },
      { sku: 'DDG-KEPDUYTAN-20', name: 'Kẹp quần áo nhựa Duy Tân vỉ 20 cái', sale_price: 26000, cost_price: 21000, unit: 'Vỉ', min_stock: 8 }
    ]
  },
  {
    name: 'Thực phẩm thiết yếu',
    products: [
      { sku: 'TTE-GAOST25-5KG', name: 'Gạo ST25 Ông Cua túi 5kg chuẩn ngon', sale_price: 195000, cost_price: 175000, unit: 'Túi', min_stock: 6 },
      { sku: 'TTE-GAONANGTHOM-5KG', name: 'Gạo Nàng Thơm Chợ Đào túi 5kg', sale_price: 125000, cost_price: 110000, unit: 'Túi', min_stock: 6 },
      { sku: 'TTE-TRUNGBAHUAN-10', name: 'Trứng gà tươi Ba Huân vỉ 10 quả size L', sale_price: 33000, cost_price: 28000, unit: 'Vỉ', min_stock: 10 },
      { sku: 'TTE-TRUNGCUT-30', name: 'Trứng cút tươi Ba Huân hộp 30 quả', sale_price: 25000, cost_price: 20000, unit: 'Hộp', min_stock: 8 },
      { sku: 'TTE-BOTMI-1KG', name: 'Bột mì đa dụng hoa ngọc lan 1kg', sale_price: 25000, cost_price: 21000, unit: 'Gói', min_stock: 10 },
      { sku: 'TTE-DAUXANH-500', name: 'Đậu xanh tách vỏ Tài Ký 500g', sale_price: 32000, cost_price: 26000, unit: 'Gói', min_stock: 8 },
      { sku: 'TTE-DAUDEN-500', name: 'Đậu đen hạt nhỏ Tài Ký 500g', sale_price: 30000, cost_price: 24000, unit: 'Gói', min_stock: 8 },
      { sku: 'TTE-NEPSAP-1KG', name: 'Nếp sáp ngỗng đặc sản 1kg', sale_price: 34000, cost_price: 28000, unit: 'Gói', min_stock: 8 },
      { sku: 'TTE-G73IN1-18', name: 'Cà phê hòa tan G7 3in1 Trung Nguyên hộp 18 gói', sale_price: 54000, cost_price: 46000, unit: 'Hộp', min_stock: 10 },
      { sku: 'TTE-TNSANGTAO1-250', name: 'Cà phê rang xay Trung Nguyên Sáng Tạo 1 250g', sale_price: 68000, cost_price: 58000, unit: 'Gói', min_stock: 8 },
      { sku: 'TTE-LIPTON-25G', name: 'Trà Lipton nhãn vàng hộp 25 gói túi lọc', sale_price: 37000, cost_price: 31000, unit: 'Hộp', min_stock: 10 },
      { sku: 'TTE-MATONG-500', name: 'Mật ong hoa nhãn nguyên chất Đắk Lắk chai 500ml', sale_price: 105000, cost_price: 85000, unit: 'Chai', min_stock: 5 }
    ]
  }
];

async function seed() {
  const [users] = await pool.execute(
    'SELECT u.id, u.email, u.full_name, u.role, u.organization_id, o.name as org_name FROM users u LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.email = ?',
    [OWNER_EMAIL]
  );

  if (!users.length) {
    throw new Error(`Không tìm thấy tài khoản OWNER với email ${OWNER_EMAIL}`);
  }

  const user = users[0];
  const orgId = user.organization_id;

  if (!orgId) {
    throw new Error(`Tài khoản ${OWNER_EMAIL} chưa thuộc Organization nào.`);
  }

  console.log(`[SEED] Xác định đúng tài khoản OWNER: ${user.full_name} (${user.email}), Tenant ID: ${orgId}, Cửa hàng: ${user.org_name}`);

  // Đếm trước khi seed
  const [[catBefore]] = await pool.execute('SELECT COUNT(*) as total FROM categories WHERE organization_id = ?', [orgId]);
  const [[prodBefore]] = await pool.execute('SELECT COUNT(*) as total FROM products WHERE organization_id = ?', [orgId]);

  console.log(`[SEED] Trước khi chạy: Danh mục = ${catBefore.total}, Sản phẩm = ${prodBefore.total}`);

  let createdCategories = 0;
  let createdProducts = 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const catData of CATEGORIES_DATA) {
      // 1. Kiểm tra hoặc thêm Danh mục
      let categoryId;
      const [existingCats] = await conn.execute(
        'SELECT id FROM categories WHERE organization_id = ? AND name = ?',
        [orgId, catData.name]
      );

      if (existingCats.length > 0) {
        categoryId = existingCats[0].id;
      } else {
        const [catResult] = await conn.execute(
          'INSERT INTO categories (organization_id, name) VALUES (?, ?)',
          [orgId, catData.name]
        );
        categoryId = catResult.insertId;
        createdCategories++;
      }

      // 2. Kiểm tra hoặc thêm 12 Sản phẩm cho từng danh mục
      for (const prodData of catData.products) {
        const [existingProds] = await conn.execute(
          'SELECT id FROM products WHERE organization_id = ? AND sku = ?',
          [orgId, prodData.sku]
        );

        if (existingProds.length === 0) {
          const attributes = {
            unit: prodData.unit,
            barcode: prodData.sku, // Sử dụng mã định danh nội bộ làm barcode
            min_stock: prodData.min_stock
          };

          await conn.execute(
            `INSERT INTO products (organization_id, category_id, sku, name, sale_price, cost_price, attributes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [
              orgId,
              categoryId,
              prodData.sku,
              prodData.name,
              prodData.sale_price,
              prodData.cost_price,
              JSON.stringify(attributes)
            ]
          );
          createdProducts++;
        }
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Đếm sau khi seed
  const [[catAfter]] = await pool.execute('SELECT COUNT(*) as total FROM categories WHERE organization_id = ?', [orgId]);
  const [[prodAfter]] = await pool.execute('SELECT COUNT(*) as total FROM products WHERE organization_id = ?', [orgId]);
  const [[receiptsCheck]] = await pool.execute("SELECT COUNT(*) as total FROM stock_documents WHERE organization_id = ? AND type = 'RECEIPT'", [orgId]);
  const [[salesCheck]] = await pool.execute("SELECT COUNT(*) as total FROM stock_documents WHERE organization_id = ? AND type = 'SALE'", [orgId]);
  const [[stockCheck]] = await pool.execute("SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_balances WHERE organization_id = ?", [orgId]);

  console.log(`[SEED KẾT QUẢ]:`);
  console.log(`- Danh mục đã có trước: ${catBefore.total}`);
  console.log(`- Danh mục mới tạo: ${createdCategories}`);
  console.log(`- Tổng danh mục sau khi chạy: ${catAfter.total}`);
  console.log(`- Sản phẩm đã có trước: ${prodBefore.total}`);
  console.log(`- Sản phẩm mới tạo: ${createdProducts}`);
  console.log(`- Tổng sản phẩm sau khi chạy: ${prodAfter.total}`);
  console.log(`- Phiếu nhập thực tế: ${receiptsCheck.total} (Xác nhận 0 phiếu nhập giả)`);
  console.log(`- Hóa đơn thực tế: ${salesCheck.total} (Xác nhận 0 hóa đơn giả)`);
  console.log(`- Tồn kho khả dụng: ${stockCheck.total} (Xác nhận 0 tồn kho giả)`);

  process.exit(0);
}

seed().catch(err => {
  console.error('[SEED LỖI]:', err);
  process.exit(1);
});
