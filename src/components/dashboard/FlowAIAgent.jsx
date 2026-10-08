import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  AlertTriangle,
  Info,
  AlertCircle,
  FileSpreadsheet,
  Download,
  ArrowRight,
  TrendingUp,
  Droplets,
  Layers,
  MessageSquare,
  ShieldAlert,
  Copy,
  Check,
  RotateCcw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import {
  generate_daily_executive_summary,
  get_smart_anomalies,
  process_flow_ai_query,
} from '../../utils/flowAiTools';
import { downloadReport, defaultSelectedSections } from '../../reportExport';
import { downloadPdfReport } from '../../reportPdfExport';
import { useLanguage } from '../../context/LanguageContext';

const PROMPT_CHIPS = [
  { label: "Today's Net Profit", query: "Aaj ka net profit kitna hai?" },
  { label: 'Check Tank Runout', query: 'Kaunsa tank refill karna chahiye?' },
  { label: 'Cash Mismatch Check', query: 'Kya kisi operator ka cash mismatch hai?' },
  { label: 'Best-Selling Shift', query: 'Aj ki best-selling shift konsi thi?' },
  { label: 'Active Shift On Duty', query: 'Konsi shift active hai?' },
  { label: 'Current Fuel Rates', query: 'Petrol and diesel rates kya chal rahe hain?' },
  { label: 'Dip Readings & Status', query: 'Tank dips or calibration status kya hai?' },
  { label: "Today's Excel Report", query: "Give me today's report" },
  { label: 'Expense Breakdown', query: 'Aaj ke kharche kitne hain?' },
];

function formatAiText(text) {
  if (!text) return null;
  const lines = text.split('\n');

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} className="ai-line-gap" />;
    }

    const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');
    const content = isBullet ? trimmed.replace(/^[•\-]\s*/, '') : trimmed;

    // Parse bold text **bold**
    const parts = content.split(/(\*\*.*?\*\*)/g);
    const parsed = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={idx} className="ai-bullet-row">
          <span className="ai-bullet-bullet">•</span>
          <span className="ai-bullet-body">{parsed}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="ai-paragraph">
        {parsed}
      </p>
    );
  });
}

