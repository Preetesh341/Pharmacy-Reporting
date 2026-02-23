import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
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

export default function CEODashboard() {
  const [week, setWeek] = useState(getWeekLabel());
  const [reports, setReports] = useState({});
  const [prevReports, setPrevReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

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
    setLoading(false);
  }

  const submitted = Object.keys(reports).length;
  const totalRev = Object.values(reports).reduce((s, r) => s + (r.total_revenue || 0), 0);
  const prevTotalRev = Object.values(prevReports).reduce((s, r) => s + (r.total_revenue || 0), 0);
  const totalSessions = Object.values(reports).reduce((s, r) => s + (r.total_sessions || 0), 0);
  const prevTotalSessions = Object.values(prevReports).reduce((s, r) => s + (r.total_sessions || 0), 0);
  const wow = arrow(totalRev, prevTotalRev);
  const wowSess = arrow(totalSessions, prevTotalSessions);

  const pharmChartData = PHARMACIES.map(p => ({
    name: p.replace(" Pharmacy", ""),
    revenue: reports[p]?.total_revenue || 0,
    prevRevenue: prevReports[p]?.total_revenue || 0,
    submitted: !!reports[p],
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

  async function generateEmail() {
    setEmailLoading(true);
    const summaryData = {
      week: fmtDate(week),
      totalRevenue: fmt(totalRev),
      wowChange: wow ? `${wow.icon} ${wow.pct}% vs prior week` : "No prior week data",
      submitted: `${submitted}/${PHARMACIES.length}`,
      pharmacies: PHARMACIES.map(p => ({ name: p, revenue: reports[p] ? fmt(reports[p].total_revenue) : "Not submitted", submitted: !!reports[p] })),
      topServices: svcTotals.slice(0, 5).map(s => ({ name: s.label, revenue: fmt(s.rev), count: s.count })),
    };
    const prompt = `You are a pharmacy group operations analyst. Write a professional, concise weekly performance summary email to the CEO of a UK independent pharmacy chain.
Use this data: ${JSON.stringify(summaryData, null, 2)}
The email should: open with a warm professional greeting, lead with headline numbers, call out top-performing site, note any sites that haven't submitted, highlight top 2-3 services, end positively. Use British English. Under 300 words. Plain text, no markdown. Sign off as "Operations Team".`;
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
  function openMailto() { window.open(`mailto:?subject=${encodeURIComponent(`Pharmacy Group — Weekly Report w/c ${fmtDate(week)}`)}&body=${encodeURIComponent(emailDraft)}`); }

  const TABS = ["overview","services","pharmacies","submissions","email"];

  return (
    <div style={D.page}>
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
        </div>
      </div>

      <div style={D.kpiStrip}>
        {[
          { label: "Total Revenue", value: fmt(totalRev), wow, sub: `${submitted}/${PHARMACIES.length} sites submitted` },
          { label: "Total Sessions", value: totalSessions, wow: wowSess, sub: "across all sites" },
          { label: "Avg per Site", value: submitted > 0 ? fmt(totalRev / submitted) : "£0.00", sub: "submitted sites only" },
          { label: "Top Site", value: [...pharmChartData].sort((a,b)=>b.revenue-a.revenue)[0]?.name || "—", color: "#a78bfa", sub: fmt([...pharmChartData].sort((a,b)=>b.revenue-a.revenue)[0]?.revenue || 0) },
          { label: "Submission Rate", value: `${Math.round((submitted/PHARMACIES.length)*100)}%`, color: submitted===PHARMACIES.length?"#34d399":"#f59e0b", sub: `${PHARMACIES.length-submitted} pending` },
        ].map((k, i) => (
          <div key={i} style={D.kpi}>
            <div style={{ ...D.kpiVal, ...(k.color ? { color: k.color } : {}) }}>{k.value}</div>
            {k.wow && <div style={{ color: k.wow.color, fontSize: 11, fontFamily: "monospace", marginBottom: 2 }}>{k.wow.icon} {k.wow.pct}% week-on-week</div>}
            <div style={D.kpiSub}>{k.sub}</div>
            <div style={D.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={D.tabRow}>
        {TABS.map(t => (
          <button key={t} style={{ ...D.tab, ...(tab===t?D.tabOn:{}) }} onClick={() => setTab(t)}>
            {t === "email" ? "✉ Email CEO" : t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={D.content}>
        {loading && <div style={D.loading}>Loading reports for {fmtDate(week)}...</div>}

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
            <div style={D.card}>
              <div style={D.cardTitle}>Site Submission Status</div>
              <div style={D.statusGrid}>
                {PHARMACIES.map(p => {
                  const r = reports[p]; const prev = prevReports[p];
                  const w = r && prev ? arrow(r.total_revenue, prev.total_revenue) : null;
                  return (
                    <div key={p} style={{ ...D.statusCard, ...(r?D.statusOn:D.statusOff) }}>
                      <div style={{ ...D.statusDot, background: r?"#10b981":"#334155" }} />
                      <div style={D.statusName}>{p}</div>
                      <div style={D.statusRev}>{r ? fmt(r.total_revenue) : "Not submitted"}</div>
                      {w && <div style={{ fontSize: 11, color: w.color, fontFamily: "monospace", marginTop: 2 }}>{w.icon} {w.pct}% vs last wk</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!loading && tab === "services" && (
          <div style={D.card}>
            <div style={D.cardTitle}>Group Service Breakdown</div>
            <div style={{ overflowX: "auto" }}>
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

        {!loading && tab === "submissions" && PHARMACIES.map(p => {
          const r = reports[p]; const prev = prevReports[p];
          const w = r && prev ? arrow(r.total_revenue, prev.total_revenue) : null;
          return (
            <div key={p} style={{ ...D.card, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:"#f1f5f9", marginBottom:4 }}>{p}</div>
                  {r && <div style={{ fontSize:11, color:"#475569", fontFamily:"monospace" }}>Submitted {new Date(r.submitted_at).toLocaleString("en-GB")}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ display:"inline-block", padding:"3px 12px", borderRadius:100, fontSize:12, fontFamily:"monospace", ...(r?{background:"rgba(16,185,129,0.12)",color:"#34d399"}:{background:"rgba(255,255,255,0.04)",color:"#475569"}) }}>
                    {r?"✓ Submitted":"○ Pending"}
                  </div>
                  {r && <div style={{ marginTop:6 }}>
                    <span style={{ color:"#34d399", fontFamily:"monospace", fontWeight:700, fontSize:18 }}>{fmt(r.total_revenue)}</span>
                    {w && <span style={{ marginLeft:10, color:w.color, fontSize:12, fontFamily:"monospace" }}>{w.icon} {w.pct}%</span>}
                  </div>}
                </div>
              </div>
              {r?.notes && <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,255,255,0.02)", borderRadius:8, fontSize:13, color:"#94a3b8", borderLeft:"3px solid rgba(255,255,255,0.08)" }}>{r.notes}</div>}
              {!r && <div style={{ color:"#334155", fontSize:13, marginTop:12 }}>No report submitted for this week yet.</div>}
            </div>
          );
        })}

        {!loading && tab === "email" && (
          <div style={D.card}>
            <div style={D.cardTitle}>AI-Generated CEO Summary Email</div>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:20, lineHeight:1.6 }}>Generate a professional summary email based on this week's data, then copy or open directly in your mail app.</p>
            <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:"14px 18px", marginBottom:20, border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display:"flex", gap:12, marginBottom:6, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:60 }}>To:</span><span style={{ color:"#94a3b8" }}>CEO</span></div>
              <div style={{ display:"flex", gap:12, marginBottom:6, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:60 }}>Subject:</span><span style={{ color:"#94a3b8" }}>Pharmacy Group — Weekly Performance Report w/c {fmtDate(week)}</span></div>
              <div style={{ display:"flex", gap:12, fontSize:13 }}><span style={{ color:"#475569", fontFamily:"monospace", fontSize:11, minWidth:60 }}>Data:</span><span style={{ color:"#94a3b8" }}>{submitted}/{PHARMACIES.length} sites · {fmt(totalRev)} total · {totalSessions} sessions</span></div>
            </div>
            {!emailDraft && <button style={D.genBtn} onClick={generateEmail} disabled={emailLoading}>{emailLoading?"✨ Generating...":"✨ Generate Email with AI"}</button>}
            {emailDraft && <div>
              <textarea value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} style={{ width:"100%", padding:"16px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#e2e8f0", fontSize:14, fontFamily:"Georgia,serif", lineHeight:1.7, outline:"none", resize:"vertical", boxSizing:"border-box", marginBottom:14 }} rows={18} />
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button style={D.genBtn} onClick={generateEmail} disabled={emailLoading}>{emailLoading?"Regenerating...":"↺ Regenerate"}</button>
                <button style={{ padding:"11px 22px", borderRadius:10, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"#94a3b8", fontSize:14, cursor:"pointer" }} onClick={copyEmail}>{emailCopied?"✓ Copied!":"Copy Text"}</button>
                <button style={{ padding:"11px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#10b981,#059669)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }} onClick={openMailto}>Open in Mail App →</button>
              </div>
            </div>}
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
  kpiStrip: { display:"flex", alignItems:"stretch", borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgba(255,255,255,0.01)", flexWrap:"wrap" },
  kpi: { flex:1, padding:"20px 24px", minWidth:140, borderRight:"1px solid rgba(255,255,255,0.05)" },
  kpiVal: { fontSize:"clamp(16px,2.5vw,22px)", fontWeight:800, color:"#f1f5f9", fontFamily:"monospace", marginBottom:3 },
  kpiSub: { fontSize:11, color:"#334155", marginBottom:4 },
  kpiLabel: { fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"monospace" },
  tabRow: { display:"flex", gap:2, padding:"14px 32px 0", borderBottom:"1px solid rgba(255,255,255,0.06)", flexWrap:"wrap" },
  tab: { padding:"9px 18px", borderRadius:"8px 8px 0 0", border:"none", background:"transparent", color:"#475569", fontSize:13, cursor:"pointer" },
  tabOn: { background:"rgba(16,185,129,0.08)", color:"#34d399", borderBottom:"2px solid #10b981" },
  content: { padding:"24px 32px 60px", maxWidth:1280 },
  loading: { textAlign:"center", color:"#475569", padding:80, fontFamily:"monospace" },
  row2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 },
  card: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"22px 22px 18px", marginBottom:20 },
  cardTitle: { fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"#64748b", fontFamily:"monospace", marginBottom:18 },
  tooltip: { background:"#1a2433", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#f1f5f9", fontSize:12 },
  legend: { display:"flex", flexDirection:"column", gap:8, marginTop:14 },
  legendRow: { display:"flex", alignItems:"center", gap:8, fontSize:12 },
  dot: { width:8, height:8, borderRadius:"50%", flexShrink:0 },
  legendName: { flex:1, color:"#94a3b8" },
  legendVal: { color:"#f1f5f9", fontFamily:"monospace", fontWeight:600 },
  statusGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:12 },
  statusCard: { padding:"16px 14px", borderRadius:12, border:"1px solid" },
  statusOn: { background:"rgba(16,185,129,0.07)", borderColor:"rgba(16,185,129,0.2)" },
  statusOff: { background:"rgba(255,255,255,0.02)", borderColor:"rgba(255,255,255,0.06)" },
  statusDot: { width:8, height:8, borderRadius:"50%", marginBottom:10 },
  statusName: { fontSize:13, color:"#94a3b8", marginBottom:6, fontWeight:500 },
  statusRev: { fontSize:15, fontFamily:"monospace", color:"#34d399", fontWeight:700 },
  table: { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th: { padding:"9px 12px", textAlign:"left", fontSize:10, color:"#475569", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", borderBottom:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap" },
  td: { padding:"9px 12px", color:"#cbd5e1", borderBottom:"1px solid rgba(255,255,255,0.04)", verticalAlign:"middle" },
  badge: { padding:"2px 8px", borderRadius:100, fontSize:10, fontFamily:"monospace" },
  genBtn: { padding:"12px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#4f46e5)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", marginRight:10, marginBottom:10 },
};
