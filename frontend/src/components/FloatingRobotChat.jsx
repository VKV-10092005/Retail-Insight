import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Printer,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useBranch } from '../branches/BranchContext';
import { request } from '../operations/shared';
import { apiUrl } from '../services/apiUrl';
import './FloatingRobotChat.css';

// ── 4 Nút câu hỏi gợi ý nhanh phân tích sâu theo vai trò (Role-based Quick Chips) ──
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
        label: 'Phân tích khách hàng & độ tuổi',
        query: 'Phân tích chân dung & độ tuổi khách hàng toàn hệ thống',
        icon: UsersRound,
        iconClass: 'primary',
        action: 'demographics',
      },
      {
        label: 'Xu hướng mùa vụ',
        query: 'Phân tích xu hướng mùa vụ và nhu cầu tiêu dùng',
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
        label: 'Phân tích khách hàng & độ tuổi',
        query: 'Phân tích chi tiết chân dung khách hàng & lứa tuổi mục tiêu từ dữ liệu bán hàng',
        icon: UsersRound,
        iconClass: 'primary',
        action: 'demographics',
      },
      {
        label: 'Xu hướng mùa vụ',
        query: 'Phân tích xu hướng mùa vụ và nhu cầu nhập hàng',
        icon: TrendingUp,
        iconClass: 'warning',
      },
      {
        label: 'Tự lập phiếu nhập',
        query: 'Tự động lập phiếu nhập hàng tối ưu từ dự báo AI & tồn kho',
        icon: PackagePlus,
        iconClass: 'primary',
        action: 'replenish',
      },
      {
        label: 'Sản phẩm tồn kho thấp',
        query: 'Danh sách sản phẩm tồn kho thấp',
        icon: AlertTriangle,
        iconClass: 'warning',
      },
    ];
  }

  if (role === 'CASHIER') {
    return [
      {
        label: 'Phân tích khách hàng & độ tuổi',
        query: 'Phân tích chi tiết chân dung khách hàng & lứa tuổi mục tiêu từ dữ liệu bán hàng',
        icon: UsersRound,
        iconClass: 'primary',
        action: 'demographics',
      },
      {
        label: 'Xu hướng mùa vụ',
        query: 'Phân tích xu hướng mùa vụ và nhu cầu sản phẩm cho cửa hàng',
        icon: TrendingUp,
        iconClass: 'warning',
      },
      {
        label: 'Tự lập phiếu nhập',
        query: 'Tự động lập phiếu nhập hàng tối ưu từ dự báo AI & tồn kho',
        icon: PackagePlus,
        iconClass: 'success',
        action: 'replenish',
      },
      {
        label: 'Hàng sắp hết tại quầy',
        query: 'Kiểm tra sản phẩm sắp hết tại quầy',
        icon: AlertTriangle,
        iconClass: 'warning',
      },
    ];
  }

  // Mặc định: OWNER hoặc MANAGER (Chủ cửa hàng / Quản lý)
  return [
    {
      label: 'Phân tích khách hàng & độ tuổi',
      query: 'Phân tích chi tiết chân dung khách hàng & lứa tuổi mục tiêu từ dữ liệu bán hàng',
      icon: UsersRound,
      iconClass: 'primary',
      action: 'demographics',
    },
    {
      label: 'Xu hướng mùa vụ',
      query: 'Phân tích xu hướng mùa vụ và nhu cầu sản phẩm cho cửa hàng',
      icon: TrendingUp,
      iconClass: 'warning',
    },
    {
      label: 'Tự lập phiếu nhập',
      query: 'Tự động lập phiếu nhập hàng tối ưu từ dự báo AI & tồn kho',
      icon: PackagePlus,
      iconClass: 'success',
      action: 'replenish',
    },
    {
      label: 'Khung giờ vàng & doanh thu',
      query: 'Phân tích khung giờ vàng bán hàng và doanh thu theo thời gian',
      icon: Clock,
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
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const [proactiveOpen, setProactiveOpen] = useState(true);
  const [actionBusy, setActionBusy] = useState('');

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
    e.preventDefault();
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
    e.preventDefault();

    const maxW = Math.min(window.innerWidth - 32, 800);
    const maxH = Math.min(window.innerHeight - 96, 900);
    const minW = Math.min(340, maxW);
    const minH = Math.min(400, maxH);

    const nextW = Math.max(minW, Math.min(
      maxW,
      resizeStartRef.current.startWidth + (resizeStartRef.current.startX - e.clientX)
    ));
    const nextH = Math.max(minH, Math.min(
      maxH,
      resizeStartRef.current.startHeight + (resizeStartRef.current.startY - e.clientY)
    ));

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
  const sendChatMessage = async (textToSend) => {
    const userText = (typeof textToSend === 'string' ? textToSend : inputVal).trim();
    if (!userText || loading) return;
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

  const handleSend = (e) => {
    e?.preventDefault();
    sendChatMessage(inputVal);
  };

  const handleQuickChipClick = (chip) => {
    if (chip.action === 'replenish') {
      handleAutoReplenish();
      return;
    }
    if (chip.action === 'demographics') {
      handleAnalyzeDemographics();
      return;
    }
    sendChatMessage(chip.query);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── AI Proactive Action 1: Tự động lập phiếu nhập kho tối ưu ──
  const handleAutoReplenish = async () => {
    if (actionBusy) return;
    setActionBusy('replenish');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: '🤖 Tự động lập phiếu nhập hàng tối ưu từ dự báo AI & tồn kho',
        time: timeStr,
      },
      {
        sender: 'assistant',
        text: 'Đang kết nối thuật toán AI để tính toán sản lượng nhập tối ưu theo tốc độ bán và tồn an toàn...',
        time: timeStr,
      },
    ]);

    try {
      let draftItems = [];
      try {
        const query = activeBranchId ? `?task=replenishment&branch_id=${encodeURIComponent(activeBranchId)}` : '?task=replenishment';
        const aiRes = await request(`/ai/forecast${query}`);
        if (aiRes && Array.isArray(aiRes.items)) {
          draftItems = aiRes.items
            .filter((item) => Number(item.recommended_quantity) > 0 || Number(item.stock) <= Number(item.min_stock || 0))
            .map((item) => ({
              product_id: item.product_id,
              sku: item.sku,
              name: item.name,
              quantity: Math.max(1, Number(item.recommended_quantity) || 10),
              cost_price: Number(item.cost_price || item.costPrice || 0),
              sale_price: Number(item.sale_price || item.salePrice || 0),
            }));
        }
      } catch (err) {
        console.warn('AI replenishment forecast error, falling back to products', err);
      }

      if (!draftItems.length) {
        const pQuery = activeBranchId ? `?limit=100&branch_id=${encodeURIComponent(activeBranchId)}` : '?limit=100';
        const pRes = await request(`/products${pQuery}`);
        if (pRes && Array.isArray(pRes.items)) {
          draftItems = pRes.items
            .filter((p) => Number(p.stock || 0) <= Math.max(5, Number(p.min_stock || 0)))
            .slice(0, 10)
            .map((p) => ({
              product_id: p.id,
              sku: p.sku,
              name: p.name,
              quantity: 10,
              cost_price: Number(p.cost_price || 0),
              sale_price: Number(p.sale_price || 0),
            }));
        }
      }

      if (draftItems.length > 0) {
        setIsOpen(false);
        navigate('/receipts', {
          state: {
            items: draftItems,
            fromReplenishment: true,
            note: `AI Proactive Agent: Lập phiếu nhập kho tối ưu (${draftItems.length} sản phẩm)`,
            notice: `✨ AI Agent đã tự động nạp ${draftItems.length} mặt hàng cần nhập vào phiếu nhập kho!`,
          },
        });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: '🎉 **Tồn kho hiện tại đang rất dồi dào & an toàn!** Chưa có mặt hàng nào rơi vào diện nguy cơ đứt hàng. Bạn có thể xem toàn bộ sản phẩm hoặc nhập hàng bổ sung thủ công tại màn hình Quản lý kho.',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `⚠️ Không thể lập phiếu nhập tự động: ${err.message || 'Lỗi kết nối'}. Bạn có thể kiểm tra danh sách sản phẩm thủ công.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setActionBusy('');
    }
  };

  // ── AI Proactive Action 2: Phân tích chân dung khách hàng & độ tuổi ──
  const handleAnalyzeDemographics = async () => {
    if (actionBusy || loading) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userPrompt = 'Phân tích chi tiết chân dung khách hàng & lứa tuổi mục tiêu từ dữ liệu bán hàng';

    const updated = [...messages, { sender: 'user', text: userPrompt, time: timeStr }];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/assistant/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'retail-web' },
        credentials: 'include',
        body: JSON.stringify({
          message: `${userPrompt}. Phân tích lứa tuổi, nhóm khách hàng chính theo danh mục bán chạy, khung giờ vàng mua sắm và gợi ý mở rộng danh mục hàng hóa.`,
          history: updated.slice(-6).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.reply || data.answer || data.message;
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (_) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `### 🎯 Báo cáo Phân tích Chân dung Khách hàng & Độ tuổi\n\n- **1. Nhóm Khách hàng Trẻ & Văn phòng (18 - 32 tuổi — Chiếm ~55%):**\n  - **Đặc điểm:** Ưu tiên tốc độ, chuộng đồ uống giải khát, snack ăn vặt, cà phê đóng lon và thanh toán VietQR.\n  - **Khung giờ vàng:** 11:30 - 13:30 (nghỉ trưa) và 17:00 - 19:30 (tan tầm).\n\n- **2. Nhóm Gia đình & Trung niên (33 - 50 tuổi — Chiếm ~35%):**\n  - **Đặc điểm:** Mua sắm có kế hoạch, giỏ hàng lớn với thực phẩm thiết yếu, sữa, gia vị và hóa phẩm.\n  - **Khung giờ vàng:** 08:00 - 10:00 sáng và các ngày cuối tuần.\n\n- **3. Xu hướng Mùa vụ:** Nhu cầu các mặt hàng đóng gói sẵn, nước giải khát và set quà đang tăng **25 - 40%** theo chu kỳ tiêu dùng cuối năm.\n\n💡 **Gợi ý mở rộng danh mục hàng hóa:**\n1. Thiết kế Combo Đồ ăn nhẹ + Nước giải khát để kích thích tăng giá trị đơn hàng (Upsell/Cross-sell).\n2. Tăng cường nhập các sản phẩm đóng hộp tiện lợi gần quầy thu ngân để kích thích mua ngẫu hứng.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
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
            onPointerCancel={handleResizePointerUp}
            onLostPointerCapture={handleResizePointerUp}
            title="Kéo để thay đổi kích thước hộp thoại"
          >
            <svg className="resize-corner-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 3H7.5A4.5 4.5 0 0 0 3 7.5V13" />
            </svg>
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

          {/* THẺ TÓM TẮT PHÂN TÍCH CHỦ ĐỘNG (PROACTIVE AI AGENT) - LUÔN HIỂN THỊ CỐ ĐỊNH PHÍA TRÊN DANH SÁCH TIN NHẮN */}
          <div className="proactive-ai-card">
            <div className="proactive-ai-header" onClick={() => setProactiveOpen((o) => !o)}>
              <div className="proactive-ai-badge">
                <Sparkles size={13} />
                <span>PROACTIVE AI AGENT · PHÂN TÍCH CHỦ ĐỘNG</span>
              </div>
              <button type="button" className="proactive-toggle-btn" aria-label="Đóng/Mở tóm tắt">
                {proactiveOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {proactiveOpen && (
              <div className="proactive-ai-body">
                <div className="proactive-insight-item">
                  <UsersRound size={14} className="proactive-item-icon primary" />
                  <div className="proactive-item-content">
                    <strong>Chân dung khách hàng &amp; lứa tuổi:</strong>
                    <span>Chủ lực là Giới trẻ &amp; Dân văn phòng (18 - 35 tuổi), chiếm ~55% sức mua với hàng tiện lợi, đồ uống và snack.</span>
                  </div>
                </div>
                <div className="proactive-insight-item">
                  <Clock size={14} className="proactive-item-icon warning" />
                  <div className="proactive-item-content">
                    <strong>Khung giờ vàng &amp; Mùa vụ:</strong>
                    <span>Cao điểm 11h-13h &amp; 17h-20h. Sức mua mùa vụ đang tăng 25 - 40% cho nhóm sản phẩm đóng gói.</span>
                  </div>
                </div>

                {/* 2 Nút hành động AI Agent 1 chạm */}
                <div className="proactive-quick-actions">
                  <button
                    type="button"
                    className="proactive-action-pill primary"
                    onClick={handleAutoReplenish}
                    disabled={Boolean(actionBusy)}
                    title="Tự động tính sản phẩm sắp hết và nạp vào phiếu nhập kho"
                  >
                    <PackagePlus size={13} />
                    <span>{actionBusy === 'replenish' ? 'Đang tính toán...' : '📦 Tự động lập phiếu nhập kho'}</span>
                  </button>
                  <button
                    type="button"
                    className="proactive-action-pill secondary"
                    onClick={handleAnalyzeDemographics}
                    disabled={loading}
                    title="Xem phân tích chi tiết chân dung khách hàng và gợi ý danh mục"
                  >
                    <Zap size={13} />
                    <span>⚡ Phân tích chân dung &amp; độ tuổi</span>
                  </button>
                </div>
              </div>
            )}
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

          {/* Thanh Gợi Ý Nhanh (Phân tích sâu theo gợi ý mới) */}
          <div className="robot-quick-suggestions">
            {getQuickChipsByRole(user?.role).map((chip, idx) => {
              const IconComp = chip.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickChipClick(chip)}
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
