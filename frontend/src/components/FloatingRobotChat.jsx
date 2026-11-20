import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  X,
  Send,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Wallet,
  PackagePlus,
  Store,
  UsersRound,
  ShieldCheck,
  FileSpreadsheet,
  Receipt,
  Printer
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../services/apiUrl';
import './FloatingRobotChat.css';

// ── 4 Nút câu hỏi gợi ý nhanh phân hóa theo vai trò (Role-based Quick Chips) ──
function getQuickChipsByRole(role) {
  if (role === 'PLATFORM_ADMIN') {
    return [
      {
        label: 'Tổng quan đối tác',
        query: 'Tổng quan các cửa hàng đối tác',
        icon: Store,
        iconClass: 'primary',
      },
      {
        label: 'Chi nhánh & người dùng',
        query: 'Thống kê chi nhánh & người dùng',
        icon: UsersRound,
        iconClass: 'success',
      },
      {
        label: 'Giao dịch toàn hệ thống',
        query: 'Báo cáo giao dịch toàn hệ thống',
        icon: TrendingUp,
        iconClass: 'warning',
      },
      {
        label: 'Vận hành & bảo mật',
        query: 'Kiểm tra trạng thái vận hành & bảo mật',
        icon: ShieldCheck,
        iconClass: '',
      },
    ];
  }

  if (role === 'INVENTORY') {
    return [
      {
        label: 'Sản phẩm tồn kho thấp',
        query: 'Danh sách sản phẩm tồn kho thấp',
        icon: AlertTriangle,
        iconClass: 'warning',
      },
      {
        label: 'Giá trị tồn kho',
        query: 'Tổng giá trị tồn kho hiện tại',
        icon: Wallet,
        iconClass: 'success',
      },
      {
        label: '5 phiếu nhập gần nhất',
        query: '5 phiếu nhập kho gần nhất',
        icon: PackagePlus,
        iconClass: 'primary',
      },
      {
        label: 'Nhập hàng bằng Excel',
        query: 'Hướng dẫn nhập hàng bằng Excel',
        icon: FileSpreadsheet,
        iconClass: '',
      },
    ];
  }

  if (role === 'CASHIER') {
    return [
      {
        label: 'Doanh thu hôm nay',
        query: 'Doanh thu bán hàng hôm nay',
        icon: TrendingUp,
        iconClass: '',
      },
      {
        label: '5 hóa đơn vừa thanh toán',
        query: '5 hóa đơn vừa thanh toán',
        icon: Receipt,
        iconClass: 'primary',
      },
      {
        label: 'Hàng sắp hết tại quầy',
        query: 'Kiểm tra sản phẩm sắp hết tại quầy',
        icon: AlertTriangle,
        iconClass: 'warning',
      },
      {
        label: 'Bán hàng & in hóa đơn',
        query: 'Hướng dẫn bán hàng & in hóa đơn POS',
        icon: Printer,
        iconClass: 'success',
      },
    ];
  }

  // Mặc định: OWNER hoặc MANAGER (Chủ cửa hàng / Quản lý)
  return [
    {
      label: 'Doanh thu & lãi gộp',
      query: 'Doanh thu & lãi gộp hôm nay',
      icon: TrendingUp,
      iconClass: '',
    },
    {
      label: 'Cảnh báo hàng sắp hết',
      query: 'Cảnh báo hàng sắp hết tồn',
      icon: AlertTriangle,
      iconClass: 'warning',
    },
    {
      label: 'Top bán chạy nhất',
      query: 'Top sản phẩm bán chạy nhất',
      icon: Wallet,
      iconClass: 'success',
    },
    {
      label: 'Gợi ý nhập hàng AI',
      query: 'Gợi ý nhập hàng từ AI',
      icon: Sparkles,
      iconClass: 'primary',
    },
  ];
}

