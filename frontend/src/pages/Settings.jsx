import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Music,
  Printer,
  Settings as SettingsIcon,
  Monitor,
  ShieldCheck,
  Volume2,
  Sparkles,
  Receipt,
  ChevronDown,
  Search,
  ChevronsUpDown,
} from 'lucide-react';
import { PageHeader } from '../components/ui/Elements';
import { useTheme } from '../design-system';
import { request } from '../operations/shared';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import { cacheAppSettings, DEFAULT_SETTINGS, readAppSettings } from '../services/appSettings';
import { NOTIFICATION_SOUND_TONES, playNotificationSound } from '../utils/notificationSound';
import './Settings.css';

const defaults = {
  ...DEFAULT_SETTINGS.general,
  ...DEFAULT_SETTINGS.operations,
  ...DEFAULT_SETTINGS.ai,
  ...DEFAULT_SETTINGS.platform,
};

export default function Settings() {
  const { user } = useAuth();
  const { preference, setTheme } = useTheme();
  const platform = user?.role === 'PLATFORM_ADMIN';
  const { activeBranchId, activeBranch } = useBranch();
  const canSell = ['OWNER', 'MANAGER', 'CASHIER'].includes(user?.role);
  const canOperate = ['OWNER', 'MANAGER', 'INVENTORY'].includes(user?.role);

  const [form, setForm] = useState({ ...defaults, theme: preference });
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [receiptForm, setReceiptForm] = useState({ store_phone: '', store_address: '', wifi_password: '' });
  const [receiptSaveState, setReceiptSaveState] = useState('');
  const receiptTimer = useRef(null);

  const formRef = useRef(form);
  const debounceRef = useRef(null);
  const saveStateTimer = useRef(null);
  const writeQueue = useRef(Promise.resolve());
  const writeVersion = useRef(0);

  // Accordion State: Mặc định mở sẵn dòng đầu tiên ('general')
  const [openSections, setOpenSections] = useState({
    general: true,
    sales: false,
    receipt: false,
    inventory: false,
    ai: false,
    platform: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    setForm((current) => ({ ...current, theme: preference }));
  }, [preference]);

  useEffect(() => {
    let live = true;
    const path = platform ? '/platform/settings' : '/settings';
    request(path)
      .then((data) => {
        if (!live) return;
        const cached = readAppSettings(user?.id);
        const next = platform
          ? { ...defaults, ...cached.platform, ...data, ...data.general }
          : { ...defaults, ...cached.general, ...cached.operations, ...cached.ai, ...data.general, ...data.operations };
        formRef.current = next;
        cacheAppSettings(
          user?.id,
          platform
            ? { ...cached, platform: data, general: { ...cached.general, ...data.general } }
            : { ...cached, ...data, general: { ...cached.general, ...data.general }, operations: { ...cached.operations, ...data.operations } },
          user?.role
        );
        if (data.general?.theme) setTheme(data.general.theme);
        setForm(next);
        setInitial(next);
      })
      .catch((reason) => {
        if (!live) return;
        setError(reason.message || 'Không tải được cài đặt.');
        const cached = readAppSettings(user?.id);
        const next = { ...defaults, ...cached.general, ...cached.operations, ...cached.ai, ...cached.platform, theme: preference };
        formRef.current = next;
        setForm(next);
        setInitial(next);
      });
    return () => {
      live = false;
      clearTimeout(debounceRef.current);
      clearTimeout(saveStateTimer.current);
    };
  }, [user?.id, platform, preference, setTheme]);

  useEffect(() => {
    if (!activeBranchId || platform) return;
    request(`/branches/${activeBranchId}/receipt-settings`)
      .then((data) => {
        if (data) {
          setReceiptForm({
            store_phone: data.store_phone || '',
            store_address: data.store_address || '',
            wifi_password: data.wifi_password || '',
          });
        }
      })
      .catch(() => {});
  }, [activeBranchId, platform]);

  function updateReceipt(field, val) {
    const next = { ...receiptForm, [field]: val };
    setReceiptForm(next);
    setReceiptSaveState('saving');
    clearTimeout(receiptTimer.current);
    receiptTimer.current = setTimeout(() => {
      request(`/branches/${activeBranchId}/receipt-settings`, { method: 'PUT', body: next })
        .then(() => {
          setReceiptSaveState('saved');
          setTimeout(() => setReceiptSaveState(''), 2000);
        })
        .catch(() => setReceiptSaveState('error'));
    }, 600);
  }

  function persist(snapshot) {
    if (!initial) return;
    clearTimeout(debounceRef.current);
    clearTimeout(saveStateTimer.current);
    setError('');
    setSaveState('saving');
    const version = ++writeVersion.current;
    const cached = readAppSettings(user?.id);
    const local = platform
      ? {
          ...cached,
          platform: { maintenance: snapshot.maintenance, aiChatLimit: Number(snapshot.aiChatLimit), auditEnabled: snapshot.auditEnabled },
          general: { theme: snapshot.theme, sound: snapshot.sound, soundTone: snapshot.soundTone || 'ting-tong', numberFormat: snapshot.numberFormat, timezone: snapshot.timezone },
        }
      : {
          ...cached,
          general: { theme: snapshot.theme, sound: snapshot.sound, soundTone: snapshot.soundTone || 'ting-tong', numberFormat: snapshot.numberFormat, timezone: snapshot.timezone },
          operations: {
            ...(canSell ? { autoPrint: snapshot.autoPrint, receiptFooter: snapshot.receiptFooter } : {}),
            ...(canOperate ? { lowStockThreshold: Number(snapshot.lowStockThreshold), dailyDigest: snapshot.dailyDigest, monthlyDigest: snapshot.monthlyDigest } : {}),
          },
        };
    cacheAppSettings(user?.id, local, user?.role);
    if (snapshot.theme !== preference) setTheme(snapshot.theme);
    const path = platform ? '/platform/settings' : '/settings';
    const body = platform
      ? {
          maintenance: snapshot.maintenance,
          aiChatLimit: Number(snapshot.aiChatLimit),
          auditEnabled: snapshot.auditEnabled,
          general: { theme: snapshot.theme, sound: snapshot.sound, numberFormat: snapshot.numberFormat, timezone: snapshot.timezone },
        }
      : {
          general: { theme: snapshot.theme, sound: snapshot.sound, numberFormat: snapshot.numberFormat, timezone: snapshot.timezone },
          operations: {
            ...(canSell ? { autoPrint: snapshot.autoPrint, receiptFooter: snapshot.receiptFooter } : {}),
            ...(canOperate ? { lowStockThreshold: Number(snapshot.lowStockThreshold), dailyDigest: snapshot.dailyDigest, monthlyDigest: snapshot.monthlyDigest } : {}),
          },
        };
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(() => request(path, { method: 'PUT', body }))
      .then((result) => {
        if (version !== writeVersion.current) return;
        const base = readAppSettings(user?.id);
        const merged = platform ? { ...base, platform: result, general: { ...base.general, ...result.general } } : { ...base, ...result };
        cacheAppSettings(user?.id, merged, user?.role);
        setInitial(snapshot);
        setSaveState('saved');
        saveStateTimer.current = setTimeout(() => setSaveState((current) => (current === 'saved' ? '' : current)), 2000);
      })
      .catch((reason) => {
        if (version === writeVersion.current) {
          setError(reason.message || 'Không tự động lưu được cài đặt.');
          setSaveState('error');
        }
      });
  }

  function update(name, value, immediate = false) {
    const next = { ...formRef.current, [name]: value };
    formRef.current = next;
    setForm(next);
    setSaveState('');
    if (name === 'theme') setTheme(value);
    clearTimeout(debounceRef.current);
    if (immediate) persist(next);
    else debounceRef.current = setTimeout(() => persist(next), 500);
  }

  function updateAi(name, value) {
    const current = readAppSettings(user?.id);
    const nextAi = { ...current.ai, [name]: value };
    cacheAppSettings(user?.id, { ...current, ai: nextAi }, user?.role);
    const next = { ...formRef.current, [name]: value };
    formRef.current = next;
    setForm(next);
    setInitial((currentForm) => (currentForm ? { ...currentForm, [name]: value } : currentForm));
    setSaveState('saved');
    clearTimeout(saveStateTimer.current);
    saveStateTimer.current = setTimeout(() => setSaveState((current) => (current === 'saved' ? '' : current)), 2000);
  }

  function selectSoundTone(tone) {
    const next = { ...formRef.current, soundTone: tone };
    const cached = readAppSettings(user?.id);
    formRef.current = next;
    setForm(next);
    cacheAppSettings(user?.id, { ...cached, general: { ...cached.general, soundTone: tone } }, user?.role);
    setInitial((current) => (current ? { ...current, soundTone: tone } : current));
    setSaveState('saved');
    clearTimeout(saveStateTimer.current);
    saveStateTimer.current = setTimeout(() => setSaveState((current) => (current === 'saved' ? '' : current)), 2000);
    void playNotificationSound(tone);
  }

  function flush() {
    clearTimeout(debounceRef.current);
    persist(formRef.current);
  }

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allOpen = Object.values(openSections).every(Boolean);
  const toggleAll = () => {
    const nextVal = !allOpen;
    setOpenSections({
      general: nextVal,
      sales: nextVal,
      receipt: nextVal,
      inventory: nextVal,
      ai: nextVal,
      platform: nextVal,
    });
  };

  const status =
    saveState === 'saving'
      ? 'Đang lưu…'
      : saveState === 'saved'
      ? 'Đã tự động lưu'
      : saveState === 'error'
      ? 'Chưa lưu được'
      : '';

  const soundPreview = (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={!form.sound}
      onClick={() => void playNotificationSound(form.soundTone || 'ting-tong')}
      title="Phát thử âm thanh thông báo"
    >
      <Volume2 size={15} />
      <span>Nghe thử</span>
    </button>
  );

  // Huy hiệu tóm tắt trạng thái từng mục
  const themeLabel = form.theme === 'dark' ? 'Giao diện Tối' : form.theme === 'light' ? 'Giao diện Sáng' : 'Theo hệ thống';
  const soundLabel = form.sound ? 'Bật âm báo' : 'Tắt âm báo';
  const generalBadge = `${themeLabel} · ${soundLabel}`;

  const salesBadge = form.autoPrint ? 'Tự động in: Bật' : 'Tự động in: Tắt';

  const receiptCount = [receiptForm.store_phone, receiptForm.store_address, receiptForm.wifi_password].filter(Boolean).length;
  const receiptBadge = `Đã nhập ${receiptCount}/3 mục`;

  const inventoryBadge = `Ngưỡng: ${form.lowStockThreshold || 10} sp`;

  const aiBadge = `Kỳ hạn ${form.forecastHorizonDays || 14} ngày`;

  const platformBadge = form.maintenance ? 'Bảo trì: Đang bật' : 'Hoạt động bình thường';

  // Lọc nhanh theo từ khóa
  const q = searchQuery.toLowerCase().trim();
  const matchGeneral = !q || 'cài đặt chung giao diện sáng tối âm thanh thông báo sound định dạng số múi giờ timezone'.includes(q);
  const matchSales = !q || 'bán hàng hóa đơn in tự động auto print receipt footer chân trang lời chào'.includes(q);
  const matchReceipt = !q || 'nội dung hiển thị hóa đơn số điện thoại sđt địa chỉ wifi wi-fi chi nhánh'.includes(q);
  const matchInventory = !q || 'kho cảnh báo tự động tồn thấp ngưỡng digest daily monthly báo cáo cuối ngày'.includes(q);
  const matchAi = !q || 'trợ lý ai dự báo kỳ hạn forecast horizon safety factor hệ số an toàn robot nổi'.includes(q);
  const matchPlatform = !q || 'quản trị nền tảng bảo trì maintenance ai chat limit audit log nhật ký kiểm toán'.includes(q);

  const hasAnyMatch = platform
    ? matchGeneral || matchPlatform
    : matchGeneral || (canSell && matchSales) || (canSell && activeBranchId && matchReceipt) || (canOperate && matchInventory) || matchAi;

  return (
    <>
      <PageHeader
        eyebrow="TÙY CHỈNH TRẢI NGHIỆM"
        title="Cài đặt"
        description="Thiết lập giao diện, hiển thị và các tùy chọn vận hành phù hợp với vai trò của bạn."
        actions={
          status && (
            <span
              role="status"
              className={`settings-save-pill ${saveState}`}
            >
              {saveState === 'saved' && <Check size={14} />}
              {status}
            </span>
          )
        }
      />

      {error && <p role="alert" className="settings-error-alert">{error}</p>}

      <div className="settings-container">
        {/* Thanh công cụ tìm kiếm và Mở rộng / Thu gọn tất cả */}
        <div className="settings-toolbar-bar">
          <div className="settings-search-box">
            <Search size={15} className="settings-search-icon" />
            <input
              type="text"
              placeholder="Tìm nhanh cài đặt (giao diện, âm thanh, hóa đơn, Wi-Fi, kho, AI...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="settings-search-input"
              aria-label="Tìm kiếm cài đặt"
            />
            {searchQuery && (
              <button
                type="button"
                className="settings-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa tìm kiếm"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm settings-toggle-all-btn"
            onClick={toggleAll}
            title={allOpen ? 'Thu gọn tất cả các nhóm cài đặt' : 'Mở rộng tất cả các nhóm cài đặt'}
          >
            <ChevronsUpDown size={14} />
            <span>{allOpen ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}</span>
          </button>
        </div>

        {!hasAnyMatch ? (
          <div className="settings-empty-search">
            <p>Không tìm thấy mục cài đặt nào phù hợp với từ khóa <strong>"{searchQuery}"</strong>.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearchQuery('')}>
              Xóa từ khóa tìm kiếm
            </button>
          </div>
        ) : (
          <div className="settings-accordion-list">
            {/* 1. CÀI ĐẶT CHUNG */}
            {matchGeneral && (
              <AccordionRow
                id="general"
                icon={Monitor}
                title="Cài đặt chung"
                description="Tùy chỉnh giao diện Sáng/Tối, âm thanh thông báo và quy cách hiển thị dữ liệu."
                badge={generalBadge}
                isOpen={q ? true : openSections.general}
                onToggle={() => toggleSection('general')}
              >
                <label className="setting-field">
                  Chế độ giao diện
                  <select
                    className="ri-control"
                    value={form.theme}
                    onChange={(e) => update('theme', e.target.value, true)}
                  >
                    <option value="light">Sáng</option>
                    <option value="dark">Tối</option>
                    <option value="system">Theo hệ thống</option>
                  </select>
                </label>

                <SettingToggle
                  title="Âm thanh thông báo &amp; thao tác POS"
                  description="Phát tiếng bíp nhẹ khi thêm sản phẩm hoặc có thông báo mới."
                  checked={form.sound}
                  onChange={(v) => update('sound', v, true)}
                  action={soundPreview}
                />

                {form.sound && (
                  <SoundTonePicker
                    value={form.soundTone || 'ting-tong'}
                    onChange={selectSoundTone}
                  />
                )}

                <div className="settings-general-pair">
                  <label className="setting-field">
                    Định dạng số
                    <select
                      className="ri-control"
                      value={form.numberFormat}
                      onChange={(e) => update('numberFormat', e.target.value, true)}
                    >
                      <option value="vi-VN">Việt Nam (1.234,56)</option>
                      <option value="en-US">Quốc tế (1,234.56)</option>
                    </select>
                  </label>
                  <label className="setting-field">
                    Múi giờ
                    <select
                      className="ri-control"
                      value={form.timezone}
                      onChange={(e) => update('timezone', e.target.value, true)}
                    >
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
                    </select>
                  </label>
                </div>
              </AccordionRow>
            )}

            {/* PLATFORM ADMIN ONLY: CÀI ĐẶT QUẢN TRỊ NỀN TẢNG */}
            {platform && matchPlatform && (
              <AccordionRow
                id="platform"
                icon={ShieldCheck}
                title="Cài đặt Quản trị Nền tảng"
                description="Điều khiển các chính sách dùng chung và bảo mật trên toàn hệ thống SaaS."
                badge={platformBadge}
                isOpen={q ? true : openSections.platform}
                onToggle={() => toggleSection('platform')}
              >
                <SettingToggle
                  title="Chế độ bảo trì hệ thống"
                  description="Tạm dừng API cho người dùng cửa hàng; quản trị nền tảng vẫn truy cập được."
                  checked={form.maintenance}
                  onChange={(v) => update('maintenance', v, true)}
                />

                <label className="setting-field">
                  Giới hạn gọi AI Chatbot mỗi phút
                  <input
                    className="ri-control"
                    type="number"
                    min="1"
                    max="120"
                    value={form.aiChatLimit}
                    onChange={(e) => update('aiChatLimit', e.target.value)}
                    onBlur={flush}
                  />
                </label>

                <SettingToggle
                  title="Tự động ghi nhật ký kiểm toán bảo mật"
                  description="Ghi sự kiện an ninh vào audit log và áp dụng quy tắc phát hiện tái phạm."
                  checked={form.auditEnabled}
                  onChange={(v) => update('auditEnabled', v, true)}
                />
              </AccordionRow>
            )}

            {/* 2. CÀI ĐẶT BÁN HÀNG & HÓA ĐƠN */}
            {!platform && canSell && matchSales && (
              <AccordionRow
                id="sales"
                icon={Printer}
                title="Cài đặt Bán hàng & Hóa đơn"
                description="Tùy chỉnh thao tác sau thanh toán và lời chào chân trang hóa đơn."
                badge={salesBadge}
                isOpen={q ? true : openSections.sales}
                onToggle={() => toggleSection('sales')}
              >
                <SettingToggle
                  title="Tự động mở hộp thoại in hóa đơn"
                  description="Mở hộp thoại in tự động sau khi thanh toán hóa đơn hoàn tất trên quầy POS."
                  checked={form.autoPrint}
                  onChange={(v) => update('autoPrint', v, true)}
                />

                <label className="setting-field">
                  Lời chào chân trang hóa đơn
                  <textarea
                    className="ri-control"
                    rows="2"
                    maxLength="180"
                    placeholder="VD: Cảm ơn quý khách và hẹn gặp lại!"
                    value={form.receiptFooter || ''}
                    onChange={(e) => update('receiptFooter', e.target.value)}
                    onBlur={flush}
                  />
                </label>
              </AccordionRow>
            )}

            {/* 3. NỘI DUNG HIỂN THỊ TRÊN HÓA ĐƠN */}
            {!platform && canSell && activeBranchId && matchReceipt && (
              <AccordionRow
                id="receipt"
                icon={Receipt}
                title="Nội dung hiển thị trên hóa đơn"
                description={`Thông tin in trên hóa đơn của chi nhánh ${activeBranch?.name ? `(${activeBranch.name})` : ''}. Các ô để trống sẽ được ẩn hoàn toàn.`}
                badge={receiptBadge}
                isOpen={q ? true : openSections.receipt}
                onToggle={() => toggleSection('receipt')}
              >
                <label className="setting-field">
                  Số điện thoại cửa hàng (in trên hóa đơn)
                  <input
                    className="ri-control"
                    type="text"
                    placeholder="VD: 0912 345 678 (tùy chọn)"
                    value={receiptForm.store_phone}
                    onChange={(e) => updateReceipt('store_phone', e.target.value)}
                  />
                </label>

                <label className="setting-field">
                  Địa chỉ cửa hàng (in trên hóa đơn)
                  <textarea
                    className="ri-control"
                    rows="2"
                    placeholder="VD: 123 Đường Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh"
                    value={receiptForm.store_address}
                    onChange={(e) => updateReceipt('store_address', e.target.value)}
                  />
                </label>

                <label className="setting-field">
                  Mật khẩu Wi-Fi (in trên hóa đơn)
                  <input
                    className="ri-control"
                    type="text"
                    placeholder="VD: cafe@2026 (để trống nếu không in Wi-Fi)"
                    value={receiptForm.wifi_password}
                    onChange={(e) => updateReceipt('wifi_password', e.target.value)}
                  />
                </label>

                {receiptSaveState && (
                  <small
                    className="settings-receipt-status"
                    style={{
                      color: receiptSaveState === 'error' ? 'var(--ri-danger)' : 'var(--ri-success)',
                    }}
                  >
                    {receiptSaveState === 'saving'
                      ? 'Đang lưu thông tin hóa đơn…'
                      : receiptSaveState === 'saved'
                      ? '✓ Đã tự động lưu thông tin hóa đơn'
                      : 'Chưa lưu được thông tin hóa đơn'}
                  </small>
                )}
              </AccordionRow>
            )}

            {/* 4. CÀI ĐẶT KHO & CẢNH BÁO TỰ ĐỘNG */}
            {!platform && canOperate && matchInventory && (
              <AccordionRow
                id="inventory"
                icon={SettingsIcon}
                title="Cài đặt Kho & Cảnh báo tự động"
                description="Thiết lập ngưỡng tồn kho an toàn mặc định và lịch nhận báo cáo Digest định kỳ."
                badge={inventoryBadge}
                isOpen={q ? true : openSections.inventory}
                onToggle={() => toggleSection('inventory')}
              >
                <label className="setting-field">
                  Ngưỡng cảnh báo tồn kho thấp mặc định
                  <input
                    className="ri-control"
                    type="number"
                    min="0"
                    max="100000"
                    value={form.lowStockThreshold}
                    onChange={(e) => update('lowStockThreshold', e.target.value)}
                    onBlur={flush}
                  />
                </label>

                <SettingToggle
                  title="Báo cáo tổng kết cuối ngày"
                  description="Daily Digest: Nhận thông báo tổng kết doanh thu và biến động tồn kho mỗi ngày."
                  checked={form.dailyDigest}
                  onChange={(v) => update('dailyDigest', v, true)}
                />

                <SettingToggle
                  title="Báo cáo tổng kết cuối tháng"
                  description="Monthly Digest: Nhận báo cáo phân tích hiệu quả bán hàng và tồn kho định kỳ mỗi tháng."
                  checked={form.monthlyDigest}
                  onChange={(v) => update('monthlyDigest', v, true)}
                />
              </AccordionRow>
            )}

            {/* 5. CÀI ĐẶT TRỢ LÝ AI & DỰ BÁO */}
            {!platform && matchAi && (
              <AccordionRow
                id="ai"
                icon={Sparkles}
                title="Cài đặt Trợ lý AI & Dự báo"
                description="Tùy chỉnh kỳ hạn dự báo mặc định, hệ số an toàn tồn kho và chế độ hiển thị trợ lý nổi."
                badge={aiBadge}
                isOpen={q ? true : openSections.ai}
                onToggle={() => toggleSection('ai')}
              >
                <label className="setting-field">
                  Kỳ hạn dự báo mặc định
                  <select
                    className="ri-control"
                    value={form.forecastHorizonDays}
                    onChange={(e) => updateAi('forecastHorizonDays', Number(e.target.value))}
                  >
                    <option value={7}>7 ngày tới</option>
                    <option value={14}>14 ngày tới</option>
                    <option value={30}>30 ngày tới</option>
                  </select>
                </label>

                <label className="setting-field">
                  Hệ số an toàn tồn kho (Safety Factor)
                  <input
                    className="ri-control"
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={form.safetyFactor}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 1 && value <= 3) updateAi('safetyFactor', value);
                    }}
                  />
                  <small style={{ display: 'block', marginTop: 5, color: 'var(--ri-muted)', fontSize: 11 }}>
                    Điều chỉnh độ nhạy cảnh báo từ 1,0 đến 3,0 (mặc định 1.65).
                  </small>
                </label>

                <SettingToggle
                  title="Tự động gửi thông báo khi sắp hết hàng"
                  description="Hiển thị cảnh báo tồn kho thấp trong chuông thông báo hệ thống."
                  checked={form.autoLowStockNotifications}
                  onChange={(v) => updateAi('autoLowStockNotifications', v)}
                />

                <SettingToggle
                  title="Hiển thị trợ lý AI nổi ở góc màn hình"
                  description="Bật hoặc ẩn nhanh Robot trợ lý AI nổi phục vụ tra cứu thông tin bán lẻ."
                  checked={form.showFloatingAiAssistant}
                  onChange={(v) => updateAi('showFloatingAiAssistant', v)}
                />
              </AccordionRow>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── COMPONENT ACCORDION ROW CÓ MŨI TÊN V XOAY MƯỢT ────────────────────────────
function AccordionRow({
  id,
  icon: IconComp,
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <div className={`settings-accordion-card ${isOpen ? 'is-open' : ''}`}>
      <div
        className="settings-accordion-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isOpen}
      >
        <div className="settings-accordion-header-left">
          <div className="settings-accordion-icon-box">
            <IconComp size={20} />
          </div>
          <div className="settings-accordion-title-group">
            <h3 className="settings-accordion-title">{title}</h3>
            <p className="settings-accordion-desc">{description}</p>
          </div>
        </div>

        <div className="settings-accordion-header-right">
          {badge && <span className="settings-accordion-badge">{badge}</span>}
          <div className={`settings-accordion-chevron ${isOpen ? 'is-open' : ''}`}>
            <ChevronDown size={18} />
          </div>
        </div>
      </div>

      {isOpen && <div className="settings-accordion-body">{children}</div>}
    </div>
  );
}

function SettingToggle({ title, description, checked, onChange, action }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {action}
        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span />
        </label>
      </div>
    </div>
  );
}

function SoundTonePicker({ value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Kiểu nhạc chuông thông báo"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 8,
        margin: '8px 0 18px',
      }}
    >
      {NOTIFICATION_SOUND_TONES.map((tone) => {
        const selected = value === tone.id;
        return (
          <button
            key={tone.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tone.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              minHeight: 58,
              padding: '9px 11px',
              border: `1px solid ${selected ? 'var(--ri-primary)' : 'var(--ri-border)'}`,
              borderRadius: 10,
              background: selected
                ? 'color-mix(in srgb, var(--ri-primary) 10%, var(--ri-surface))'
                : 'var(--ri-surface)',
              color: 'var(--ri-text)',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: selected
                ? '0 0 0 2px color-mix(in srgb, var(--ri-primary) 14%, transparent)'
                : 'none',
            }}
          >
            <Music size={17} color={selected ? 'var(--ri-primary)' : 'var(--ri-muted)'} />
            <span style={{ display: 'grid', flex: 1, gap: 2 }}>
              <strong style={{ fontSize: 12 }}>{tone.label}</strong>
              <small style={{ fontSize: 10, color: 'var(--ri-muted)' }}>{tone.description}</small>
            </span>
            {selected && <Check size={16} color="var(--ri-primary)" />}
          </button>
        );
      })}
    </div>
  );
}
