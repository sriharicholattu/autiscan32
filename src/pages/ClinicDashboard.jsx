import React from 'react'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { PLANS, openRazorpayCheckout } from '../lib/razorpay'
import { isTrialActive, trialDaysLeft } from '../lib/referral'

export default function ClinicDashboard() {
  const { profile, signOut, fetchProfile, session } = useAuth()
  const [tab, setTab] = useState('overview')
  const [clinicians, setClinicians] = useState([])
  const [patients, setPatients] = useState([])
  const [period, setPeriod] = useState('monthly')
  const [toast, setToast] = useState(null)
  const [settings, setSettings] = useState({ clinic_name: '', phone: '', city: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [profile])
  useEffect(() => { if (profile) setSettings({ clinic_name: profile.clinic_name || '', phone: profile.phone || '', city: profile.city || '' }) }, [profile])

  async function loadData() {
    if (!profile?.clinic_id) return
    const { data: c } = await supabase.from('clinicians').select('*').eq('clinic_id', profile.clinic_id)
    setClinicians(c || [])
    if (c?.length) {
      const ids = c.map(x => x.clinician_id)
      const { data: p } = await supabase.from('patients').select('*').in('clinician_id', ids)
      setPatients(p || [])
    }
  }

  function notify(msg, type='') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function copyClinicId() {
    await navigator.clipboard.writeText(profile.clinic_id).catch(() => {})
    notify('Clinic ID copied: ' + profile.clinic_id)
  }

  async function handlePayment(planKey) {
    await openRazorpayCheckout({
      planKey, period,
      clinicName: profile.clinic_name,
      email: profile.email,
      onSuccess: async ({ paymentId, plan, period: p, amount }) => {
        await supabase.from('clinics').update({ plan, plan_period: p, subscription_active: true, last_payment_id: paymentId, last_payment_amount: amount }).eq('clinic_id', profile.clinic_id)
        await supabase.from('payments').insert({ clinic_id: profile.clinic_id, payment_id: paymentId, plan, period: p, amount, status: 'success' })
        await fetchProfile(session.user.id)
        notify('Payment successful! Plan activated 🎉', 'success')
      }
    })
  }

  async function saveSettings() {
    setSaving(true)
    await supabase.from('clinics').update(settings).eq('clinic_id', profile.clinic_id)
    await fetchProfile(session.user.id)
    setSaving(false)
    notify('Settings saved ✓')
  }

  const pendingReports = patients.filter(p => p.sessions > 0 && !p.last_conclusion).length

  const TABS = [
    { key:'overview', label:'📊 Overview' },
    { key:'plans', label:'💳 Plans' },
    { key:'clinicians', label:'👨‍⚕️ Clinicians' },
    { key:'settings', label:'⚙️ Settings' },
  ]

  return (
    <div style={{minHeight:'100vh'}}>
      {/* Topbar */}
      <div className="topbar">
        <div className="logo">Auti<span>Scan</span></div>
        <div className="topbar-right">
          <span className="role-badge">🏥 Clinic</span>
          <span style={{fontWeight:700,color:'var(--mid)'}}>{profile?.clinic_name}</span>
          {profile?.subscription_active && <span style={{background:'var(--teal)',color:'white',padding:'3px 10px',borderRadius:20,fontSize:'.75rem',fontWeight:700}}>{profile.plan?.toUpperCase()} ✓</span>}
          <button className="btn btn-danger btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <ul className="sidebar-menu">
            {TABS.map(t => <li key={t.key}><button className={`sidebar-item ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button></li>)}
          </ul>
        </div>

        <div className="main-content">
          {/* OVERVIEW */}
          {tab === 'overview' && <>
            <div className="page-header">
              <h2>Clinic Overview</h2>
              <p>Welcome back! Here's a live summary of your clinic activity.</p>
            </div>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-label">Total Patients</div><div className="stat-value">{patients.length}</div><div className="stat-sub">Registered</div></div>
              <div className="stat-card"><div className="stat-label">Clinicians</div><div className="stat-value">{clinicians.length}</div><div className="stat-sub">Under your clinic</div></div>
              <div className="stat-card"><div className="stat-label">Sessions</div><div className="stat-value">{patients.reduce((a,p)=>a+(p.sessions||0),0)}</div><div className="stat-sub">Total completed</div></div>
              <div className="stat-card"><div className="stat-label">Reports Pending</div><div className="stat-value" style={{color:'var(--amber)'}}>{pendingReports}</div><div className="stat-sub">Awaiting review</div></div>
            </div>
            <div className="clinic-id-box">
              <div>
                <div style={{fontSize:'.9rem',opacity:.8}}>Your Clinic ID — Share with clinicians to register</div>
                <div className="clinic-id-value">{profile?.clinic_id}</div>
              </div>
              <button onClick={copyClinicId} style={{background:'rgba(255,255,255,.2)',border:'1.5px solid rgba(255,255,255,.4)',color:'white',padding:'10px 20px',borderRadius:10,cursor:'pointer',fontWeight:700,fontFamily:'Nunito,sans-serif'}}>📋 Copy ID</button>
            </div>
            {/* Trial active banner */}
            {profile?.trial_expires_at && isTrialActive(profile.trial_expires_at) && (
              <div style={{marginTop:20,background:'#d1fae5',borderRadius:'var(--radius)',padding:20,border:'1.5px solid #6ee7b7',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <span style={{fontSize:'2rem'}}>🎁</span>
                  <div>
                    <div style={{fontWeight:800,color:'#065f46'}}>Free Trial Active — {profile.plan?.charAt(0).toUpperCase()+profile.plan?.slice(1)} Plan</div>
                    <div style={{fontSize:'.87rem',color:'#047857',marginTop:2}}>
                      <strong>{trialDaysLeft(profile.trial_expires_at)} days</strong> remaining · Upgrade to keep access after trial ends
                    </div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={()=>setTab('plans')}>Upgrade Plan →</button>
              </div>
            )}
            {/* Trial expired warning */}
            {profile?.trial_expires_at && !isTrialActive(profile.trial_expires_at) && !profile?.subscription_active && (
              <div style={{marginTop:20,background:'#fee2e2',borderRadius:'var(--radius)',padding:20,border:'1.5px solid #fca5a5',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
                <div><strong style={{color:'#991b1b'}}>Free trial expired</strong><br/><span style={{fontSize:'.87rem',color:'#b91c1c'}}>Subscribe to a plan to restore access for your clinic.</span></div>
                <button className="btn btn-amber" onClick={()=>setTab('plans')}>Subscribe Now →</button>
              </div>
            )}
            {!profile?.subscription_active && !profile?.trial_expires_at && (
              <div style={{marginTop:20,background:'var(--amber-light)',borderRadius:'var(--radius)',padding:20,border:'1.5px solid var(--amber)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
                <div><strong>No active subscription</strong><br/><span style={{fontSize:'.87rem',color:'#92400e'}}>Activate a plan to allow clinicians and patients to use the platform.</span></div>
                <button className="btn btn-amber" onClick={()=>setTab('plans')}>View Plans →</button>
              </div>
            )}
          </>}

          {/* PLANS */}
          {tab === 'plans' && <>
            <div className="page-header"><h2>Subscription Plans</h2><p>Choose monthly or yearly billing. Yearly saves up to 2 months.</p></div>
            <div className="period-toggle">
              <button className={`period-btn ${period==='monthly'?'active':''}`} onClick={()=>setPeriod('monthly')}>Monthly</button>
              <button className={`period-btn ${period==='yearly'?'active':''}`} onClick={()=>setPeriod('yearly')}>Yearly</button>
            </div>
            <div className="plans-grid">
              {Object.entries(PLANS).map(([key, plan]) => {
                const price = plan[period]
                const isActive = profile?.subscription_active && profile?.plan === key && profile?.plan_period === period
                return (
                  <div key={key} className={`plan-card ${plan.popular?'popular':''}`}>
                    {plan.popular && <div className="plan-badge-top">Most Popular</div>}
                    <div className="plan-name">{plan.name}</div>
                    <div className="plan-price">{price.label}</div>
                    {period === 'yearly' && <div className="plan-saving">{price.saving}</div>}
                    <ul className="plan-features" style={{marginBottom:20}}>
                      {plan.features.map(f => <li key={f}>{f}</li>)}
                    </ul>
                    {isActive
                      ? <div style={{background:'var(--teal-pale)',color:'var(--teal)',padding:'10px',borderRadius:10,fontWeight:700,fontSize:'.87rem',textAlign:'center'}}>✓ Current Plan</div>
                      : <button className={`btn btn-full ${plan.popular?'btn-primary':'btn-outline'}`} onClick={()=>handlePayment(key)}>
                          {profile?.subscription_active ? 'Switch Plan' : 'Subscribe — ' + price.label}
                        </button>
                    }
                  </div>
                )
              })}
            </div>
            <p style={{marginTop:16,fontSize:'.82rem',color:'var(--muted)'}}>🔒 Payments secured by Razorpay · UPI, Cards, Net Banking accepted · Cancel anytime</p>
          </>}

          {/* CLINICIANS */}
          {tab === 'clinicians' && <>
            <div className="page-header"><h2>Clinicians</h2><p>All registered clinicians under clinic ID <strong>{profile?.clinic_id}</strong></p></div>
            <div className="card">
              {clinicians.length === 0
                ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>
                    <div style={{fontSize:'2rem',marginBottom:12}}>👨‍⚕️</div>
                    <p>No clinicians registered yet.</p>
                    <p style={{fontSize:'.87rem',marginTop:6}}>Share your Clinic ID <strong>{profile?.clinic_id}</strong> with clinicians to let them register.</p>
                  </div>
                : <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Clinician ID</th><th>Specialization</th><th>Patients</th><th>Status</th></tr></thead>
                      <tbody>
                        {clinicians.map(c => (
                          <tr key={c.clinician_id}>
                            <td><strong>{c.name}</strong></td>
                            <td style={{fontFamily:'monospace'}}>{c.clinician_id}</td>
                            <td>{c.specialization}</td>
                            <td>{patients.filter(p=>p.clinician_id===c.clinician_id).length}</td>
                            <td><span className="badge badge-green">Active</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          </>}

          {/* SETTINGS */}
          {tab === 'settings' && <>
            <div className="page-header"><h2>Clinic Settings</h2></div>
            <div className="card">
              <div className="form-row">
                <div className="form-group"><label>Clinic Name</label><input className="form-control" value={settings.clinic_name} onChange={e=>setSettings(s=>({...s,clinic_name:e.target.value}))}/></div>
                <div className="form-group"><label>Phone</label><input className="form-control" value={settings.phone} onChange={e=>setSettings(s=>({...s,phone:e.target.value}))}/></div>
              </div>
              <div className="form-group"><label>City</label><input className="form-control" value={settings.city} onChange={e=>setSettings(s=>({...s,city:e.target.value}))}/></div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
            </div>
          </>}
        </div>
      </div>

      {toast && <div className={`toast ${toast.type==='error'?'toast-error':''}`}>{toast.msg}</div>}
    </div>
  )
}
