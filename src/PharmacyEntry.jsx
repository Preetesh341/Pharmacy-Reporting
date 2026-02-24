import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

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

const CATEGORIES = [...new Set(SERVICES.map(s => s.category))];

const CAT_ICONS = {
  "NHS Clinical": "🏥",
  "Vaccinations": "💉",
  "Private Clinics": "🏪",
  "CPCS": "📋",
};

function getWeekLabel() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().split("T")[0];
}

function fmt(val) {
  return val != null ? `£${Number(val).toFixed(2)}` : "—";
}

function formatWeekDisplay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function PharmacyEntry() {
  const [pharmacy, setPharmacy] = useState("");
  const [week, setWeek] = useState(getWeekLabel());
  const [counts, setCounts] = useState({});
  const [revenues, setRevenues] = useState({});
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [step, setStep] = useState(0);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});

  useEffect(() => {
    const initial = {};
    CATEGORIES.forEach(c => (initial[c] = true));
    setExpandedCats(initial);
  }, []);

  useEffect(() => {
    if (pharmacy && week) checkExisting();
  }, [pharmacy, week]);

  async function checkExisting() {
    try {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("pharmacy", pharmacy)
        .eq("week", week)
        .maybeSingle();

      if (data) {
        setCounts(data.counts || {});
        setRevenues(data.revenues || {});
        setNotes(data.notes || "");
        setAlreadySubmitted(true);
      } else {
        setCounts({});
        setRevenues({});
        setNotes("");
        setAlreadySubmitted(false);
      }
    } catch {
      setCounts({});
      setRevenues({});
      setNotes("");
      setAlreadySubmitted(false);
    }
  }

  function handleCount(id, val) {
    const n = Math.max(0, parseInt(val) || 0);
    setCounts(prev => ({ ...prev, [id]: n }));
  }

  function handleRevenue(id, val) {
    setRevenues(prev => ({ ...prev, [id]: val }));
  }

  function calcRevenue(svc) {
    if (svc.fee === null) return parseFloat(revenues[svc.id]) || 0;
    return (counts[svc.id] || 0) * svc.fee;
  }

  function totalRevenue() {
    return SERVICES.reduce((sum, svc) => sum + calcRevenue(svc), 0);
  }

  function catRevenue(cat) {
    return SERVICES.filter(s => s.category === cat).reduce((sum, s) => sum + calcRevenue(s), 0);
  }

  function totalSessions() {
    return Object.values(counts).reduce((a, b) => a + b, 0);
  }

  function toggleCat(cat) {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  function handlePassword() {
    if (passwordInput === "PharmacyLink") {
      setStep(1);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  }

  async function handleSubmit() {
    if (!pharmacy) return;
    setLoading(true);
    const payload = {
      pharmacy,
      week,
      counts,
      revenues,
      notes,
      submitted_at: new Date().toISOString(),
      total_revenue: totalRevenue(),
      total_sessions: totalSessions(),
    };
    try {
      const { error } = await supabase
        .from("weekly_reports")
        .upsert(payload, { onConflict: "pharmacy,week" });

      if (error) throw error;
      setSubmitted(true);
    } catch (e) {
      alert("Submission failed: " + e.message);
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div style={S.page}>
        <div style={S.successWrap}>
          <div style={S.successRing}>
            <div style={S.successCheck}>✓</div>
          </div>
          <div style={S.successTitle}>Report Submitted</div>
          <div style={S.successPharm}>{pharmacy}</div>
          <div style={S.successWeekLabel}>Week commencing {formatWeekDisplay(week)}</div>
          <div style={S.successStats}>
            <div style={S.successStat}>
              <div style={S.successStatVal}>{fmt(totalRevenue())}</div>
              <div style={S.successStatLabel}>Total Revenue</div>
            </div>
            <div style={S.successStatDiv} />
            <div style={S.successStat}>
              <div style={S.successStatVal}>{totalSessions()}</div>
              <div style={S.successStatLabel}>Total Sessions</div>
            </div>
          </div>
          <button style={S.ghostBtn} onClick={() => { setSubmitted(false); setStep(1); setPharmacy(""); }}>
            ← Submit Another Pharmacy
          </button>
        </div>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div style={S.page}>
        <div style={S.topBar}>
          <span style={S.brand}>⚕ Pharmacy Group</span>
        </div>
        <div style={S.heroSection}>
          <div style={S.heroBadge}>Weekly Service Report</div>
          <h1 style={S.heroTitle}>Welcome 👋</h1>
          <p style={S.heroSub}>Enter your access password to continue</p>
        </div>
        <div style={{ maxWidth:400, margin:"0 auto", padding:"0 20px" }}>
          <div style={S.cardLabel}>Password</div>
          <input
            type="password"
            placeholder="Enter password"
            value={passwordInput}
            onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={e => e.key === "Enter" && handlePassword()}
            style={{ ...S.dateInput, marginBottom: passwordError ? 8 : 20, borderColor: passwordError ? "#f87171" : "rgba(255,255,255,0.1)" }}
            autoFocus
          />
          {passwordError && (
            <div style={{ color:"#f87171", fontSize:13, marginBottom:16, textAlign:"center" }}>
              Incorrect password — please try again
            </div>
          )}
          <button
            style={{ ...S.primaryBtn, ...(passwordInput ? {} : S.primaryBtnOff) }}
            disabled={!passwordInput}
            onClick={handlePassword}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div style={S.page}>
        <div style={S.topBar}>
          <span style={S.brand}>⚕ Pharmacy Group</span>
          <span style={S.topWeek}>Week of {formatWeekDisplay(week)}</span>
        </div>
        <div style={S.heroSection}>
          <div style={S.heroBadge}>Weekly Service Report</div>
          <h1 style={S.heroTitle}>Good morning 👋</h1>
          <p style={S.heroSub}>Select your pharmacy and complete this week's service log</p>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Week Commencing</div>
          <input type="date" value={week} onChange={e => setWeek(e.target.value)} style={S.dateInput} />
          <div style={S.cardLabel}>Your Pharmacy</div>
          <div style={S.pharmGrid}>
            {PHARMACIES.map(p => (
              <button
                key={p}
                style={{ ...S.pharmBtn, ...(pharmacy === p ? S.pharmBtnOn : {}) }}
                onClick={() => setPharmacy(p)}
              >
                <div style={{ ...S.pharmIndicator, background: pharmacy === p ? "#10b981" : "rgba(255,255,255,0.08)" }} />
                <span style={S.pharmName}>{p}</span>
                {pharmacy === p && <span style={S.pharmCheck}>✓</span>}
              </button>
            ))}
          </div>
          <button
            style={{ ...S.primaryBtn, ...(pharmacy ? {} : S.primaryBtnOff) }}
            disabled={!pharmacy}
            onClick={() => setStep(2)}
          >
            Start Report for {pharmacy || "..."} →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        <button style={S.backLink} onClick={() => setStep(1)}>← Back</button>
        <span style={S.brand}>{pharmacy}</span>
        <span style={S.topWeek}>Wk {formatWeekDisplay(week)}</span>
      </div>

      {alreadySubmitted && (
        <div style={S.warnBanner}>
          ⚠ This pharmacy already submitted for this week — you can update and resubmit below.
        </div>
      )}

      <div style={S.liveTotals}>
        <div style={S.liveItem}>
          <div style={S.liveVal}>{fmt(totalRevenue())}</div>
          <div style={S.liveLabel}>Revenue this week</div>
        </div>
        <div style={S.liveDivider} />
        <div style={S.liveItem}>
          <div style={S.liveVal}>{totalSessions()}</div>
          <div style={S.liveLabel}>Total sessions</div>
        </div>
        <div style={S.liveDivider} />
        <div style={S.liveItem}>
          <div style={S.liveVal}>{SERVICES.filter(s => (counts[s.id] || 0) > 0 || revenues[s.id]).length}</div>
          <div style={S.liveLabel}>Active services</div>
        </div>
      </div>

      <div style={S.formArea}>
        {CATEGORIES.map(cat => {
          const catSvcs = SERVICES.filter(s => s.category === cat);
          const rev = catRevenue(cat);
          const isOpen = expandedCats[cat] !== false;
          return (
            <div key={cat} style={S.catBlock}>
              <button style={S.catHead} onClick={() => toggleCat(cat)}>
                <div style={S.catLeft}>
                  <span style={S.catIcon}>{CAT_ICONS[cat]}</span>
                  <span style={S.catName}>{cat}</span>
                  {rev > 0 && <span style={S.catRevBadge}>{fmt(rev)}</span>}
                </div>
                <span style={S.catChevron}>{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div>
                  {catSvcs.map(svc => (
                    <div key={svc.id} style={S.svcRow}>
                      <div style={S.svcInfo}>
                        <div style={S.svcName}>{svc.label}</div>
                        <div style={S.svcFee}>{svc.fee != null ? fmt(svc.fee) + " per session" : "Enter total revenue"}</div>
                      </div>
                      <div style={S.svcControls}>
                        {svc.fee === null ? (
                          <div style={S.revenueWrap}>
                            <span style={S.poundSign}>£</span>
                            <input
                              type="number" min="0" step="0.01" placeholder="0.00"
                              value={revenues[svc.id] || ""}
                              onChange={e => handleRevenue(svc.id, e.target.value)}
                              style={S.revenueInput}
                            />
                          </div>
                        ) : (
                          <div style={S.counter}>
                            <button style={S.counterBtn} onClick={() => handleCount(svc.id, (counts[svc.id] || 0) - 1)}>−</button>
                            <input
                              type="number" min="0"
                              value={counts[svc.id] || 0}
                              onChange={e => handleCount(svc.id, e.target.value)}
                              style={S.counterInput}
                            />
                            <button style={S.counterBtn} onClick={() => handleCount(svc.id, (counts[svc.id] || 0) + 1)}>+</button>
                          </div>
                        )}
                        <div style={{ ...S.svcRev, color: calcRevenue(svc) > 0 ? "#34d399" : "#334155" }}>
                          {fmt(calcRevenue(svc))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div style={S.notesCard}>
          <div style={S.cardLabel}>Notes / Issues this week (optional)</div>
          <textarea
            style={S.textarea}
            placeholder="Staffing issues, system outages, unusually high/low activity..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div style={S.totalRow}>
          <div>
            <div style={S.totalLabel}>Total Weekly Revenue</div>
            <div style={S.totalSub}>{totalSessions()} sessions across {SERVICES.filter(s => (counts[s.id] || 0) > 0 || revenues[s.id]).length} services</div>
          </div>
          <div style={S.totalVal}>{fmt(totalRevenue())}</div>
        </div>

        <button style={S.submitBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? "Submitting..." : alreadySubmitted ? "✓ Update Submission" : "Submit Weekly Report →"}
        </button>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100vh", background: "linear-gradient(160deg, #0c1520 0%, #111827 55%, #0a1f15 100%)", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#f1f5f9", paddingBottom: 60 },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 10 },
  brand: { fontSize: 14, fontWeight: 600, color: "#34d399" },
  topWeek: { fontSize: 12, color: "#475569", fontFamily: "monospace" },
  backLink: { background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", padding: 0 },
  heroSection: { padding: "48px 24px 32px", textAlign: "center", maxWidth: 480, margin: "0 auto" },
  heroBadge: { display: "inline-block", padding: "4px 14px", borderRadius: 100, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 },
  heroTitle: { fontSize: "clamp(26px,5vw,38px)", fontWeight: 700, margin: "0 0 10px", color: "#f8fafc" },
  heroSub: { fontSize: 15, color: "#64748b", margin: 0 },
  card: { maxWidth: 520, margin: "0 auto", padding: "0 20px" },
  cardLabel: { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", marginBottom: 10, marginTop: 24, fontFamily: "monospace" },
  dateInput: { width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", fontSize: 15, outline: "none", boxSizing: "border-box" },
  pharmGrid: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 },
  pharmBtn: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "#94a3b8", fontSize: 14, cursor: "pointer", textAlign: "left" },
  pharmBtnOn: { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)", color: "#f1f5f9" },
  pharmIndicator: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  pharmName: { flex: 1, fontWeight: 500 },
  pharmCheck: { color: "#34d399", fontSize: 14 },
  primaryBtn: { width: "100%", padding: "15px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(16,185,129,0.3)" },
  primaryBtnOff: { opacity: 0.35, cursor: "not-allowed", boxShadow: "none" },
  warnBanner: { margin: "16px auto 0", maxWidth: 680, padding: "12px 18px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, color: "#fbbf24", fontSize: 13, textAlign: "center" },
  liveTotals: { display: "flex", margin: "20px auto 0", maxWidth: 680, padding: "0 20px" },
  liveItem: { flex: 1, padding: "16px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, textAlign: "center" },
  liveVal: { fontSize: 20, fontWeight: 700, color: "#34d399", fontFamily: "monospace", marginBottom: 3 },
  liveLabel: { fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" },
  liveDivider: { width: 10 },
  formArea: { maxWidth: 680, margin: "20px auto 0", padding: "0 20px" },
  catBlock: { marginBottom: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", background: "rgba(255,255,255,0.02)" },
  catHead: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "none", cursor: "pointer", color: "#f1f5f9", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  catLeft: { display: "flex", alignItems: "center", gap: 10 },
  catIcon: { fontSize: 16 },
  catName: { fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" },
  catRevBadge: { padding: "2px 10px", borderRadius: 100, background: "rgba(16,185,129,0.15)", color: "#34d399", fontSize: 12, fontFamily: "monospace", fontWeight: 600 },
  catChevron: { color: "#475569", fontSize: 11 },
  svcRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 16, flexWrap: "wrap" },
  svcInfo: { flex: 1, minWidth: 150 },
  svcName: { fontSize: 14, color: "#e2e8f0", marginBottom: 2 },
  svcFee: { fontSize: 11, color: "#475569", fontFamily: "monospace" },
  svcControls: { display: "flex", alignItems: "center", gap: 14 },
  counter: { display: "flex", alignItems: "center", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" },
  counterBtn: { width: 34, height: 34, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 18, cursor: "pointer", lineHeight: 1, flexShrink: 0 },
  counterInput: { width: 44, height: 34, border: "none", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", fontSize: 14, textAlign: "center", outline: "none" },
  revenueWrap: { display: "flex", alignItems: "center", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0 10px", gap: 4, height: 34 },
  poundSign: { color: "#64748b", fontSize: 13 },
  revenueInput: { width: 76, border: "none", background: "transparent", color: "#f1f5f9", fontSize: 14, outline: "none" },
  svcRev: { width: 76, textAlign: "right", fontSize: 13, fontFamily: "monospace", fontWeight: 600 },
  notesCard: { marginTop: 16, marginBottom: 16 },
  textarea: { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  totalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px", background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.07))", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, marginBottom: 16 },
  totalLabel: { fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 },
  totalSub: { fontSize: 12, color: "#475569", fontFamily: "monospace" },
  totalVal: { fontSize: 28, fontWeight: 800, color: "#34d399", fontFamily: "monospace" },
  submitBtn: { width: "100%", padding: "16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(16,185,129,0.3)" },
  ghostBtn: { padding: "12px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748b", fontSize: 14, cursor: "pointer", marginTop: 8 },
  successWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" },
  successRing: { width: 80, height: 80, borderRadius: "50%", border: "3px solid #10b981", background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 0 40px rgba(16,185,129,0.2)" },
  successCheck: { fontSize: 32, color: "#34d399" },
  successTitle: { fontSize: 28, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 },
  successPharm: { fontSize: 18, color: "#34d399", fontWeight: 600, marginBottom: 4 },
  successWeekLabel: { fontSize: 13, color: "#475569", fontFamily: "monospace", marginBottom: 36 },
  successStats: { display: "flex", alignItems: "center", gap: 32, padding: "24px 36px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, marginBottom: 32 },
  successStat: { textAlign: "center" },
  successStatVal: { fontSize: 26, fontWeight: 800, color: "#f1f5f9", fontFamily: "monospace" },
  successStatLabel: { fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 },
  successStatDiv: { width: 1, height: 40, background: "rgba(255,255,255,0.07)" },
};
