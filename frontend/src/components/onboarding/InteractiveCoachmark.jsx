import React,{useEffect,useState} from 'react';
import {MousePointerClick} from 'lucide-react';
import './InteractiveCoachmark.css';

const aiRouteAliases={
  '/forecast':'/ai/forecast-sku',
  '/forecast/total':'/ai/forecast-total',
  '/forecast/multi':'/ai/forecast-multi',
  '/alerts':'/ai/stockout-alerts',
  '/replenishment':'/ai/replenishment'
};

export const EXCLUDED_COACHMARK_PATHS=new Set(['/agency-profile','/welcome','/login','/register']);

export const PAGE_TOUR_SCENARIOS={
  '/profile':[
    {id:'profile-avatar',selector:'.profile-avatar-row',message:'Tải ảnh đại diện hoặc xóa ảnh hiện tại tại đây. Ảnh được cắt vuông và cập nhật cho tài khoản của bạn.'},
    {id:'profile-details',selector:'.profile-avatar-row ~ form',message:'Chỉnh sửa họ tên, thông tin cửa hàng, số điện thoại và tiểu sử. Hệ thống tự động lưu sau khi bạn ngừng nhập.'}
  ],
  '/sales':[
    {id:'sales-catalog',selector:'.pos-catalog',message:'Tìm theo tên hoặc mã sản phẩm, lọc theo danh mục rồi nhấn vào mặt hàng để thêm vào giỏ bán.'},
    {id:'sales-checkout',selector:'.pos-cart-panel',message:'Kiểm tra số lượng, giảm giá và ghi chú trong giỏ; sau đó chuyển sang Thanh toán để thu tiền và hoàn tất hóa đơn.'}
  ],
  '/products':[
    {id:'products-filters',selector:'.products-container .op-toolbar',message:'Tra cứu danh mục hàng hóa theo mã, tên, danh mục, trạng thái kinh doanh hoặc chi nhánh.'},
    {id:'products-list',selector:'.products-container > .card:last-of-type',message:'Danh sách bên dưới dùng để xem tồn kho, giá bán và trạng thái; chọn hoặc sửa từng sản phẩm để nhập kho và cập nhật thông tin.'}
  ],
  '/receipts':[
    {id:'receipts-tabs',selector:'.receipts-tabs',message:'Chọn lập phiếu từng món, nhập hàng loạt từ CSV/Excel hoặc xem lại lịch sử phiếu nhập kho.'},
    {id:'receipts-form',selector:'[data-tour="receipt-form"]',message:'Chọn chi nhánh và sản phẩm, nhập số lượng, giá vốn, giá bán rồi lưu phiếu để cộng tồn kho.'}
  ],
  '/stock-operations':[
    {id:'stock-operation-tabs',selector:'.stock-operation-tabs',message:'Chuyển giữa Kiểm kê tồn kho và Điều chuyển kho tùy nghiệp vụ bạn cần thực hiện.'},
    {id:'stock-operation-form',selector:'.page-content .op-form',message:'Nhập chi nhánh, sản phẩm và số lượng thực tế để cân đối tồn, hoặc lập phiếu chuyển hàng giữa hai chi nhánh.'}
  ],
  '/reports':[
    {id:'reports-filters',selector:'.reports-bi-container .op-filters',message:'Chọn khoảng ngày, phạm vi chi nhánh, danh mục và độ chi tiết để phân tích đúng kỳ kinh doanh.'},
    {id:'reports-results',selector:'.reports-bi-container .op-filters .btn-primary',message:'Xuất kết quả ra CSV; các khu vực bên dưới giúp theo dõi doanh thu, hiệu quả mặt hàng và luân chuyển tồn kho.'}
  ],
  '/ai/forecast-sku':[
    {id:'forecast-sku-scope',selector:'.ai-filters-card .ai-filter-item:nth-child(1)',message:'Chọn chi nhánh có dữ liệu bán hàng mà bạn muốn dùng để dự báo nhu cầu.'},
    {id:'forecast-sku-product',selector:'.ai-filters-card .ai-filter-item:nth-child(3)',message:'Tìm và chọn một sản phẩm; hệ thống sẽ dự báo nhu cầu kỳ tới và hiển thị chuỗi lịch sử cùng tham số mô hình.'}
  ],
  '/ai/forecast-total':[
    {id:'forecast-total-branch',selector:'.ai-filters-card .ai-filter-item:nth-child(1)',message:'Chọn chi nhánh để tổng hợp sức mua của toàn bộ hàng hóa trong phạm vi cần lập kế hoạch.'},
    {id:'forecast-total-period',selector:'.ai-filters-card .ai-filter-item:nth-child(2)',message:'Chọn kỳ dự báo gốc để xem xu hướng tổng nhu cầu, hỗ trợ chuẩn bị ngân sách nhập hàng và nhân sự.'}
  ],
  '/ai/forecast-multi':[
    {id:'forecast-multi-filters',selector:'.ai-page-container .ai-filter-grid',message:'Chọn chi nhánh, tháng gốc và tìm các sản phẩm cần chạy dự báo hàng loạt.'},
    {id:'forecast-multi-selection',selector:'.ai-page-container .ai-filter-grid ~ div:last-child',message:'Đánh dấu nhiều sản phẩm hoặc dùng Chọn tất cả; kết quả sẽ so sánh nhu cầu các kỳ và cảnh báo mặt hàng chạm tồn tối thiểu.'}
  ],
  '/ai/stockout-alerts':[
    {id:'stockout-risk',selector:'.ai-filters-card .ai-filter-item:nth-child(2)',message:'Lọc theo mức rủi ro để ưu tiên mặt hàng có thể hết trước cửa sổ dự báo.'},
    {id:'stockout-search',selector:'.ai-filters-card .ai-filter-item:nth-child(3)',message:'Tìm theo mã hoặc tên sản phẩm, xem tồn hiện tại và nhu cầu dự kiến rồi mở thao tác nhập hàng cho mặt hàng cần xử lý.'}
  ],
  '/ai/replenishment':[
    {id:'replenishment-status',selector:'.ai-filters-card .ai-filter-item:nth-child(2)',message:'Lọc các mặt hàng cần nhập, đã đủ tồn hoặc toàn bộ danh mục theo chi nhánh bổ sung.'},
    {id:'replenishment-search',selector:'.ai-filters-card .ai-filter-item:nth-child(3)',message:'Tìm sản phẩm, kiểm tra lượng AI đề xuất và vốn ước tính; bạn có thể chỉnh số lượng trước khi tạo phiếu nhập kho.'}
  ]
};

