import React, { useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import './AiFeatureGuideBanner.css';

export default function AiFeatureGuideBanner({ pageKey, children }) {
  const storageKey = `ai-feature-guide:${pageKey}`;
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'hidden'; } catch { return true; }
  });
  const dismiss = () => {
    try { localStorage.setItem(storageKey, 'hidden'); } catch {}
    setVisible(false);
  };

  if (!visible) return (
    <div className="ai-feature-guide-reopen-wrap">
      <button type="button" className="ai-feature-guide-reopen" onClick={() => setVisible(true)}>Xem hướng dẫn chức năng</button>
    </div>
  );

  return (
    <section className="ai-feature-guide" aria-label="Chức năng này giúp gì cho cửa hàng?">
      <div className="ai-feature-guide-layout">
        <Lightbulb className="ai-feature-guide-icon" size={22} aria-hidden="true" />
        <div className="ai-feature-guide-copy">
          <strong>Chức năng này giúp gì cho cửa hàng?</strong>
          <p>{children}</p>
        </div>
        <button type="button" className="ai-feature-guide-dismiss" onClick={dismiss}><Sparkles size={14} /> Đã hiểu (Ẩn hướng dẫn)</button>
      </div>
    </section>
  );
}