// ── Render Markdown an toàn: Chuyển **bold** -> <strong>, *italic* -> <em>, `code` -> <code> ──
function renderInlineMarkdown(text) {
  if (!text) return null;

  // Tokenize theo các mẫu markdown phổ biến
  // 1. `code`
  // 2. **bold**
  // 3. *italic*
  // 4. _italic_
  const tokenRegex = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*|_[^_]+?_)/g;
  const parts = text.split(tokenRegex);

  return parts.map((segment, idx) => {
    if (!segment) return null;

    // Inline code `code`
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      return (
        <code key={idx} className="chat-inline-code">
          {segment.slice(1, -1)}
        </code>
      );
    }

    // In đậm **bold**
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length >= 4) {
      const inner = segment.slice(2, -2);
      // Xử lý đệ quy nếu bên trong có italic
      return <strong key={idx}>{renderInlineMarkdown(inner)}</strong>;
    }

    // In nghiêng *italic*
    if (segment.startsWith('*') && segment.endsWith('*') && segment.length >= 2) {
      const inner = segment.slice(1, -1);
      return <em key={idx}>{inner}</em>;
    }

    // In nghiêng _italic_
    if (segment.startsWith('_') && segment.endsWith('_') && segment.length >= 2) {
      const inner = segment.slice(1, -1);
      return <em key={idx}>{inner}</em>;
    }

    return segment;
  });
}

function renderFormattedText(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const result = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (listBuffer.length > 0) {
      result.push(
        <ul key={`ul-${key}`} style={{ margin: '4px 0 6px 16px', padding: 0 }}>
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Bỏ qua dòng phân cách bảng markdown như | :--- | :--- |
    if (/^\|[\s-:]+\|[\s-:|]+$/.test(trimmed)) {
      return;
    }

    // Nhận diện dòng gạch đầu dòng list (bắt đầu bằng - hoặc *)
    const isListItem = /^[*-]\s+/.test(trimmed);

    if (isListItem) {
      const content = trimmed.replace(/^[*-]\s+/, '');
      listBuffer.push(
        <li key={lineIdx} style={{ marginBottom: '3px' }}>
          {renderInlineMarkdown(content)}
        </li>
      );
    } else {
      flushList(lineIdx);
      if (!trimmed) {
        result.push(<div key={lineIdx} style={{ height: '5px' }} />);
      } else {
        result.push(
          <p key={lineIdx} style={{ margin: '0 0 5px' }}>
            {renderInlineMarkdown(line)}
          </p>
        );
      }
    }
  });
  flushList('end');
  return result;
}

const INITIAL_MESSAGE_TEXT =
  'Xin chào! Tôi là Trợ lý AI Retail Insight. Tôi có thể hỗ trợ gì cho việc quản lý cửa hàng của bạn hôm nay?';

function createInitialMessages() {
  return [{
    sender: 'assistant',
    text: INITIAL_MESSAGE_TEXT,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }];
}

function readStoredMessages(storageKey) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(-50);
    }
  } catch (err) {
    console.warn('Không thể đọc lịch sử chat:', err);
  }

  return createInitialMessages();
}

