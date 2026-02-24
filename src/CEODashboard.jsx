import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const PHARMACIES = [
  "Binscombe Pharmacy",
  "Popley Pharmacy",
  "Direct Pharmacy",
  "Dapdune Pharmacy",
  "Winklebury Pharmacy",
  "East Wittering Pharmacy",
];

const SERVICES = [
  { id: "nms_intervention", label: "NMS – Intervention", fee: 14.00, category: "NHS Clinical" },
  { id: "nms_followup", label: "NMS – Follow Up", fee: 14.00, category: "NHS Clinical" },
  { id: "bp_check", label: "BP Clinic Check", fee: 10.00, category: "NHS Clinical" },
  { id: "bp_abpm", label: "BP Clinic ABPM", fee: 50.85, category: "NHS Clinical" },
  { id: "pcs_oral", label: "PCS – Oral Contraceptive", fee: 25.00, category: "NHS Clinical" },
  { id: "pcs_emergency", label: "PCS – Emergency Contraceptive", fee: 20.00, category: "NHS Clinical" },
  { id: "nhs_flu", label: "NHS Flu", fee: 10.06, category: "Vaccinations" },
  { id: "private_flu", label: "Private Flu", fee: 23.00, category: "Vaccinations" },
  { id: "nhs_covid", label: "NHS Covid", fee: 10.06, category: "Vaccinations" },
  { id: "private_covid", label: "Private Covid", fee: 99.00, category: "Vaccinations" },
  { id: "travel_clinic", label: "Travel Clinics", fee: null, category: "Private Clinics" },
  { id: "weight_loss", label: "Weight Loss Clinic", fee: null, category: "Private Clinics" },
  { id: "ear_single", label: "Ear Microsuction – Single", fee: 40.00, category: "Private Clinics" },
  { id: "ear_both", label: "Ear Microsuction – Both Ears", fee: 70.00, category: "Private Clinics" },
  { id: "cpcs_ums", label: "CPCS – UMS", fee: 15.00, category: "CPCS" },
  { id: "cpcs_mi", label: "CPCS – MI", fee: 17.00, category: "CPCS" },
];

const CAT_COLORS = { "NHS Clinical": "#10b981", "Vaccinations": "#3b82f6", "Private Clinics": "#f59e0b", "CPCS": "#8b5cf6" };
const PIE_COLORS = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#06b6d4"];
const PHARM_COLORS = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#06b6d4"];
const DEADLINE_HOUR = 12;

function getWeekLabel() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().split("T")[0];
}

function getWeekOffset(dateStr, offset) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offset * 7);
  return d.toISOString().split("T")[0];
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmt(v) {
  return "£" + Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcRevenue(svc, data) {
  if (!data) return 0;
  if (svc.fee === null) return parseFloat(data.revenues?.[svc.id]) || 0;
  return (data.counts?.[svc.id] || 0) * svc.fee;
}

function arrow(curr, prev) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { icon: "→", color: "#94a3b8", pct: 0 };
  return pct > 0 ? { icon: "↑", color: "#34d399", pct: pct.toFixed(1) } : { icon: "↓", color: "#f87171", pct: Math.abs(pct).toFixed(1) };
}

function getDeadlineStatus(weekStr, submittedAt) {
  const now = new Date();
  const weekDate = new Date(weekStr);
  const deadline = new Date(weekDate);
  deadline.setHours(DEADLINE_HOUR, 0, 0, 0);
  if (submittedAt) {
    const subTime = new Date(submittedAt);
    return subTime <= deadline
      ? { label: "On time", color: "#34d399", bg: "rgba(16,185,129,0.1)", icon: "✓" }
      : { label: "Late", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "⚠" };
  }
  if (now > deadline) return { label: "Overdue", color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: "✗" };
  const hoursLeft = Math.round((deadline - now) / 36e5);
  if (hoursLeft <= 2) return { label: `${hoursLeft}h left`, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "⏱" };
  return { label: "Pending", color: "#64748b", bg: "rgba(255,255,255,0.03)", icon: "○" };
}

