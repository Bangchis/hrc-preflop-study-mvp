import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle.js";
import BadgeCheck from "lucide-react/dist/esm/icons/badge-check.js";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js";
import Database from "lucide-react/dist/esm/icons/database.js";
import GraduationCap from "lucide-react/dist/esm/icons/graduation-cap.js";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw.js";
import Save from "lucide-react/dist/esm/icons/save.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.js";
import X from "lucide-react/dist/esm/icons/x.js";
import "./styles.css";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const DEFAULT_STACK = "15bb";
const DEFAULT_HAND = "AA";

const ACTION_COLORS = {
  fold: "#3f82bc",
  call: "#5ab966",
  raise: "#f2353b",
  allin: "#8f1c20",
  neutral: "#7b7f87"
};

function App() {
  const [stacks, setStacks] = useState([]);
  const [selectedStack, setSelectedStack] = useState(DEFAULT_STACK);
  const [node, setNode] = useState(null);
  const [path, setPath] = useState([]);
  const [selectedHand, setSelectedHand] = useState(DEFAULT_HAND);
  const [activeActionFilter, setActiveActionFilter] = useState(null);
  const [matrixView, setMatrixView] = useState("strategy");
  const [terminalAction, setTerminalAction] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        setLoading(true);
        const stackResponse = await apiGet("/api/stacks");
        if (cancelled) return;
        setStacks(stackResponse.stacks);
        setSelectedStack(stackResponse.defaultStack ?? DEFAULT_STACK);
        const initial = await apiGet(`/api/stacks/${stackResponse.defaultStack ?? DEFAULT_STACK}/nodes/0`);
        if (cancelled) return;
        setNode(initial);
        setPath(initial.path);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadNode(stack, nodeId) {
    setLoading(true);
    setError("");
    try {
      const nextNode = await apiGet(`/api/stacks/${stack}/nodes/${nodeId}`);
      setNode(nextNode);
      setPath(nextNode.path);
      setTerminalAction(null);
      setActiveActionFilter(null);
      setNotice("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function resolveSpot(stack, nextPath) {
    setLoading(true);
    setError("");
    try {
      const result = await apiPost(`/api/stacks/${stack}/resolve-path`, { path: nextPath });
      setSelectedStack(stack);
      setNode(result.node);
      setPath(result.node.path);
      setTerminalAction(null);
      setActiveActionFilter(null);
      setNotice(result.ok ? "" : "Spot reset to root");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStackChange(stack) {
    if (stack === selectedStack) return;
    resolveSpot(stack, path);
  }

  function handleAction(action) {
    if (action.node === undefined) {
      setTerminalAction(action);
      setActiveActionFilter(action.index);
      return;
    }
    if (action.nodeAvailable === false) {
      showNotImplemented(`${selectedStack} node ${action.node} chưa có trong cache HRC`);
      return;
    }
    loadNode(selectedStack, action.node);
  }

  function handleHistoryJump(index) {
    resolveSpot(selectedStack, path.slice(0, index + 1));
  }

  function handleReset() {
    loadNode(selectedStack, 0);
  }

  function showNotImplemented(feature) {
    setError("");
    setNotice(`${feature} chưa được implement trong MVP preflop này.`);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 4200);
  }

  function dismissNotice() {
    window.clearTimeout(noticeTimerRef.current);
    setNotice("");
  }

  const selectedEntry = node?.hands?.[selectedHand] ?? null;

  return (
    <div className="app-shell">
      <TopBar
        stacks={stacks}
        selectedStack={selectedStack}
        onStackChange={handleStackChange}
        onReset={handleReset}
        stackInfo={node?.stack}
        onPending={showNotImplemented}
      />

      {error && (
        <div className="toast toast-error" role="alert">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="toast toast-warning" role="status">
          <AlertTriangle size={20} />
          <div className="toast-body">
            <strong>Chưa implement</strong>
            <span>{notice}</span>
          </div>
          <button type="button" className="toast-close" onClick={dismissNotice} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="workspace">
        <SideRail onReset={handleReset} onPending={showNotImplemented} />
        <main className="study-layout" aria-busy={loading}>
          <section className="top-lane">
            <SolutionBrowser
              node={node}
              onAction={handleAction}
              onHistoryJump={handleHistoryJump}
              onReset={handleReset}
              terminalAction={terminalAction}
              onTerminalClear={() => setTerminalAction(null)}
            />
          </section>

          <section className="matrix-pane">
            <MatrixHeader
              node={node}
              activeActionFilter={activeActionFilter}
              setActiveActionFilter={setActiveActionFilter}
              matrixView={matrixView}
              setMatrixView={setMatrixView}
              onPending={showNotImplemented}
            />
            <StrategyMatrix
              node={node}
              selectedHand={selectedHand}
              setSelectedHand={setSelectedHand}
              activeActionFilter={activeActionFilter}
              matrixView={matrixView}
            />
          </section>

          <aside className="detail-pane">
            <Infobox node={node} terminalAction={terminalAction} onPending={showNotImplemented} />
            <ActionSummary
              node={node}
              activeActionFilter={activeActionFilter}
              setActiveActionFilter={setActiveActionFilter}
              onAction={handleAction}
            />
            <HandDetail
              hand={selectedHand}
              entry={selectedEntry}
              actions={node?.actions ?? []}
              activeActionFilter={activeActionFilter}
              setActiveActionFilter={setActiveActionFilter}
              matrixView={matrixView}
              onPending={showNotImplemented}
            />
          </aside>
        </main>
      </div>
    </div>
  );
}

function SideRail({ onReset, onPending }) {
  const tools = [
    { icon: Bookmark, label: "Bookmark", pending: "Bookmark/save spot" },
    { icon: RotateCcw, label: "Reset", onClick: onReset },
    { icon: Save, label: "Save", pending: "Save solution" },
    { icon: BarChart3, label: "Reports", pending: "Reports" },
    { icon: SlidersHorizontal, label: "Filters", pending: "Filters" },
    { icon: Settings, label: "Settings", pending: "Settings" }
  ];

  return (
    <aside className="side-rail" aria-label="Study tools">
      {tools.map(({ icon: Icon, label, onClick, pending }) => (
        <button key={label} className="rail-button" type="button" title={label} onClick={onClick ?? (() => onPending(pending))}>
          <Icon size={18} />
        </button>
      ))}
    </aside>
  );
}

function TopBar({ stacks, selectedStack, onStackChange, onReset, stackInfo, onPending }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">H</div>
        <div>
          <div className="brand-title">HRC Study</div>
          <div className="brand-subtitle">Tournament Preflop</div>
        </div>
      </div>

      <nav className="mode-tabs">
        <button className="mode-tab active" type="button">
          <GraduationCap size={18} />
          Study
        </button>
        <button className="mode-tab" type="button" onClick={() => onPending("Ranges tab")}>
          Ranges
        </button>
        <button className="mode-tab" type="button" onClick={() => onPending("Breakdown tab")}>
          Breakdown
        </button>
      </nav>

      <div className="stack-switch">
        {stacks.map((stack) => (
          <button
            key={stack.id}
            className={`stack-button ${selectedStack === stack.id ? "active" : ""}`}
            type="button"
            onClick={() => onStackChange(stack.id)}
          >
            {stack.label}
          </button>
        ))}
      </div>

      <div className="meta-strip">
        <span>8-max</span>
        <span>{stackInfo?.equityModel?.toUpperCase() ?? "CHIPEV"}</span>
        <span>BB ante</span>
        <span>{selectedStack}</span>
      </div>

      <button className="icon-button" type="button" onClick={onReset} title="Reset">
        <RotateCcw size={20} />
      </button>
    </header>
  );
}

function SolutionBrowser({ node, onAction, onHistoryJump, onReset, terminalAction, onTerminalClear }) {
  if (!node) return <Skeleton className="browser-skeleton" />;
  return (
    <div className="solution-browser">
      <button className="spot-card root-card" type="button" onClick={onReset}>
        <Database size={20} />
        <span>{node.stack.game}</span>
        <strong>{node.stack.stackBb}bb</strong>
        <em>ChipEV</em>
      </button>

      {node.browserCards.map((card) => (
        <div key={`${card.index}-${card.nodeId}-${card.position}`} className="spot-card decision-card">
          <button className="spot-card-head" type="button" onClick={() => onHistoryJump(card.index)}>
            <span className="spot-position">{card.position}</span>
            <strong>{formatAmount(card.stackBb)}</strong>
          </button>
          <div className="spot-action-list">
            {card.actions.map((action) => (
              <BrowserAction
                key={`${card.index}-${action.index}-${action.normalized}`}
                action={action}
                active={action.index === card.selectedIndex}
                onClick={() => (action.index === card.selectedIndex ? onHistoryJump(card.index) : onAction(action))}
              />
            ))}
          </div>
        </div>
      ))}

      {terminalAction ? (
        <>
          <button className="spot-card played-card final-action-card" type="button" onClick={onTerminalClear}>
            <span className="spot-position">{node.position}</span>
            <strong>{terminalAction.label}</strong>
            <span>End preflop</span>
          </button>
          <button className="spot-card gg-card" type="button" onClick={onReset} title="Reset to root">
            <span>GG</span>
            <BadgeCheck size={28} />
            <strong>Hand ended</strong>
          </button>
        </>
      ) : (
        <div className="spot-card current-card">
          <button className="spot-card-head current-head" type="button">
            <span className="spot-position active-pos">{node.position}</span>
            <strong>{formatAmount(node.stack.stackBb)}</strong>
          </button>
          <div className="spot-action-list">
            {node.actions.map((action) => (
              <BrowserAction key={`${action.index}-${action.normalized}`} action={action} active={false} onClick={() => onAction(action)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowserAction({ action, active, onClick }) {
  return (
    <button
      type="button"
      className={`browser-action ${action.color} ${active ? "active" : ""} ${action.nodeAvailable === false ? "missing-node" : ""}`}
      onClick={onClick}
      title={action.nodeAvailable === false ? `Node ${action.node} missing in cache` : action.label}
    >
      <span>{action.label}</span>
      {action.nodeAvailable === false ? <b>!</b> : action.node !== undefined && <ArrowRight size={14} />}
    </button>
  );
}

function MatrixHeader({ node, activeActionFilter, setActiveActionFilter, matrixView, setMatrixView, onPending }) {
  const nodeIndex = node ? node.nodeId : 0;
  return (
    <div className="panel-tabs">
      <button className={`panel-tab ${matrixView === "strategy" ? "active" : ""}`} type="button" onClick={() => setMatrixView("strategy")}>Strategy</button>
      <button className={`panel-tab ${matrixView === "range" ? "active" : ""}`} type="button" onClick={() => setMatrixView("range")}>Ranges</button>
      <button className="panel-tab" type="button" onClick={() => onPending("Breakdown")}>Breakdown</button>
      <button className="panel-tab dropdown" type="button" onClick={() => onPending("Reports: Flops")}>
        Reports: Flops
        <ChevronDown size={14} />
      </button>
      <div className="panel-spacer" />
      <span className="node-counter" title={`Current node ${nodeIndex}`}>
        {nodeIndex}/100
        <HelpCircle size={12} />
      </span>
      <span className="view-hint">{matrixView === "range" ? "Weight view" : "Strategy view"}</span>
      {matrixView === "strategy" && node?.actions?.map((action) => (
          <button
            key={action.index}
            className={`filter-chip ${activeActionFilter === action.index ? "active" : ""}`}
            type="button"
            onClick={() => setActiveActionFilter(activeActionFilter === action.index ? null : action.index)}
          >
            {action.shortLabel}
          </button>
        ))}
    </div>
  );
}

function StrategyMatrix({ node, selectedHand, setSelectedHand, activeActionFilter, matrixView }) {
  const hands = useMemo(() => buildHandGrid(), []);
  if (!node) return <Skeleton className="matrix-skeleton" />;

  return (
    <div className={`range-grid ${matrixView === "range" ? "range-view" : "strategy-view"}`}>
      {hands.map((hand) => {
        const entry = node.hands[hand];
        return (
          <button
            key={hand}
            className={`hand-cell ${selectedHand === hand ? "selected" : ""} ${entry.weight <= 0 ? "out-of-range" : ""}`}
            style={{ background: handBackground(entry, node.actions, activeActionFilter, matrixView) }}
            type="button"
            onMouseEnter={() => setSelectedHand(hand)}
            onClick={() => setSelectedHand(hand)}
            title={handTitle(hand, entry, node.actions)}
          >
            <span className="hand-label">{hand}</span>
            {matrixView === "range" && <span className="weight-pill">{Math.round(entry.weight * 100)}</span>}
            {matrixView === "strategy" && entry.weight <= 0 && <span className="counterfactual-pill">CF</span>}
            {selectedHand === hand && <CellPopover hand={hand} entry={entry} actions={node.actions} matrixView={matrixView} />}
          </button>
        );
      })}
    </div>
  );
}

function CellPopover({ hand, entry, actions, matrixView }) {
  const outsideRange = entry.weight <= 0;
  return (
    <div className="cell-popover" aria-hidden="true">
      <div className="cell-popover-head">
        <strong>{hand}</strong>
        <span>{entry.weight > 0 ? `${(entry.weight * 100).toFixed(1)}% range` : "0% range"}</span>
      </div>
      <div className={`range-note ${outsideRange ? "outside" : ""}`}>
        {outsideRange ? "Outside actual range - counterfactual EV shown" : matrixView === "range" ? "Actual range weight at this spot" : "Strategy frequencies from HRC"}
      </div>
      {actions.map((action, index) => (
        <div key={`${hand}-${action.index}-peek`} className="cell-popover-row">
          <span>{action.label}</span>
          <b>{(entry.played[index] * 100).toFixed(1)}</b>
          <em>{entry.evs[index].toFixed(3)} EV</em>
        </div>
      ))}
    </div>
  );
}

function Infobox({ node, terminalAction, onPending }) {
  if (!node) return <Skeleton className="infobox-skeleton" />;
  return (
    <section className="info-panel">
      <div className="overview-tabs">
        <button className="overview-tab active" type="button">Overview</button>
        <button className="overview-tab" type="button" onClick={() => onPending("Poker table view")}>Table</button>
        <button className="overview-tab" type="button" onClick={() => onPending("Equity chart")}>Equity chart</button>
      </div>
      <div className="position-row">
        {node.stack.positions.map((position, index) => (
          <div key={position} className={`position-token ${index === node.player ? "active" : ""}`}>
            <span>{position}</span>
            <strong>{index === 6 ? "SB" : index === 7 ? "BB" : node.stack.stackBb}</strong>
          </div>
        ))}
      </div>
      <div className="pot-row">
        <div>
          <span>Pot</span>
          <strong>{formatAmount(node.state.potBb)} BB</strong>
        </div>
        <div>
          <span>To call</span>
          <strong>{formatAmount(node.state.toCallBb)} BB</strong>
        </div>
        <div>
          <span>Acting</span>
          <strong>{node.position}</strong>
        </div>
      </div>
      {terminalAction && <div className="terminal-banner">{terminalAction.label}</div>}
    </section>
  );
}

function ActionSummary({ node, activeActionFilter, setActiveActionFilter, onAction }) {
  if (!node) return <Skeleton className="summary-skeleton" />;
  return (
    <section className="action-summary">
      <div className="summary-header">
        <button type="button" className="summary-dropdown">
          Actions
          <ChevronDown size={14} />
        </button>
        <strong>{node.position}</strong>
      </div>
      <div className="action-cards">
        {node.summary.actions.map((action) => (
          <div
            key={action.index}
            className={`action-card ${action.color} ${activeActionFilter === action.index ? "active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveActionFilter(activeActionFilter === action.index ? null : action.index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveActionFilter(activeActionFilter === action.index ? null : action.index);
              }
            }}
          >
            <div className="action-card-top">
              <span>{action.label}</span>
              <strong>{(action.frequency * 100).toFixed(1)}%</strong>
            </div>
            <div className="action-card-footer">
              <span>{action.combos.toFixed(2)} combos</span>
              <button
                type="button"
                className="go-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(node.actions[action.index]);
                }}
              >
                {node.actions[action.index]?.nodeAvailable === false ? "Missing" : node.actions[action.index]?.node === undefined ? "End" : "Go"}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HandDetail({ hand, entry, actions, activeActionFilter, setActiveActionFilter, matrixView, onPending }) {
  if (!entry) return <Skeleton className="handdetail-skeleton" />;
  const bestIndex = entry.played.reduce((best, value, index) => (value > entry.played[best] ? index : best), 0);
  const bestEvIndex = entry.evs.reduce((best, value, index) => (value > entry.evs[best] ? index : best), 0);
  const outsideRange = entry.weight <= 0;

  return (
    <section className="hand-detail">
      <div className="hand-tabs">
        <button className="hand-tab active" type="button">Hands</button>
        <button className="hand-tab" type="button" onClick={() => onPending("Hand summary")}>Summary</button>
        <button className="hand-tab" type="button" onClick={() => onPending("Hand filters")}>Filters</button>
        <button className="hand-tab" type="button" onClick={() => onPending("Blockers")}>Blockers</button>
      </div>
      <div className="hand-detail-header">
        <div>
          <span>Selected hand</span>
          <strong>{hand}</strong>
        </div>
        <div className="ev-stat">
          <span>Best EV</span>
          <strong>{actions[bestEvIndex]?.label ?? "-"} {entry.evs[bestEvIndex]?.toFixed(3)}</strong>
        </div>
        <div className={`range-state ${outsideRange ? "out" : "in"}`}>
          {outsideRange ? "Outside range" : `${(entry.weight * 100).toFixed(1)}% range`}
        </div>
      </div>
      <div className={`detail-note ${outsideRange ? "warning" : ""}`}>
        {outsideRange
          ? "This hand has weight 0 in the actual range at this node. Frequencies and EVs are counterfactual reference values."
          : matrixView === "range"
            ? "Ranges view uses hand weight; Strategy view uses played frequencies."
            : "Strategy view colors cells by played frequencies; range weight is shown separately."}
      </div>
      <div className="hand-bars">
        {actions.map((action, index) => (
          <button
            key={`${hand}-${action.index}`}
            className={`hand-row ${index === bestIndex ? "best" : ""} ${activeActionFilter === index ? "active" : ""}`}
            type="button"
            onClick={() => setActiveActionFilter(activeActionFilter === index ? null : index)}
          >
            <span>{action.label}</span>
            <div className="freq-track">
              <div className={`freq-fill ${action.color}`} style={{ width: `${entry.played[index] * 100}%` }} />
            </div>
            <strong>{(entry.played[index] * 100).toFixed(1)}%</strong>
            <em>{entry.evs[index].toFixed(3)} EV</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function Skeleton({ className }) {
  return <div className={`skeleton ${className ?? ""}`} />;
}

function buildHandGrid() {
  const grid = [];
  for (let row = 0; row < RANKS.length; row += 1) {
    for (let column = 0; column < RANKS.length; column += 1) {
      if (row === column) grid.push(`${RANKS[row]}${RANKS[column]}`);
      else if (row < column) grid.push(`${RANKS[row]}${RANKS[column]}s`);
      else grid.push(`${RANKS[column]}${RANKS[row]}o`);
    }
  }
  return grid;
}

function handBackground(entry, actions, activeActionFilter, matrixView) {
  if (!entry) {
    return "#050606";
  }

  if (matrixView === "range") {
    return rangeBackground(entry.weight);
  }

  if (activeActionFilter !== null) {
    const action = actions[activeActionFilter];
    const alpha = Math.max(0.08, entry.played[activeActionFilter]);
    return `linear-gradient(90deg, ${hexToRgba(ACTION_COLORS[action.color], alpha)} 0 100%)`;
  }

  let cursor = 0;
  const stops = [];
  entry.played.forEach((frequency, index) => {
    if (frequency <= 0) return;
    const next = cursor + frequency * 100;
    const color = ACTION_COLORS[actions[index].color] ?? ACTION_COLORS.neutral;
    stops.push(`${color} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`);
    cursor = next;
  });

  if (!stops.length) return "#1e2226";
  if (cursor < 100) stops.push(`#151719 ${cursor.toFixed(2)}% 100%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function rangeBackground(weight) {
  if (weight <= 0) {
    return "#1e1e1e";
  }
  const alpha = Math.min(1, Math.max(0.16, weight));
  return `linear-gradient(90deg, rgba(255, 143, 0, ${alpha}) 0 100%)`;
}

function handTitle(hand, entry, actions) {
  return [
    `${hand} | weight ${(entry.weight * 100).toFixed(2)}%`,
    ...actions.map((action, index) => `${action.label}: ${(entry.played[index] * 100).toFixed(1)}%, EV ${entry.evs[index].toFixed(3)}`)
  ].join("\n");
}

function formatAmount(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2))).replace(/\.0+$/, "");
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function apiGet(path) {
  const response = await fetch(path);
  return parseResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

createRoot(document.getElementById("root")).render(<App />);
