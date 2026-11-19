import React from 'react';
import ForecastSku from './ai/ForecastSku';
import ForecastTotal from './ai/ForecastTotal';
import ForecastMulti from './ai/ForecastMulti';
import StockoutAlerts from './ai/StockoutAlerts';
import Replenishment from './ai/Replenishment';

export {
  ForecastSku,
  ForecastTotal,
  ForecastMulti,
  StockoutAlerts,
  Replenishment
};

/**
 * AI Dispatcher Component
 * Điều hướng hiển thị đúng giao diện chuyên biệt cho từng tác vụ phân tích AI
 * tương ứng với 5 route trong hệ thống:
 * - task="sku"           -> /forecast        (Dự báo nhu cầu từng SKU)
 * - task="total"         -> /forecast/total  (Dự báo tổng nhu cầu chi nhánh)
 * - task="multi"         -> /forecast/multi  (Dự báo chuỗi thời gian nhiều tháng)
 * - task="stockout"      -> /alerts          (Cảnh báo nguy cơ thiếu hàng)
 * - task="replenishment" -> /replenishment   (Gợi ý bổ sung hàng hóa thông minh)
 */
export default function AI({task = 'sku'}) {
  switch (task) {
    case 'sku':
      return <ForecastSku />;
    case 'total':
      return <ForecastTotal />;
    case 'multi':
      return <ForecastMulti />;
    case 'stockout':
    case 'alerts':
      return <StockoutAlerts />;
    case 'replenishment':
      return <Replenishment />;
    default:
      return <ForecastSku />;
  }
}