export default function FlowAIAgent({
  userName = 'Owner',
  sales,
  tanks = [],
  income = [],
  expenses = [],
  employees = [],
  shiftReconciliation = [],
  overview,
  today,
  notify = () => {},
  onOpenDeliveryOrder,
  onNavigate = () => {},
}) {
  const { t, lang, isRtl } = useLanguage();
  const isUrdu = lang === 'ur';

  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'briefing'
  const [queryInput, setQueryInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const chipsRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkChipsScroll = () => {
    if (chipsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = chipsRef.current;
      setCanScrollLeft(scrollLeft > 4);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkChipsScroll();
    window.addEventListener('resize', checkChipsScroll);
    return () => window.removeEventListener('resize', checkChipsScroll);
  }, []);

  const scrollChips = (direction) => {
    if (chipsRef.current) {
      const offset = direction === 'left' ? -180 : 180;
      chipsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkChipsScroll, 220);
    }
  };

  const handleChipsWheel = (e) => {
    if (chipsRef.current && e.deltaY !== 0) {
      e.preventDefault();
      chipsRef.current.scrollLeft += e.deltaY;
      checkChipsScroll();
    }
  };

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (activeTab === 'chat' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isProcessing, activeTab]);

  // Bundle context for deterministic tools
  const context = useMemo(
    () => ({
      userName,
      sales,
      tanks,
      income,
      expenses,
      employees,
      shiftReconciliation,
      overview,
      today,
    }),
    [userName, sales, tanks, income, expenses, employees, shiftReconciliation, overview, today]
  );

  // Generate Daily Executive Summary dynamically from real application state
  const executiveSummary = useMemo(() => {
    return generate_daily_executive_summary(context);
  }, [context]);

  // Compute Smart Anomalies from deterministic rules
  const anomalies = useMemo(() => {
    return get_smart_anomalies(context);
  }, [context]);

  const alertCount = useMemo(() => {
    return anomalies.filter((a) => a.type !== 'info').length;
  }, [anomalies]);

  const handleSend = (textToSend) => {
    const q = (textToSend || queryInput).trim();
    if (!q) return;

    if (activeTab !== 'chat') {
      setActiveTab('chat');
    }

    setIsProcessing(true);
    setQueryInput('');

    setTimeout(() => {
      const response = process_flow_ai_query(q, context);
      setChatHistory((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          question: q,
          answer: response.text,
          reportTrigger: response.reportTrigger,
          actionSuggestions: response.actionSuggestions,
          time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsProcessing(false);
    }, 240);
  };

  const handleCopy = (id, text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const handleExecuteAction = (action) => {
    if (!action) return;
    if (action.actionType === 'excel') {
      handleDownloadExcel({ range: action.range || 'today', title: action.title });
    } else if (action.actionType === 'pdf') {
      handleDownloadPdf({ range: action.range || 'today', title: action.title });
    } else if (action.actionType === 'navigate') {
      if (onNavigate) {
        onNavigate(action.target);
        notify(`Navigating to ${action.label}...`);
      }
    }
  };

  const handleDownloadExcel = async (reportTrigger) => {
    setDownloadingReport(true);
    try {
      const range = reportTrigger?.range || 'today';
      let start = today;
      const end = today;

      if (range === 'week') {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        start = d.toISOString().slice(0, 10);
      } else if (range === 'month') {
        start = `${today.slice(0, 8)}01`;
      }

      await downloadReport({
        start,
        end,
        today,
        expenses,
        income,
        sections: defaultSelectedSections,
        reportType: reportTrigger?.title || 'Flow AI Generated Report',
        tanks,
        employees,
        fuelRevenue: sales?.daily?.revenue,
        fuelLitres: sales?.daily?.litres,
        shiftReconciliation,
      });

      notify('Excel report generated and downloaded successfully!');
    } catch (err) {
      console.error('Flow AI report generation error:', err);
      notify('Unable to download Excel report. Please try again.');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDownloadPdf = async (reportTrigger) => {
    setDownloadingPdf(true);
    try {
      const range = reportTrigger?.range || 'today';
      let start = today;
      const end = today;

      if (range === 'week') {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        start = d.toISOString().slice(0, 10);
      } else if (range === 'month') {
        start = `${today.slice(0, 8)}01`;
      }

      await downloadPdfReport({
        start,
        end,
        today,
        expenses,
        income,
        sections: defaultSelectedSections,
        reportType: reportTrigger?.title || 'Flow AI Generated Report',
        tanks,
        employees,
        fuelRevenue: sales?.daily?.revenue,
        fuelLitres: sales?.daily?.litres,
        shiftReconciliation,
      });

      notify('Executive PDF report (.pdf) generated and downloaded successfully!');
    } catch (err) {
      console.error('Flow AI PDF report generation error:', err);
      notify('Unable to download PDF report. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <section className="card flow-ai-card">
      {/* Executive Top Bar */}
      <div className="flow-ai-header">
        <div className="flow-ai-brand-wrap">
          <div className="flow-ai-badge-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flow-ai-heading-row">
              <h2>Flow AI</h2>
              <span className="flow-ai-pill">Station Copilot</span>
              <span className="flow-ai-status-dot" title="Live connection to station books & tank dips">
                <span className="dot-pulse" /> Live
              </span>
            </div>
            <p className="flow-ai-subtitle">
              Instant business insights, discrepancy checks &amp; audit reports
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flow-ai-tabs-wrap">
          <div className="flow-ai-segmented">
            <button
              type="button"
              className={`flow-ai-tab-pill ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={14} />
              <span>AI Chat</span>
              {chatHistory.length > 0 && (
                <span className="flow-ai-tab-count">{chatHistory.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`flow-ai-tab-pill ${activeTab === 'briefing' ? 'active' : ''}`}
              onClick={() => setActiveTab('briefing')}
            >
              <ShieldAlert size={14} />
              <span>Briefing &amp; Alerts</span>
              {alertCount > 0 && (
                <span className="flow-ai-tab-alert-badge">{alertCount}</span>
              )}
            </button>
          </div>

          {chatHistory.length > 0 && activeTab === 'chat' && (
            <button
              type="button"
              className="flow-ai-clear-btn"
              onClick={() => setChatHistory([])}
              title="Clear conversation"
              aria-label="Clear chat"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flow-ai-body">
        {/* ===================== TAB 1: AI CHAT ===================== */}
        {activeTab === 'chat' && (
          <div className="flow-ai-chat-view">
            {/* Scrollable Chat Conversation */}
            <div className="flow-ai-chat-thread">
              {chatHistory.length === 0 && (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">
                    <Bot size={24} />
                  </div>
                  <p>Ask anything about station operations, live dips, or sales.</p>
                </div>
              )}
              {chatHistory.map((item) => (
                <div className="ai-message-pair" key={item.id}>
                  {/* User Message */}
                  <div className="ai-user-bubble">
                    <div className="bubble-user-head">
                      <span className="bubble-sender">You</span>
                      <span className="bubble-time">{item.time}</span>
                    </div>
                    <p className="bubble-user-text">{item.question}</p>
                  </div>

                  {/* Agent Response */}
                  <div className="ai-agent-bubble">
                    <div className="agent-bubble-header">
                      <div className="agent-avatar-tag">
                        <Bot size={14} />
                        <span>Flow AI</span>
                      </div>
                      <div className="agent-header-actions">
                        <span className="agent-time">{item.time}</span>
                        <button
                          type="button"
                          className="ai-copy-btn"
                          onClick={() => handleCopy(item.id, item.answer)}
                          title="Copy response"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check size={12} className="green" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="agent-answer-content">
                      {formatAiText(item.answer)}
                    </div>

                    {/* Interactive Report Card Trigger */}
                    {item.reportTrigger && (
                      <div className="ai-report-action-card">
                        <div className="report-action-info">
                          <div className="report-icon-box">
                            <FileSpreadsheet size={20} />
                          </div>
                          <div>
                            <strong>{item.reportTrigger.title}</strong>
                            <small>
                              Complete audited Excel workbook (.xlsx) ready with all sheets
                            </small>
                          </div>
                        </div>
                          <div className="ai-report-buttons-row">
                            <button
                              type="button"
                              className="button primary button-sm ai-download-btn ai-pdf-btn"
                              onClick={() => handleDownloadPdf(item.reportTrigger)}
                              disabled={downloadingPdf || downloadingReport}
                            >
                              <FileText size={14} />
                              <span>{downloadingPdf ? 'Building PDF...' : 'PDF'}</span>
                            </button>
                            <button
                              type="button"
                              className="button secondary button-sm ai-download-btn"
                              onClick={() => handleDownloadExcel(item.reportTrigger)}
                              disabled={downloadingReport || downloadingPdf}
                            >
                              <Download size={14} />
                              <span>{downloadingReport ? 'Building Excel...' : 'Excel'}</span>
                            </button>
                          </div>
                        </div>
                    )}

                    {/* Intelligent Action Suggestions */}
                    {item.actionSuggestions && item.actionSuggestions.length > 0 && (
                      <div className="ai-actions-strip" role="group" aria-label="Action suggestions">
                        <span className="ai-actions-title">
                          {t('suggested_quick_actions', 'Suggested Quick Actions')}
                        </span>
                        <div className="ai-action-suggestion-grid">
                          {item.actionSuggestions.map((action, actionIdx) => (
                            <button
                              key={action.id || `action-${actionIdx}`}
                              type="button"
                              className={'ai-action-btn' + (action.actionType === 'excel' ? ' primary-action' : '')}
                              onClick={() => handleExecuteAction(action)}
                              title={action.description}
                              disabled={downloadingReport || downloadingPdf}
                            >
                              {action.actionType === 'excel' && <FileSpreadsheet size={15} style={{ color: '#16a34a', flexShrink: 0 }} />}
                              {action.actionType === 'pdf' && <FileText size={15} style={{ color: '#ef4444', flexShrink: 0 }} />}
                              {action.actionType === 'navigate' && <ArrowRight size={15} style={{ color: '#0284c7', flexShrink: 0 }} />}
                              <span>{isUrdu && action.labelUrdu ? action.labelUrdu : action.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Animated Typing Indicator */}
              {isProcessing && (
                <div className="ai-typing-row">
                  <div className="ai-typing-avatar">
                    <Bot size={13} />
                  </div>
                  <div className="ai-typing-bubble">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-label">Analyzing station ledger...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Controls: Prompt Chips & Input */}
            <div className="flow-ai-chat-bottom">
              <div className="flow-ai-chips-wrap">
                <span className="chips-label">Quick Prompts:</span>
                {canScrollLeft && (
                  <button
                    type="button"
                    className="chips-nav-btn left"
                    onClick={() => scrollChips('left')}
                    aria-label="Scroll left"
                    title="Previous prompts"
                  >
                    <ChevronLeft size={13} />
                  </button>
                )}
                <div
                  className="chips-scroll"
                  ref={chipsRef}
                  onScroll={checkChipsScroll}
                  onWheel={handleChipsWheel}
                >
                  {PROMPT_CHIPS.map((chip, idx) => (
                    <button
                      type="button"
                      key={idx}
                      className="ai-prompt-chip"
                      onClick={() => handleSend(chip.query)}
                      disabled={isProcessing}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {canScrollRight && (
                  <button
                    type="button"
                    className="chips-nav-btn right"
                    onClick={() => scrollChips('right')}
                    aria-label="Scroll right"
                    title="More prompts"
                  >
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>

              <form
                className="flow-ai-query-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <div className="query-input-wrap">
                  <Sparkles size={16} className="query-sparkle-icon" />
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="Ask Flow AI (e.g., net profit, diesel stock runout, cash mismatch, rates)..."
                    disabled={isProcessing}
                  />
                </div>
                <button
                  type="submit"
                  className="button primary ai-send-btn"
                  disabled={!queryInput.trim() || isProcessing}
                  aria-label="Send Query"
                >
                  <Send size={15} />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: BRIEFING & ALERTS ===================== */}
        {activeTab === 'briefing' && (
          <div className="flow-ai-briefing-view">
            {/* Daily Executive AI Summary */}
            <div className="flow-ai-summary-box">
              <div className="summary-banner-top">
                <span className="summary-date-tag">
                  <Bot size={15} /> Daily Executive Briefing
                </span>
                <span className="summary-time">
                  <Calendar size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Karachi Time: {new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="summary-content">
                <h3 className="summary-greeting">{executiveSummary.greeting}</h3>
                <p className="summary-profit-line">
                  <TrendingUp size={16} className="inline-icon blue" />
                  <span>{executiveSummary.profitLine}</span>
                </p>
                <p className="summary-stock-line">
                  <Droplets size={16} className="inline-icon amber" />
                  <span>{executiveSummary.stockLine}</span>
                </p>
                <p className="summary-shift-line">
                  <Layers size={16} className="inline-icon green" />
                  <span>{executiveSummary.shiftLine}</span>
                </p>

                <div className="summary-action-strip">
                  <div className="action-tag">
                    <AlertCircle size={15} />
                    <span>{executiveSummary.actionLine}</span>
                  </div>
                  {executiveSummary.lowTank && executiveSummary.lowTank.isReorderNeeded && onOpenDeliveryOrder && (
                    <button
                      type="button"
                      className="button primary button-sm ai-reorder-btn"
                      onClick={() => onOpenDeliveryOrder(executiveSummary.lowTank)}
                    >
                      Prepare Delivery Order ({executiveSummary.lowTank.fuelCode})
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Smart Anomaly & Fraud Alerts */}
            <div className="flow-ai-anomalies-section">
              <div className="anomaly-head">
                <h4>Smart Anomalies &amp; Operational Audits</h4>
                <span className="anomaly-count-badge">
                  {alertCount} {alertCount === 1 ? 'Issue' : 'Issues'} Requiring Attention
                </span>
              </div>
              <div className="anomaly-grid">
                {anomalies.map((item, idx) => {
                  const isCrit = item.type === 'critical';
                  const isWarn = item.type === 'warning';
                  const IconComp = isCrit ? AlertCircle : isWarn ? AlertTriangle : Info;

                  return (
                    <div key={idx} className={`anomaly-item anomaly-${item.type}`}>
                      <div className={`anomaly-icon-wrap icon-${item.type}`}>
                        <IconComp size={16} />
                      </div>
                      <div className="anomaly-body">
                        <div className="anomaly-top-row">
                          <strong className="anomaly-title">{item.title}</strong>
                          <span className={`anomaly-pill pill-${item.type}`}>
                            {item.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="anomaly-desc">{item.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
