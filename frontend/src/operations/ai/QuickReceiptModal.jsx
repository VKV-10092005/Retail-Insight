import React, { useEffect, useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import { request, money, vndNumber } from '../shared';

export default function QuickReceiptModal({ item, branchId, branchName, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState(String(item?.initialQuantity ?? 0));
  const [unitCost, setUnitCost] = useState(item?.costPrice == null ? '' : String(vndNumber(item.costPrice)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(()=>{
    if(!item)return;
    setQuantity(String(item.initialQuantity??0));
    setUnitCost(item.costPrice==null?'':String(vndNumber(item.costPrice)));
    setError('');
  },[item]);
  if (!item) return null;

  const submit = async event => {
    event.preventDefault();
    const qty = Number(quantity);
    const cost = vndNumber(unitCost);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) return setError('Số lượng nhập phải là số nguyên từ 1 đến 100.000.');
    if (!branchId) return setError('Chưa xác định được chi nhánh nhập kho.');
    if (unitCost === '' || !Number.isFinite(cost) || cost < 0) return setError('Đơn giá nhập phải là số hợp lệ từ 0 trở lên.');
    if (cost > 0 && cost < 100) return setError('Đơn giá nhập thấp hơn 100 VNĐ. Hãy kiểm tra lại, có thể bạn đang nhập theo đơn vị nghìn đồng.');
    setBusy(true);
    setError('');
    try {
      await request('/documents/receipts', {
        method: 'POST',
        body: {
          branch_id: Number(branchId),
          request_key: crypto.randomUUID(),
          note: `Nhập bổ sung từ ${item.source || 'trang Phân tích & AI'}`,
          items: [{ product_id: Number(item.product_id), quantity: qty, unit_cost: cost }]
        }
      });
      onSuccess(item, qty);
    } catch (err) {
      setError(err.message || 'Không thể tạo phiếu nhập kho.');
      setBusy(false);
    }
  };

  return <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-receipt-title" style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
      <div className="modal-head">
        <div><h2 id="quick-receipt-title" style={{ marginBottom: 4 }}>Nhập hàng vào kho</h2><p className="muted" style={{ margin: 0, fontSize: 13 }}>Chi nhánh: <strong>{branchName || `#${branchId}`}</strong></p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={18} /></button>
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <div className="table-scroll" style={{ border: '1px solid var(--ri-border)', borderRadius: 10 }}>
          <table className="data-table"><thead><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th style={{ textAlign: 'right' }}>Tồn hiện tại</th><th style={{ minWidth: 155 }}>Số lượng nhập thêm</th><th style={{ minWidth: 180 }}>Đơn giá nhập (VNĐ)</th></tr></thead>
            <tbody><tr><td><strong>{item.sku || `#${item.product_id}`}</strong></td><td>{item.name || `Sản phẩm #${item.product_id}`}</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(item.stock ?? 0).toLocaleString('vi-VN')}</td>
              <td><input autoFocus aria-label="Số lượng nhập thêm" type="number" inputMode="numeric" min="0" max="100000" step="1" className="ri-control" value={quantity} onChange={event => setQuantity(event.target.value)} /></td>
              <td><input aria-label="Đơn giá nhập (VNĐ)" type="number" inputMode="decimal" min="0" step=".01" className="ri-control" value={unitCost} onChange={event => setUnitCost(event.target.value)} placeholder={item.costPrice == null ? 'Nhập đơn giá vốn' : money(item.costPrice)} /></td>
            </tr></tbody>
          </table>
        </div>
        {error && <p className="auth-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="op-actions" style={{ justifyContent: 'flex-end', margin: 0 }}>
          {Number(quantity) > 0 && <button type="submit" className="btn btn-primary" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#4F46E5', borderColor: '#4F46E5' }}><PackagePlus size={16} />{busy ? 'Đang nhập kho…' : 'Xác nhận nhập kho'}</button>}
        </div>
      </form>
    </section>
  </div>;
}