export function getPageTourScenario(pathname){
  if(EXCLUDED_COACHMARK_PATHS.has(pathname))return null;
  return PAGE_TOUR_SCENARIOS[aiRouteAliases[pathname]||pathname]||null;
}

export default function InteractiveCoachmark({target,step=1,total=1,message,onContinue,onSkip,continueLabel='Tiếp tục',showContinue=true}){
  const [rect,setRect]=useState(null);
  useEffect(()=>{
    const update=()=>{
      if(!target){setRect(null);return;}
      const selectors=target.split(',').map(s=>s.trim()).filter(Boolean);
      let foundNode=null;
      let foundBox=null;
      for(const sel of selectors){
        const el=document.querySelector(sel);
        if(el){
          const b=el.getBoundingClientRect();
          if(b.width>0&&b.height>0){
            foundNode=el;
            foundBox=b;
            break;
          }
        }
      }
      if(!foundNode||!foundBox){setRect(null);return;}
      setRect({top:foundBox.top,left:foundBox.left,width:foundBox.width,height:foundBox.height});
    };
    update();
    const timer=setInterval(update,400);
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    return()=>{
      clearInterval(timer);
      window.removeEventListener('resize',update);
      window.removeEventListener('scroll',update,true);
    };
  },[target]);

  if(!rect)return null;
  let cardTop=rect.top+rect.height+14;
  if(cardTop+180>window.innerHeight&&rect.top>190){
    cardTop=Math.max(16,rect.top-175);
  }else{
    cardTop=Math.min(Math.max(16,cardTop),window.innerHeight-190);
  }
  const cardLeft=Math.min(Math.max(16,rect.left),window.innerWidth-340);

  return <div className="interactive-tour-layer" role="region" aria-live="polite" aria-label="Hướng dẫn thao tác">
    <div className="interactive-tour-target" style={{top:rect.top-5,left:rect.left-5,width:rect.width+10,height:rect.height+10}}/>
    <div className="interactive-tour-click-ripple" style={{top:rect.top+rect.height-7,left:rect.left+rect.width-7}} aria-hidden="true"/>
    <span className="interactive-tour-pointer-badge" style={{top:rect.top+rect.height-18,left:rect.left+rect.width-18}} aria-hidden="true"><MousePointerClick size={22} strokeWidth={2.5}/></span>
    <section className="interactive-tour-card" style={{top:cardTop,left:cardLeft}}>
      <div className="interactive-tour-badge">Bước {step}/{total}</div>
      <p>{message}</p>
      <div className="interactive-tour-actions">
        {showContinue&&<button type="button" className="btn btn-primary btn-sm" onClick={onContinue}>{continueLabel}</button>}
        <button type="button" className="interactive-tour-skip" onClick={onSkip}>Bỏ qua hướng dẫn</button>
      </div>
    </section>
  </div>;
}
