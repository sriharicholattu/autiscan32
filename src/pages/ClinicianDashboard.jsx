import React from 'react'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function ClinicianDashboard() {
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState('patients')
  const [patients, setPatients] = useState([])
  const [reports, setReports] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [conclusion, setConclusion] = useState('')
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    if (!profile?.clinician_id) return
    const { data: p } = await supabase.from('patients').select('*').eq('clinician_id', profile.clinician_id)
    setPatients(p || [])
    const { data: r } = await supabase.from('reports').select('*').eq('clinician_id', profile.clinician_id).order('created_at', { ascending: false })
    setReports(r || [])
  }

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function openReport(patient) {
    const r = reports.filter(r => r.patient_id === patient.patient_id).slice(-1)[0]
    setSelectedReport({ patient, report: r })
    setConclusion(r?.conclusion || '')
    setNotes(r?.notes || '')
  }

  async function saveConclusion() {
    if (!selectedReport?.report) return
    setSaving(true)
    await supabase.from('reports').update({ conclusion, notes, reviewed: true }).eq('id', selectedReport.report.id)
    await supabase.from('patients').update({ last_conclusion: conclusion }).eq('patient_id', selectedReport.patient.patient_id)
    setSaving(false)
    setSelectedReport(null)
    await loadData()
    notify('Conclusion saved ✓')
  }

  const statusBadge = (p) => {
    const r = reports.filter(r => r.patient_id === p.patient_id).slice(-1)[0]
    if (!r) return <span className="badge badge-amber">No Session</span>
    if (r.conclusion) return <span className="badge badge-green">Reviewed</span>
    return <span className="badge badge-purple">Pending Review</span>
  }

  const TABS = [{ key:'patients',label:'🧒 My Patients' }, { key:'reports',label:'📋 Reports' }, { key:'profile',label:'👤 Profile' }]

  return (
    <div style={{minHeight:'100vh'}}>
      <div className="topbar">
        <div className="logo">Auti<span>Scan</span></div>
        <div className="topbar-right">
          <span className="role-badge">👨‍⚕️ Clinician</span>
          <span style={{fontWeight:700,color:'var(--mid)'}}>{profile?.name}</span>
          <span style={{fontSize:'.8rem',color:'var(--muted)',fontFamily:'monospace'}}>{profile?.clinician_id}</span>
          <button className="btn btn-danger btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div className="dashboard-layout">
        <div className="sidebar">
          <ul className="sidebar-menu">
            {TABS.map(t => <li key={t.key}><button className={`sidebar-item ${tab===t.key?'active':''}`} onClick={()=>setTab(t.key)}>{t.label}</button></li>)}
          </ul>
          <div style={{marginTop:24,padding:'14px 16px',background:'var(--teal-pale)',borderRadius:'var(--radius-sm)'}}>
            <div style={{fontSize:'.75rem',color:'var(--muted)',fontWeight:700}}>YOUR CLINICIAN ID</div>
            <div style={{fontFamily:'monospace',fontSize:'1.1rem',color:'var(--teal)',fontWeight:800,marginTop:4}}>{profile?.clinician_id}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:4}}>Share with patients to register</div>
          </div>
        </div>

        <div className="main-content">
          {tab === 'patients' && <>
            <div className="page-header">
              <h2>My Patients</h2>
              <p>Children registered under your clinician ID <strong>{profile?.clinician_id}</strong></p>
            </div>
            <div className="card">
              {patients.length === 0
                ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>
                    <div style={{fontSize:'2rem',marginBottom:12}}>🧒</div>
                    <p>No patients registered yet.</p>
                    <p style={{fontSize:'.87rem',marginTop:6}}>Share your Clinician ID <strong>{profile?.clinician_id}</strong> with patients to register.</p>
                  </div>
                : <div className="table-wrap">
                    <table>
                      <thead><tr><th>Patient</th><th>Age</th><th>Sessions</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {patients.map(p => {
                          const age = p.dob ? Math.floor((Date.now()-new Date(p.dob))/(1000*60*60*24*365.25)) : '—'
                          return (
                            <tr key={p.patient_id}>
                              <td><strong>{p.name}</strong><br/><span style={{fontSize:'.78rem',color:'var(--muted)',fontFamily:'monospace'}}>{p.patient_id}</span></td>
                              <td>{age !== '—' ? age + ' yrs' : '—'}</td>
                              <td>{p.sessions || 0}</td>
                              <td>{statusBadge(p)}</td>
                              <td><button className="btn btn-sm btn-outline" onClick={()=>openReport(p)}>View Report</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          </>}

          {tab === 'reports' && <>
            <div className="page-header"><h2>All Reports</h2><p>Assessment reports submitted by your patients.</p></div>
            <div className="card">
              {reports.length === 0
                ? <p style={{color:'var(--muted)'}}>No reports submitted yet.</p>
                : <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {reports.map(r => {
                      const p = patients.find(pt => pt.patient_id === r.patient_id)
                      return (
                        <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'var(--bg)',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)'}}>
                          <div>
                            <strong>{p?.name || r.patient_id}</strong>
                            <span style={{color:'var(--muted)',fontSize:'.85rem'}}> · Session {r.session_no} · {new Date(r.created_at).toLocaleDateString('en-IN')}</span>
                            {r.conclusion && <span className="badge badge-green" style={{marginLeft:8}}>{r.conclusion}</span>}
                          </div>
                          <button className="btn btn-sm btn-outline" onClick={()=>openReport(p)}>Review</button>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          </>}

          {tab === 'profile' && <>
            <div className="page-header"><h2>My Profile</h2></div>
            <div className="card">
              <div className="form-row">
                <div className="form-group"><label>Full Name</label><input className="form-control" defaultValue={profile?.name} readOnly style={{background:'var(--bg)'}}/></div>
                <div className="form-group"><label>Specialization</label><input className="form-control" defaultValue={profile?.specialization} readOnly style={{background:'var(--bg)'}}/></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Email</label><input className="form-control" defaultValue={profile?.email} readOnly style={{background:'var(--bg)'}}/></div>
                <div className="form-group"><label>Clinician ID</label><input className="form-control" defaultValue={profile?.clinician_id} readOnly style={{background:'var(--bg)',fontFamily:'monospace'}}/></div>
              </div>
              <div className="form-group"><label>Clinic ID</label><input className="form-control" defaultValue={profile?.clinic_id} readOnly style={{background:'var(--bg)',fontFamily:'monospace'}}/></div>
            </div>
          </>}
        </div>
      </div>

      {/* Report Modal */}
      {selectedReport && (
        <div className="modal-bg" onClick={e => e.target===e.currentTarget && setSelectedReport(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:'1.5rem'}}>{selectedReport.patient.name} — Report</h2>
                <p style={{color:'var(--muted)',fontSize:'.87rem',marginTop:4}}>
                  Session {selectedReport.report?.session_no || '—'} · {selectedReport.report ? new Date(selectedReport.report.created_at).toLocaleDateString('en-IN') : 'No data yet'}
                </p>
              </div>
              <button className="modal-close" onClick={()=>setSelectedReport(null)}>✕</button>
            </div>

            {selectedReport.report ? <>
              {/* AI Scores */}
              <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:12}}>AI Behavioral Assessment</div>
              <div className="scores-grid">
                {[['Eye Contact',selectedReport.report.score_eye],['Body Movement',selectedReport.report.score_move],['Facial Expr.',selectedReport.report.score_face],['Voice Resp.',selectedReport.report.score_voice],['Reaction Time',selectedReport.report.score_react]].map(([label,val])=>{
                  const v = val||0
                  const cls = v>75?'sc-low':v>55?'sc-med':'sc-high'
                  return <div key={label} className="score-item"><div className={`score-circle ${cls}`}>{v}%</div><div className="score-label">{label}</div></div>
                })}
              </div>
              {/* Game bars */}
              <div style={{marginTop:16,marginBottom:16}}>
                {[['🫧 Bubble Pop','teal',selectedReport.report.score_bubble],['🐾 Follow Animal','blue',selectedReport.report.score_animal],['🎮 Simon Says','purple',selectedReport.report.score_simon],['🎨 Color Match','amber',selectedReport.report.score_color],['🔊 Sound Repeat','coral',selectedReport.report.score_sound]].map(([label,color,val])=>(
                  <div key={label} className="param-bar">
                    <div className="param-bar-label"><span>{label}</span><span>{val||0}%</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{width:(val||0)+'%',background:`var(--${color})`}}></div></div>
                  </div>
                ))}
              </div>
              {/* AI summary */}
              <div style={{background:'var(--teal-pale)',borderRadius:'var(--radius-sm)',padding:16,fontSize:'.9rem',lineHeight:1.7,color:'var(--mid)',marginBottom:16}}>
                {selectedReport.report.ai_summary || 'AI summary will be generated after full assessment completion.'}
              </div>
            </> : <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:24,textAlign:'center',color:'var(--muted)',marginBottom:16}}>No assessment data yet. Patient has not completed a session.</div>}

            {/* Conclusion */}
            <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:12}}>Clinical Conclusion</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              {['No Indicators','Monitor','Mild Concern','Refer Specialist'].map(c=>(
                <button key={c} className={`concl-btn ${conclusion===c?'selected':''}`} onClick={()=>setConclusion(c)}>{c}</button>
              ))}
            </div>
            <div className="form-group">
              <label>Clinical Notes</label>
              <textarea className="form-control" rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add your observations and recommendations..."/>
            </div>
            <div style={{display:'flex',gap:12}}>
              <button className="btn btn-primary" onClick={saveConclusion} disabled={saving||!conclusion}>{saving?'Saving...':'💾 Save Conclusion'}</button>
              <button className="btn btn-outline" onClick={()=>setSelectedReport(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