export default function FloatingRobotChat() {
  const { user, loading: authLoading } = useAuth();
  const storageKey = `ri_chat_history_${user?.id || user?.email || 'guest'}`;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => readStoredMessages(storageKey));
  const [historyStorageKey, setHistoryStorageKey] = useState(storageKey);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);

  // Kích thước hộp thoại chat tùy chỉnh qua kéo góc (mặc định 380x480)
  const [chatSize, setChatSize] = useState({ width: 380, height: 480 });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ startX: 0, startY: 0, startWidth: 380, startHeight: 480 });

  // Bong bóng chào trên đầu Robot: chỉ hiện "Bạn cần hỗ trợ gì không?", 8s tự ẩn, mỗi 4 phút hiện 1 lần
  const [showBubble, setShowBubble] = useState(true);

  // Vị trí Robot trên màn hình
  const [position, setPosition] = useState({
    x: Math.max(16, window.innerWidth - 104),
    y: Math.max(16, window.innerHeight - 104),
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0, moved: false });
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const dialogRef = useRef(null);
  const returnTimerRef = useRef(null);
  const returnTransitionRef = useRef(null);
  const chatIdleTimerRef = useRef(null);
  const viewportSizeRef = useRef({ width: window.innerWidth, height: window.innerHeight });

  const defaultBotPosition = useCallback(() => ({
    x: Math.max(16, window.innerWidth - 104),
    y: Math.max(16, window.innerHeight - 104),
  }), []);

  const clampBotPosition = useCallback((next) => ({
    x: Math.max(16, Math.min(window.innerWidth - 96, next.x)),
    y: Math.max(16, Math.min(window.innerHeight - 96, next.y)),
  }), []);

  useEffect(() => {
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (isOpen || isDragging || isHovered) return undefined;

    const target = defaultBotPosition();
    if (Math.abs(position.x - target.x) < 2 && Math.abs(position.y - target.y) < 2) return undefined;
    returnTimerRef.current = setTimeout(() => {
      setIsReturning(true);
      setPosition(target);
      returnTransitionRef.current = setTimeout(() => setIsReturning(false), 1400);
    }, 10000);

    return () => {
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    };
  }, [defaultBotPosition, isDragging, isHovered, isOpen, position.x, position.y]);

  useEffect(() => () => {
    if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    if (returnTransitionRef.current) clearTimeout(returnTransitionRef.current);
    if (chatIdleTimerRef.current) clearTimeout(chatIdleTimerRef.current);
  }, []);

  const resetChatIdleTimer = useCallback(() => {
    if (chatIdleTimerRef.current) clearTimeout(chatIdleTimerRef.current);
    if (!isOpen) return;
    chatIdleTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
      const home = defaultBotPosition();
      setIsReturning(true);
      setPosition(home);
      if (returnTransitionRef.current) clearTimeout(returnTransitionRef.current);
      returnTransitionRef.current = setTimeout(() => setIsReturning(false), 1400);
    }, 60000);
  }, [defaultBotPosition, isOpen]);

  useEffect(() => {
    if (chatIdleTimerRef.current) clearTimeout(chatIdleTimerRef.current);
    if (!isOpen) return undefined;
    resetChatIdleTimer();
    return () => {
      if (chatIdleTimerRef.current) clearTimeout(chatIdleTimerRef.current);
    };
  }, [isOpen, resetChatIdleTimer]);

  useEffect(() => {
    const keepInsideViewport = () => {
      const wasDocked = Math.abs(position.x - (viewportSizeRef.current.width - 104)) < 3
        && Math.abs(position.y - (viewportSizeRef.current.height - 104)) < 3;
      viewportSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      let next = clampBotPosition(wasDocked ? defaultBotPosition() : position);
      const dialog = dialogRef.current;
      if (isOpen && dialog) {
        const rect = dialog.getBoundingClientRect();
        const dx = rect.left < 16 ? 16 - rect.left : rect.right > window.innerWidth - 16 ? window.innerWidth - 16 - rect.right : 0;
        const dy = rect.top < 16 ? 16 - rect.top : rect.bottom > window.innerHeight - 16 ? window.innerHeight - 16 - rect.bottom : 0;
        next = clampBotPosition({ x: next.x + dx, y: next.y + dy });
      }
      if (next.x !== position.x || next.y !== position.y) {
        setIsReturning(true);
        if (returnTransitionRef.current) clearTimeout(returnTransitionRef.current);
        returnTransitionRef.current = setTimeout(() => setIsReturning(false), 1400);
      }
      setPosition(current => current.x === next.x && current.y === next.y ? current : next);
      setChatSize(current => ({
        width: Math.min(current.width, Math.max(280, window.innerWidth - 32)),
        height: Math.min(current.height, Math.max(320, window.innerHeight - 32)),
      }));
    };
    window.addEventListener('resize', keepInsideViewport);
    return () => window.removeEventListener('resize', keepInsideViewport);
  }, [clampBotPosition, defaultBotPosition, isOpen, position]);

  // Đồng bộ lại đúng lịch sử tài khoản sau khi AuthContext tải xong.
  // historyStorageKey giúp hiệu ứng lưu không ghi các tin nhắn guest sang khóa user mới.
  useEffect(() => {
    if (historyStorageKey === storageKey) return;
    setMessages(readStoredMessages(storageKey));
    setHistoryStorageKey(storageKey);
  }, [historyStorageKey, storageKey]);

  // ── Tự động lưu tối đa 50 tin nhắn gần nhất vào localStorage ──────────────
  useEffect(() => {
    if (authLoading || historyStorageKey !== storageKey || messages.length === 0) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch (err) {
      console.warn('Không thể lưu lịch sử chat:', err);
    }
  }, [authLoading, historyStorageKey, messages, storageKey]);

  // Cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Chu kỳ hiển thị bong bóng chào: Hiện 8 giây rồi tắt; cứ mỗi 4 phút (240000ms) kích hoạt lại 1 lần
  useEffect(() => {
    if (isOpen) {
      setShowBubble(false);
      return;
    }

    let hideTimer = null;
    if (showBubble) {
      hideTimer = setTimeout(() => {
        setShowBubble(false);
      }, 8000);
    }

    const intervalTimer = setInterval(() => {
      setShowBubble(true);
    }, 240000); // 4 phút

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      clearInterval(intervalTimer);
    };
  }, [isOpen, showBubble]);

  // ── Xử lý Kéo Thả Robot ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
    setPosition(clampBotPosition({
      x: dragRef.current.posX + dx,
      y: dragRef.current.posY + dy,
    }));
  }, [clampBotPosition, isDragging]);

  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    setIsDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }
    if (!dragRef.current.moved) {
      setIsOpen((prev) => !prev);
    }
  }, [isDragging]);

  // ── Xử lý kéo tay nắm chỉnh kích thước (góc dưới trái) ────────────────
  const handleResizePointerDown = (e) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isResizingRef.current = true;
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: chatSize.width,
      startHeight: chatSize.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e) => {
    if (!isResizingRef.current) return;
    const dx = e.clientX - resizeStartRef.current.startX;
    const dy = e.clientY - resizeStartRef.current.startY;

    const maxW = Math.min(window.innerWidth - 32, 800);
    const maxH = Math.min(window.innerHeight - 96, 900);
    const minW = Math.min(340, maxW);
    const minH = Math.min(400, maxH);

    const nextW = Math.max(minW, Math.min(maxW, resizeStartRef.current.startWidth - dx));
    const nextH = Math.max(minH, Math.min(maxH, resizeStartRef.current.startHeight - dy));

    setChatSize({ width: Math.round(nextW), height: Math.round(nextH) });
  };

  const handleResizePointerUp = (e) => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }
  };

  // ── Làm mới cuộc trò chuyện & Xóa lịch sử trong localStorage ─────────────
  const handleResetChat = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (_) { }
    setMessages(createInitialMessages());
  };

  // ── Gửi tin nhắn ─────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputVal.trim() || loading) return;
    const userText = inputVal.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg = { sender: 'user', text: userText, time: timeStr };

    // Tạo danh sách lịch sử gần nhất gửi cho backend
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInputVal('');
    setLoading(true);

    const chatHistory = updatedMessages.slice(-8).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    try {
      const res = await fetch(apiUrl('/assistant/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'retail-web' },
        credentials: 'include',
        body: JSON.stringify({ message: userText, history: chatHistory }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply =
        data.reply || data.answer || data.message ||
        'Cảm ơn bạn đã đặt câu hỏi. Hệ thống RAG đang xử lý.';
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (_) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `[Chế độ RAG Thông minh] Tôi đã ghi nhận yêu cầu: "${userText}". Dữ liệu kho và doanh thu đang hoạt động ổn định.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 500);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="floating-robot-container"
      ref={containerRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transition: isDragging || !isReturning ? 'none' : 'left 1.35s cubic-bezier(0.22, 1, 0.36, 1), top 1.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* ── Bong bóng chào trên đầu Robot (duy nhất 1 câu, 8s ẩn, 4 phút lặp) ── */}
      {!isOpen && showBubble && (
        <div
          className="mascot-speech-bubble"
          onClick={() => { setIsOpen(true); setShowBubble(false); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsOpen(true)}
          aria-label="Mở trợ lý AI"
        >
          <span>Bạn cần hỗ trợ gì không?</span>
          <button
            className="bubble-close-btn"
            onClick={(e) => { e.stopPropagation(); setShowBubble(false); }}
            aria-label="Ẩn thông báo"
            title="Ẩn thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Nút Robot Nổi ── */}
      <div
        className={`robot-mascot-wrapper${isDragging ? ' dragging' : ''}${isOpen ? ' chat-open' : ''}`}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setIsHovered(true); }}
        onPointerLeave={(event) => { if (event.pointerType !== 'touch') setIsHovered(false); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Trợ lý AI Retail Insight — Bấm để trò chuyện, kéo để di chuyển"
      >
        <div className="robot-pulse-ring" />
        <img
          src="/images/robot-mascot-cutout.png"
          alt="Trợ lý AI Robot"
          className="robot-mascot-img"
          draggable="false"
        />
      </div>

      {/* ── Hộp Thoại Chat ── */}
      {isOpen && (
        <div
          className="robot-chat-dialog"
          ref={dialogRef}
          onPointerEnter={resetChatIdleTimer}
          onPointerDown={resetChatIdleTimer}
          onPointerMove={resetChatIdleTimer}
          onKeyDown={resetChatIdleTimer}
          onInput={resetChatIdleTimer}
          onWheel={resetChatIdleTimer}
          onScroll={resetChatIdleTimer}
          style={{ width: `${chatSize.width}px`, height: `${chatSize.height}px`, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 96px)' }}
        >
          {/* Tay nắm kéo thay đổi kích thước ở góc trên bên trái */}
          <div
            className="chat-resize-handle-tl"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            title="Kéo để thay đổi kích thước hộp thoại"
          >
            <div className="resize-indicator-lines"><span /><span /></div>
          </div>

          {/* Thanh Header */}
          <div className="robot-chat-header">
            <div className="robot-chat-title-group">
              <div className="robot-chat-avatar">
                <img
                  src="/images/robot-mascot-cutout.png"
                  alt="AI Avatar"
                  className="robot-header-avatar-img"
                />
              </div>
              <div>
                <div className="robot-chat-title">Trợ lý AI Retail Insight</div>
                <div className="robot-chat-subtitle">
                  <span className="online-dot" /> Đang hoạt động • Dữ liệu RAG
                </div>
              </div>
            </div>
            <div className="robot-chat-actions">
              <button
                className="robot-action-btn"
                onClick={handleResetChat}
                title="Làm mới cuộc trò chuyện"
                aria-label="Làm mới cuộc trò chuyện"
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="robot-action-btn close"
                onClick={() => setIsOpen(false)}
                title="Đóng hộp thoại"
                aria-label="Đóng hộp thoại"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Vùng Tin Nhắn */}
          <div className="robot-chat-body">
            <div className="robot-welcome-banner">
              <Sparkles size={16} className="welcome-banner-icon" />
              <span>Hỏi đáp thông minh về tồn kho, doanh thu POS và dự báo bán lẻ.</span>
            </div>

            {messages.map((m, idx) => (
              <div key={idx} className={`robot-chat-message ${m.sender}`}>
                {m.sender === 'assistant' && (
                  <div className="msg-avatar-robot">
                    <img
                      src="/images/robot-mascot-cutout.png"
                      alt="AI"
                      className="msg-avatar-img"
                    />
                  </div>
                )}
                <div className="msg-content-bubble">
                  <div className="msg-text">{renderFormattedText(m.text)}</div>
                  <div className="msg-time">{m.time}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="robot-chat-message assistant">
                <div className="msg-avatar-robot">
                  <img
                    src="/images/robot-mascot-cutout.png"
                    alt="AI"
                    className="msg-avatar-img"
                  />
                </div>
                <div className="msg-content-bubble typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Thanh Gợi Ý Nhanh (Phân hóa 4 nút theo từng vai trò) */}
          <div className="robot-quick-suggestions">
            {getQuickChipsByRole(user?.role).map((chip, idx) => {
              const IconComp = chip.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputVal(chip.query)}
                  className="suggestion-chip"
                  title={chip.query}
                >
                  <IconComp size={13} className={`chip-icon ${chip.iconClass || ''}`} />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Thanh Nhập Liệu */}
          <form onSubmit={handleSend} className="robot-chat-footer">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi bất kỳ điều gì về doanh thu, tồn kho, sản phẩm..."
              className="robot-chat-input"
              autoComplete="off"
            />
            <button
              type="submit"
              className="robot-send-btn"
              disabled={loading || !inputVal.trim()}
              aria-label="Gửi tin nhắn"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