export default function CEODashboard() {
  const [week, setWeek] = useState(getWeekLabel());
  const [reports, setReports] = useState({});
  const [prevReports, setPrevReports] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [tab, setTab] = useState("overview");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [ceoEmail, setCeoEmail] = useState("");
  const [autoSent, setAutoSent] = useState(false);

  useEffect(() => { loadAll(); }, [week]);

  async function loadAll() {
    setLoading(true);
    const prevWeek = getWeekOffset(week, -1);

    const [{ data: currData }, { data: prevData }] = await Promise.all([
      supabase.from("weekly_reports").select("*").eq("week", week),
      supabase.from("weekly_reports").select("*").eq("week", prevWeek),
    ]);

    const curr = {};
    const prev = {};
    (currData || []).forEach(r => { curr[r.pharmacy] = r; });
    (prevData || []).forEach(r => { prev[r.pharmacy] = r; });
    setReports(curr);
    setPrevReports(prev);

    // 12 weeks history
    const weeks = Array.from({ length: 12 }, (_, i) => getWeekOffset(week, -i));
    const { data: histData } = await supabase
      .from("weekly_reports")
      .select("week, pharmacy, total_revenue")
      .in("week", weeks);

    const weekTotals = {};
    weeks.forEach(w => {
      weekTotals[w] = { week: w, total: 0 };
      PHARMACIES.forEach(p => { weekTotals[w][p.replace(" Pharmacy","")] = 0; });
    });
    (histData || []).forEach(r => {
      if (weekTotals[r.week]) {
        weekTotals[r.week].total += r.total_revenue || 0;
        const k = r.pharmacy.replace(" Pharmacy","");
        weekTotals[r.week][k] = (weekTotals[r.week][k] || 0) + (r.total_revenue || 0);
      }
    });
    setHistoryData(Object.values(weekTotals).reverse());

    // Monthly data — last 6 months
    const { data: allData } = await supabase
      .from("weekly_reports")
      .select("week, total_revenue, pharmacy")
      .gte("week", getWeekOffset(week, -26));

    const monthMap = {};
    (allData || []).forEach(r => {
      const mk = r.week.substring(0, 7);
      if (!monthMap[mk]) {
        monthMap[mk] = { month: mk, total: 0 };
        PHARMACIES.forEach(p => { monthMap[mk][p.replace(" Pharmacy","")] = 0; });
      }
      monthMap[mk].total += r.total_revenue || 0;
      const k = r.pharmacy.replace(" Pharmacy","");
      monthMap[mk][k] = (monthMap[mk][k] || 0) + (r.total_revenue || 0);
    });
    setMonthlyData(Object.values(monthMap).sort((a,b) => a.month.localeCompare(b.month)));

    setLoading(false);
  }

  function handlePassword() {
    if (passwordInput === "PharmacyLink") {
      setAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  }

  const submitted = Object.keys(reports).length;
  const totalRev = Object.values(reports).reduce((s, r) => s + (r.total_revenue || 0), 0);
  const prevTotalRev = Object.values(prevReports).reduce((s, r) => s + (r.total_revenue || 0), 0);
  const totalSessions = Object.values(reports).reduce((s, r) => s + (r.total_sessions || 0), 0);
  const wow = arrow(totalRev, prevTotalRev);
  const onTimeCount = PHARMACIES.filter(p => reports[p] && getDeadlineStatus(week, reports[p].submitted_at).label === "On time").length;
  const overdueCount = PHARMACIES.filter(p => getDeadlineStatus(week, reports[p]?.submitted_at).label === "Overdue").length;

  const pharmChartData = PHARMACIES.map(p => ({
    name: p.replace(" Pharmacy", ""),
    revenue: reports[p]?.total_revenue || 0,
    prevRevenue: prevReports[p]?.total_revenue || 0,
  }));

  const catData = {};
  Object.values(reports).forEach(r => {
    SERVICES.forEach(svc => {
      if (!catData[svc.category]) catData[svc.category] = 0;
      catData[svc.category] += calcRevenue(svc, r);
    });
  });
  const catPie = Object.entries(catData).map(([name, value]) => ({ name, value }));

  const svcTotals = SERVICES.map(svc => {
    let count = 0, rev = 0, prevRev = 0;
    PHARMACIES.forEach(p => {
      if (reports[p]) { count += (reports[p].counts?.[svc.id] || 0); rev += calcRevenue(svc, reports[p]); }
      if (prevReports[p]) prevRev += calcRevenue(svc, prevReports[p]);
    });
    return { ...svc, count, rev, prevRev };
  }).sort((a, b) => b.rev - a.rev);

  // PDF export — simple print approach
  function exportPDF() {
    window.print();
  }

  async function generateEmail() {
    setEmailLoading(true);
    const summaryData = {
      week: fmtDate(week),
      totalRevenue: fmt(totalRev),
      wowChange: wow ? `${wow.icon} ${wow.pct}% vs prior week` : "No prior week data",
      submitted: `${submitted}/${PHARMACIES.length}`,
      onTime: onTimeCount,
      overdue: overdueCount,
      pharmacies: PHARMACIES.map(p => ({
        name: p,
        revenue: reports[p] ? fmt(reports[p].total_revenue) : "Not submitted",
        submitted: !!reports[p],
        status: getDeadlineStatus(week, reports[p]?.submitted_at).label,
      })),
      topServices: svcTotals.slice(0, 5).map(s => ({ name: s.label, revenue: fmt(s.rev), count: s.count })),
    };
    const prompt = `You are a pharmacy group operations analyst. Write a professional, concise weekly performance summary email to the CEO of a UK independent pharmacy chain. Use this data: ${JSON.stringify(summaryData, null, 2)}. The email should: open with a warm professional greeting to the CEO, lead with headline numbers (total revenue and WoW change), mention submission compliance (how many on time, any overdue), call out the top performing site, highlight top 2-3 services by revenue, end positively. Use British English. Under 300 words. Plain text only, no markdown. Sign off as "Operations Team".`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      setEmailDraft(data.content?.map(b => b.text || "").join("") || "Could not generate email.");
    } catch { setEmailDraft("Error generating email. Please try again."); }
    setEmailLoading(false);
  }

  function copyEmail() { navigator.clipboard.writeText(emailDraft); setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2500); }

  function openInMail() {
    const subject = `Pharmacy Group — Weekly Performance Report w/c ${fmtDate(week)}`;
    const mailto = ceoEmail
      ? `mailto:${ceoEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailDraft)}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailDraft)}`;
    window.open(mailto);
    setAutoSent(true);
  }

  const TABS = ["overview","trends","services","pharmacies","submissions","email"];

  if (!authenticated) {
    return (
      <div style={D.page}>
        <div style={D.header}>
          <div>
            <div style={D.eyebrow}>Dashboard · Pharmacy Group</div>
            <h1 style={D.title}>Weekly Performance <span style={D.green}>Report</span></h1>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"70vh", padding:40 }}>
          <div style={{ maxWidth:380, width:"100%" }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{ width:64, height:64, borderRadius:"50%", border:"2px solid #10b981", background:"rgba(16,185,129,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 16px" }}>🔒</div>
              <div style={{ fontSize:20, fontWeight:700, color:"#f1f5f9", marginBottom:8 }}>Access Required</div>
              <div style={{ fontSize:13, color:"#64748b" }}>Enter your password to view the dashboard</div>
            </div>
            <div style={{ fontSize:11, color:"#64748b", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Password</div>
            <input
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={e => e.key === "Enter" && handlePassword()}
              style={{ width:"100%", padding:"12px 16px", borderRadius:10, border:`1px solid ${passwordError ? "#f87171" : "rgba(255,255,255,0.1)"}`, background:"rgba(255,255,255,0.05)", color:"#f1f5f9", fontSize:15, outline:"none", boxSizing:"border-box", marginBottom: passwordError ? 8 : 16, fontFamily:"monospace" }}
              autoFocus
            />
            {passwordError && (
              <div style={{ color:"#f87171", fontSize:13, marginBottom:12, textAlign:"center" }}>
                Incorrect password — please try again
              </div>
            )}
            <button
              onClick={handlePassword}
              disabled={!passwordInput}
              style={{ width:"100%", padding:"14px", borderRadius:10, border:"none", background: passwordInput ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(255,255,255,0.06)", color: passwordInput ? "#fff" : "#475569", fontSize:15, fontWeight:700, cursor: passwordInput ? "pointer" : "not-allowed", boxShadow: passwordInput ? "0 4px 20px rgba(16,185,129,0.3)" : "none" }}
            >
              Access Dashboard →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={D.page}>
      {/* HEADER */}
      <div style={D.header}>
        <div>
          <div style={D.eyebrow}>Dashboard · Pharmacy Group</div>
          <h1 style={D.title}>Weekly Performance <span style={D.green}>Report</span></h1>
        </div>
        <div style={D.headerRight}>
          <div style={D.weekNav}>
            <button style={D.navBtn} onClick={() => setWeek(w => getWeekOffset(w, -1))}>←</button>
            <div style={D.weekBox}>
              <div style={D.weekText}>w/c {fmtDate(week)}</div>
              <input type="date" value={week} onChange={e => setWeek(e.target.value)} style={D.weekPicker} />
            </div>
            <button style={D.navBtn} onClick={() => setWeek(w => getWeekOffset(w, 1))}>→</button>
          </div>
          <button onClick={loadAll} style={D.refreshBtn}>↺ Refresh</button>
          <button onClick={exportPDF} style={D.pdfBtn}>⬇ Export PDF</button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div style={D.kpiStrip}>
        {[
          { label: "Total Revenue", value: fmt(totalRev), sub: `${submitted}/${PHARMACIES.length} sites submitted` },
          { label: "Week-on-Week", value: wow ? `${wow.icon} ${wow.pct}%` : "—", color: wow?.color, sub: `vs ${fmtDate(getWeekOffset(week,-1))}` },
          { label: "Avg per Site", value: submitted > 0 ? fmt(totalRev / submitted) : "£0.00", sub: "submitted sites only" },
          { label: "Compliance", value: `${onTimeCount}/${PHARMACIES.length}`, color: onTimeCount === PHARMACIES.length ? "#34d399" : "#f59e0b", sub: overdueCount > 0 ? `${overdueCount} overdue` : "All on time" },
          { label: "Top Site", value: [...pharmChartData].sort((a,b)=>b.revenue-a.revenue)[0]?.name || "—", color: "#a78bfa", sub: fmt([...pharmChartData].sort((a,b)=>b.revenue-a.revenue)[0]?.revenue || 0) },
        ].map((k, i) => (
          <div key={i} style={D.kpi}>
            <div style={{ ...D.kpiVal, ...(k.color ? { color: k.color } : {}) }}>{k.value}</div>
            <div style={D.kpiSub}>{k.sub}</div>
            <div style={D.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={D.tabRow}>
        {TABS.map(t => (
          <button key={t} style={{ ...D.tab, ...(tab===t?D.tabOn:{}) }} onClick={() => setTab(t)}>
            {t === "email" ? "✉ Email CEO" : t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={D.content}>
        {loading && <div style={D.loading}>Loading data...</div>}

        {/* ── OVERVIEW ── */}
        {!loading && tab === "overview" && (
          <div>
            <div style={D.row2}>
              <div style={D.card}>
                <div style={D.cardTitle}>Revenue by Site — This Week vs Prior Week</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={pharmChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => "£"+(v/1000).toFixed(1)+"k"} />
                    <Tooltip formatter={v=>[fmt(v)]} contentStyle={D.tooltip} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                    <Bar dataKey="revenue" name="This week" fill="#10b981" radius={[3,3,0,0]} barSize={18} />
                    <Bar dataKey="prevRevenue" name="Prior week" fill="rgba(255,255,255,0.12)" radius={[3,3,0,0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={D.card}>
                <div style={D.cardTitle}>Revenue by Category</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={catPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {catPie.map((e,i) => <Cell key={i} fill={CAT_COLORS[e.name]||PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={v=>[fmt(v)]} contentStyle={D.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={D.legend}>
                  {catPie.map((e,i) => (
                    <div key={i} style={D.legendRow}>
                      <span style={{ ...D.dot, background: CAT_COLORS[e.name]||PIE_COLORS[i] }} />
                      <span style={D.legendName}>{e.name}</span>
                      <span style={D.legendVal}>{fmt(e.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DEADLINE TRACKER */}
            <div style={D.card}>
              <div style={D.cardTitle}>Submission Compliance — Deadline: Monday {DEADLINE_HOUR}:00</div>
              <div style={D.statusGrid}>
                {PHARMACIES.map(p => {
                  const r = reports[p];
                  const prev = prevReports[p];
                  const w = r && prev ? arrow(r.total_revenue, prev.total_revenue) : null;
                  const status = getDeadlineStatus(week, r?.submitted_at);
                  return (
                    <div key={p} style={{ ...D.statusCard, background: status.bg, borderColor: status.color + "55" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div style={{ ...D.statusDot, background: status.color }} />
                        <div style={{ fontSize:10, color:status.color, fontFamily:"monospace", fontWeight:600, padding:"2px 8px", borderRadius:100, border:`1px solid ${status.color}44`, background:`${status.color}15` }}>
                          {status.icon} {status.label}
                        </div>
                      </div>
                      <div style={D.statusName}>{p}</div>
                      <div style={{ ...D.statusRev, color: r ? "#34d399" : "#475569" }}>
                        {r ? fmt(r.total_revenue) : "Not submitted"}
                      </div>
                      {w && <div style={{ fontSize:11, color:w.color, fontFamily:"monospace", marginTop:4 }}>{w.icon} {w.pct}% vs last wk</div>}
                      {r && <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace", marginTop:4 }}>
                        Submitted {new Date(r.submitted_at).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" })}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TRENDS ── */}
        {!loading && tab === "trends" && (
          <div>
            <div style={D.card}>
              <div style={D.cardTitle}>Group Total Revenue — Last 12 Weeks</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fill:"#64748b", fontSize:10 }} tickFormatter={v => { const d = new Date(v); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }} />
                  <YAxis tick={{ fill:"#64748b", fontSize:10 }} tickFormatter={v => "£"+(v/1000).toFixed(1)+"k"} />
                  <Tooltip formatter={v=>[fmt(v),"Revenue"]} labelFormatter={v => "w/c "+fmtDate(v)} contentStyle={D.tooltip} />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} dot={{ fill:"#10b981", r:4 }} activeDot={{ r:6 }} name="Group Total" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={D.card}>
              <div style={D.cardTitle}>Revenue by Site — Last 12 Weeks</div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fill:"#64748b", fontSize:10 }} tickFormatter={v => { const d = new Date(v); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }} />
                  <YAxis tick={{ fill:"#64748b", fontSize:10 }} tickFormatter={v => "£"+(v/1000).toFixed(1)+"k"} />
                  <Tooltip formatter={v=>[fmt(v)]} labelFormatter={v => "w/c "+fmtDate(v)} contentStyle={D.tooltip} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748b" }} />
                  {PHARMACIES.map((p,i) => (
                    <Line key={p} type="monotone" dataKey={p.replace(" Pharmacy","")} stroke={PHARM_COLORS[i]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={D.card}>
              <div style={D.cardTitle}>Monthly Revenue by Site — Last 6 Months</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData.slice(-6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill:"#64748b", fontSize:11 }} tickFormatter={v => { const d = new Date(v+"-01"); return d.toLocaleDateString("en-GB",{month:"short",year:"2-digit"}); }} />
                  <YAxis tick={{ fill:"#64748b", fontSize:10 }} tickFormatter={v => "£"+(v/1000).toFixed(0)+"k"} />
                  <Tooltip formatter={v=>[fmt(v)]} labelFormatter={v => { const d = new Date(v+"-01"); return d.toLocaleDateString("en-GB",{month:"long",year:"numeric"}); }} contentStyle={D.tooltip} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748b" }} />
                  {PHARMACIES.map((p,i) => (
                    <Bar key={p} dataKey={p.replace(" Pharmacy","")} stackId="a" fill={PHARM_COLORS[i]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Month vs Month comparison table */}
              {monthlyData.length >= 2 && (() => {
                const curr = monthlyData[monthlyData.length-1];
                const prev = monthlyData[monthlyData.length-2];
                const currTotal = curr.total;
                const prevTotal = prev.total;
                const w = arrow(currTotal, prevTotal);
                return (
                  <div style={{ marginTop:20 }}>
                    <div style={{ fontSize:11, color:"#64748b", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>
                      Month vs Month: {new Date(curr.month+"-01").toLocaleDateString("en-GB",{month:"long",year:"numeric"})} vs {new Date(prev.month+"-01").toLocaleDateString("en-GB",{month:"long",year:"numeric"})}
                    </div>
                    <table style={D.table}>
                      <thead><tr>
                        <th style={D.th}>Site</th>
                        <th style={{ ...D.th, textAlign:"right" }}>This Month</th>
                        <th style={{ ...D.th, textAlign:"right" }}>Last Month</th>
                        <th style={{ ...D.th, textAlign:"right" }}>Change</th>
                      </tr></thead>
                      <tbody>
                        {PHARMACIES.map((p,i) => {
                          const k = p.replace(" Pharmacy","");
                          const cRev = curr[k] || 0;
                          const pRev = prev[k] || 0;
                          const wa = arrow(cRev, pRev);
                          return (
                            <tr key={p} style={{ background: i%2===0?"transparent":"rgba(255,255,255,0.015)" }}>
                              <td style={D.td}><span style={{ ...D.dot, background:PHARM_COLORS[i], display:"inline-block", marginRight:8, verticalAlign:"middle" }} />{p}</td>
                              <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#34d399" }}>{fmt(cRev)}</td>
                              <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#64748b" }}>{fmt(pRev)}</td>
                              <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:wa?.color||"#475569" }}>{wa?`${wa.icon} ${wa.pct}%`:"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot><tr style={{ borderTop:"2px solid rgba(255,255,255,0.1)" }}>
                        <td style={{ ...D.td, fontWeight:700, color:"#f1f5f9" }}>Group Total</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#34d399", fontWeight:700 }}>{fmt(currTotal)}</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#64748b", fontWeight:700 }}>{fmt(prevTotal)}</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:w?.color||"#475569", fontWeight:700 }}>{w?`${w.icon} ${w.pct}%`:"—"}</td>
                      </tr></tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── SERVICES ── */}
        {!loading && tab === "services" && (
          <div style={D.card}>
            <div style={D.cardTitle}>Group Service Breakdown</div>
            <div style={{ overflowX:"auto" }}>
              <table style={D.table}>
                <thead><tr>
                  <th style={D.th}>Service</th><th style={D.th}>Category</th>
                  <th style={{ ...D.th, textAlign:"right" }}>Fee</th>
                  <th style={{ ...D.th, textAlign:"right" }}>Sessions</th>
                  <th style={{ ...D.th, textAlign:"right" }}>Revenue</th>
                  <th style={{ ...D.th, textAlign:"right" }}>vs Prior Wk</th>
                </tr></thead>
                <tbody>
                  {svcTotals.map((svc,i) => {
                    const w = arrow(svc.rev, svc.prevRev);
                    return (
                      <tr key={svc.id} style={{ background: i%2===0?"transparent":"rgba(255,255,255,0.015)" }}>
                        <td style={D.td}>{svc.label}</td>
                        <td style={D.td}><span style={{ ...D.badge, background:(CAT_COLORS[svc.category]||"#64748b")+"22", color:CAT_COLORS[svc.category]||"#94a3b8" }}>{svc.category}</span></td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#64748b" }}>{svc.fee!=null?fmt(svc.fee):"Var."}</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace" }}>{svc.count}</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#34d399", fontWeight:600 }}>{fmt(svc.rev)}</td>
                        <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:w?.color||"#475569" }}>{w?`${w.icon} ${w.pct}%`:"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{ borderTop:"2px solid rgba(255,255,255,0.1)" }}>
                  <td style={{ ...D.td, fontWeight:700, color:"#f1f5f9" }} colSpan={3}>Total</td>
                  <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>{svcTotals.reduce((a,b)=>a+b.count,0)}</td>
                  <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:"#34d399", fontWeight:700 }}>{fmt(totalRev)}</td>
                  <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", color:wow?.color||"#475569" }}>{wow?`${wow.icon} ${wow.pct}%`:"—"}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── PHARMACIES ── */}
        {!loading && tab === "pharmacies" && (
          <div style={D.card}>
            <div style={D.cardTitle}>Site × Service Matrix</div>
            <div style={{ overflowX:"auto" }}>
              <table style={D.table}>
                <thead><tr>
                  <th style={{ ...D.th, minWidth:160 }}>Service</th>
                  {PHARMACIES.map(p => <th key={p} style={{ ...D.th, textAlign:"right", fontSize:10, whiteSpace:"nowrap" }}>{p.replace(" Pharmacy","")}</th>)}
                  <th style={{ ...D.th, textAlign:"right" }}>Total</th>
                </tr></thead>
                <tbody>
                  {SERVICES.map((svc,i) => (
                    <tr key={svc.id} style={{ background: i%2===0?"transparent":"rgba(255,255,255,0.015)" }}>
                      <td style={{ ...D.td, fontSize:12 }}>{svc.label}</td>
                      {PHARMACIES.map(p => {
                        const rev = calcRevenue(svc, reports[p]);
                        return <td key={p} style={{ ...D.td, textAlign:"right", fontFamily:"monospace", fontSize:11, color:rev>0?"#34d399":"#1e3a2f" }}>
                          {reports[p]?(rev>0?fmt(rev):"—"):<span style={{ color:"#1a2e20" }}>N/S</span>}
                        </td>;
                      })}
                      <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", fontSize:12, color:"#a78bfa", fontWeight:600 }}>
                        {fmt(PHARMACIES.reduce((a,p)=>a+calcRevenue(svc,reports[p]),0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop:"2px solid rgba(255,255,255,0.1)" }}>
                  <td style={{ ...D.td, fontWeight:700, color:"#f1f5f9" }}>Site Total</td>
                  {PHARMACIES.map(p => <td key={p} style={{ ...D.td, textAlign:"right", fontFamily:"monospace", fontWeight:700, fontSize:12, color:reports[p]?"#34d399":"#334155" }}>
                    {reports[p]?fmt(reports[p].total_revenue||0):"N/S"}
                  </td>)}
                  <td style={{ ...D.td, textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#34d399" }}>{fmt(totalRev)}</td>
                </tr></tfoot>
              </table>
            </div>
            <p style={{ color:"#334155", fontSize:11, marginTop:10, fontFamily:"monospace" }}>N/S = not yet submitted</p>
          </div>
        )}

        {/* ── SUBMISSIONS ── */}
        {!loading && tab === "submissions" && PHARMACIES.map(p => {
          const r = reports[p]; const prev = prevReports[p];
          const w = r && prev ? arrow(r.total_revenue, prev.total_revenue) : null;
          const status = getDeadlineStatus(week, r?.submitted_at);
          return (
            <div key={p} style={{ ...D.card, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:"#f1f5f9", marginBottom:4 }}>{p}</div>
                  {r && <div style={{ fontSize:11, color:"#475569", fontFamily:"monospace" }}>Submitted {new Date(r.submitted_at).toLocaleString("en-GB")}</div>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ padding:"3px 12px", borderRadius:100, fontSize:12, fontFamily:"monospace", background:status.bg, color:status.color, border:`1px solid ${status.color}44` }}>
                    {status.icon} {status.label}
                  </div>
                  {r && <div>
                    <span style={{ color:"#34d399", fontFamily:"monospace", fontWeight:700, fontSize:18 }}>{fmt(r.total_revenue)}</span>
                    {w && <span style={{ marginLeft:10, color:w.color, fontSize:12, fontFamily:"monospace" }}>{w.icon} {w.pct}%</span>}
                  </div>}
                </div>
              </div>
              {r?.notes && <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,255,255,0.02)", borderRadius:8, fontSize:13, color:"#94a3b8", borderLeft:"3px solid rgba(255,255,255,0.08)" }}>{r.notes}</div>}
              {!r && <div style={{ color:"#334155", fontSize:13, marginTop:12 }}>No report submitted yet.</div>}
            </div>
          );
        })}

        {/* ── EMAIL CEO ── */}
        {!loading && tab === "email" && (
          <div style={D.card}>
            <div style={D.cardTitle}>AI-Generated CEO Summary Email</div>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:20, lineHeight:1.6 }}>
              Generate a professional summary from this week's data and send it directly to the CEO.
            </p>

            {/* CEO email field */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#64748b", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>CEO Email Address (optional — pre-fills the To field)</div>
              <input
                type="email"
                placeholder="ceo@yourgroup.co.uk"
                value={ceoEmail}
                onChange={e => setCeoEmail(e.target.value)}
                style={{ width:"100%", maxWidth:360, padding:"10px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#f1f5f9", fontSize:14, outline:"none", fontFamily:"monospace", boxSizing:"border-box" }}
              />
            </div>

            {/* Data summary */}
            <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:"14px 18px", marginBottom:20, border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display:"flex", gap:12, marginBottom:6, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:80 }}>To:</span><span style={{ color:"#94a3b8" }}>{ceoEmail || "CEO"}</span></div>
              <div style={{ display:"flex", gap:12, marginBottom:6, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:80 }}>Subject:</span><span style={{ color:"#94a3b8" }}>Pharmacy Group — Weekly Report w/c {fmtDate(week)}</span></div>
              <div style={{ display:"flex", gap:12, marginBottom:6, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:80 }}>Revenue:</span><span style={{ color:"#94a3b8" }}>{fmt(totalRev)} {wow ? `(${wow.icon} ${wow.pct}% WoW)` : ""}</span></div>
              <div style={{ display:"flex", gap:12, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:80 }}>Compliance:</span><span style={{ color:onTimeCount===PHARMACIES.length?"#34d399":"#f59e0b" }}>{onTimeCount}/{PHARMACIES.length} on time{overdueCount>0?`, ${overdueCount} overdue`:""}</span></div>
            </div>

            {/* Action buttons */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom: emailDraft ? 16 : 0 }}>
              <button style={D.genBtn} onClick={generateEmail} disabled={emailLoading}>
                {emailLoading ? "✨ Generating..." : emailDraft ? "↺ Regenerate" : "✨ Generate Email"}
              </button>
              {emailDraft && <>
                <button style={D.copyBtn} onClick={copyEmail}>{emailCopied ? "✓ Copied!" : "Copy Text"}</button>
                <button style={D.sendBtn} onClick={openInMail}>{autoSent ? "✓ Opened" : ceoEmail ? `Send to CEO →` : "Open in Mail →"}</button>
              </>}
            </div>

            {emailDraft && (
              <textarea
                value={emailDraft}
                onChange={e => setEmailDraft(e.target.value)}
                style={{ width:"100%", padding:"16px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#e2e8f0", fontSize:14, fontFamily:"Georgia,serif", lineHeight:1.7, outline:"none", resize:"vertical", boxSizing:"border-box" }}
                rows={16}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const D = {
  page: { minHeight:"100vh", background:"linear-gradient(160deg,#070d16 0%,#0d1525 50%,#07140f 100%)", fontFamily:"'Segoe UI',system-ui,sans-serif", color:"#f1f5f9" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:16, padding:"32px 32px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)" },
  eyebrow: { fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#34d399", fontFamily:"monospace", marginBottom:8 },
  title: { fontSize:"clamp(20px,3.5vw,32px)", fontWeight:800, margin:0, color:"#f8fafc" },
  green: { color:"#34d399" },
  headerRight: { display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" },
  weekNav: { display:"flex", alignItems:"center", gap:4, border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, overflow:"hidden" },
  navBtn: { width:36, height:36, border:"none", background:"rgba(255,255,255,0.06)", color:"#94a3b8", fontSize:16, cursor:"pointer" },
  weekBox: { padding:"0 12px", textAlign:"center", position:"relative" },
  weekText: { fontSize:13, color:"#f1f5f9", fontFamily:"monospace", whiteSpace:"nowrap" },
  weekPicker: { position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%" },
  refreshBtn: { padding:"8px 16px", borderRadius:8, border:"1px solid rgba(16,185,129,0.25)", background:"rgba(16,185,129,0.08)", color:"#34d399", fontSize:13, cursor:"pointer", fontFamily:"monospace" },
  pdfBtn: { padding:"8px 16px", borderRadius:8, border:"1px solid rgba(96,165,250,0.25)", background:"rgba(96,165,250,0.08)", color:"#60a5fa", fontSize:13, cursor:"pointer", fontFamily:"monospace" },
  kpiStrip: { display:"flex", alignItems:"stretch", borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgba(255,255,255,0.01)", flexWrap:"wrap" },
  kpi: { flex:1, padding:"20px 24px", minWidth:140, borderRight:"1px solid rgba(255,255,255,0.05)" },
  kpiVal: { fontSize:"clamp(16px,2.5vw,22px)", fontWeight:800, color:"#f1f5f9", fontFamily:"monospace", marginBottom:3 },
  kpiSub: { fontSize:11, color:"#94a3b8", marginBottom:4 },
  kpiLabel: { fontSize:10, color:"#cbd5e1", textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"monospace" },
  tabRow: { display:"flex", gap:2, padding:"14px 32px 0", borderBottom:"1px solid rgba(255,255,255,0.06)", flexWrap:"wrap" },
  tab: { padding:"9px 18px", borderRadius:"8px 8px 0 0", border:"none", background:"transparent", color:"#475569", fontSize:13, cursor:"pointer" },
  tabOn: { background:"rgba(16,185,129,0.08)", color:"#34d399", borderBottom:"2px solid #10b981" },
  content: { padding:"24px 32px 60px", maxWidth:1280 },
  loading: { textAlign:"center", color:"#475569", padding:80, fontFamily:"monospace" },
  row2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 },
  card: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"22px 22px 18px", marginBottom:20 },
  cardTitle: { fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"#94a3b8", fontFamily:"monospace", marginBottom:18 },
  tooltip: { background:"#1a2433", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#f1f5f9", fontSize:12 },
  legend: { display:"flex", flexDirection:"column", gap:8, marginTop:14 },
  legendRow: { display:"flex", alignItems:"center", gap:8, fontSize:12 },
  dot: { width:8, height:8, borderRadius:"50%", flexShrink:0 },
  legendName: { flex:1, color:"#cbd5e1" },
  legendVal: { color:"#f1f5f9", fontFamily:"monospace", fontWeight:600 },
  statusGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:12 },
  statusCard: { padding:"14px", borderRadius:12, border:"1px solid" },
  statusDot: { width:8, height:8, borderRadius:"50%", marginBottom:4 },
  statusName: { fontSize:13, color:"#e2e8f0", marginBottom:6, fontWeight:500 },
  statusRev: { fontSize:15, fontFamily:"monospace", fontWeight:700 },
  table: { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th: { padding:"9px 12px", textAlign:"left", fontSize:10, color:"#94a3b8", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", borderBottom:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap" },
  td: { padding:"9px 12px", color:"#e2e8f0", borderBottom:"1px solid rgba(255,255,255,0.04)", verticalAlign:"middle" },
  badge: { padding:"2px 8px", borderRadius:100, fontSize:10, fontFamily:"monospace" },
  genBtn: { padding:"12px 20px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#4f46e5)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" },
  copyBtn: { padding:"11px 20px", borderRadius:10, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"#94a3b8", fontSize:14, cursor:"pointer" },
  sendBtn: { padding:"11px 20px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#10b981,#059669)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" },
};
