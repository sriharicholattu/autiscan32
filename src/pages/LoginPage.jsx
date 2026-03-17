import React from 'react'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { validateReferralCode, trialExpiryDate } from '../lib/referral'

const ROLES = [
  { key: 'clinic',    icon: '🏥', title: 'Clinic',     desc: 'Manage subscriptions, clinicians & clinic settings' },
  { key: 'clinician', icon: '👨‍⚕️', title: 'Clinician',  desc: 'View patient sessions, reports & provide conclusions' },
  { key: 'patient',   icon: '🧒', title: 'Patient',    desc: 'Take interactive assessment games with AI monitoring' },
]

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [role, setRole]   = useState(null)
  const [tab, setTab]     = useState('login')
  const [form, setForm]   = useState({
    firstName:'', lastName:'', email:'', password:'',
    clinicId:'', clinicianId:'', dob:'', specialization:'', clinicName:'',
    referralCode:''
  })
  const [error, setError]                     = useState('')
  const [loading, setLoading]                 = useState(false)
  const [referralPreview, setReferralPreview] = useState(null)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'referralCode') setReferralPreview(validateReferralCode(v))
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try { await signIn({ email: form.email, password: form.password }) }
    catch(err) { setError(err.message || 'Login failed. Check your credentials.') }
    finally { setLoading(false) }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const name = (form.firstName + ' ' + form.lastName).trim()
      let extraData = { name, email: form.email }

      if (role === 'clinic') {
        const ref      = validateReferralCode(form.referralCode)
        const hasTrial = !!ref
        extraData = {
          ...extraData,
          clinic_name:         form.clinicName || name + "'s Clinic",
          phone: '', city: '',
          plan:                hasTrial ? ref.plan : 'starter',
          plan_period:         'monthly',
          subscription_active: hasTrial,
          referral_code:       hasTrial ? form.referralCode.toUpperCase() : null,
          referral_used:       hasTrial,
          trial_plan:          hasTrial ? ref.plan : null,
          trial_expires_at:    hasTrial ? trialExpiryDate(ref.trialDays) : null,
        }
      }
      if (role === 'clinician') extraData = { ...extraData, clinic_id: form.clinicId, specialization: form.specialization || 'General' }
      if (role === 'patient')   extraData = { ...extraData, clinician_id: form.clinicianId, dob: form.dob }

      await signUp({ email: form.email, password: form.password, role, extraData })
    } catch(err) {
      setError(err.message || 'Registration failed. Try again.')
    } finally { setLoading(false) }
  }

  /* ── ROLE SELECTION SCREEN ── */
  if (!role) return (
    <div style={{background:'linear-gradient(145deg,#0d1f1d 0%,#0b5c52 50%,#0b8f7e 100%)',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,rgba(20,184,166,.15) 0%,transparent 70%)',top:-200,right:-200}}/>
      <div style={{position:'absolute',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(245,158,11,.10) 0%,transparent 70%)',bottom:-100,left:-100}}/>
      <div style={{textAlign:'center',marginBottom:48,position:'relative',zIndex:1}}>
        <h1 style={{fontFamily:'Playfair Display,serif',fontSize:'3.2rem',color:'white',lineHeight:1.1}}>Auti<span style={{color:'#f59e0b'}}>Scan</span></h1>
        <p style={{color:'rgba(255,255,255,.7)',fontSize:'1.05rem',marginTop:12}}>AI-Powered Early Autism Screening · Ages 2–6</p>
      </div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap',justifyContent:'center',position:'relative',zIndex:1,maxWidth:860}}>
        {ROLES.map(r => (
          <div key={r.key} onClick={() => { setRole(r.key); setTab('register') }}
            style={{background:'rgba(255,255,255,.07)',backdropFilter:'blur(12px)',border:'1.5px solid rgba(255,255,255,.15)',borderRadius:20,padding:'36px 30px',width:240,cursor:'pointer',transition:'all .25s',textAlign:'center',color:'white'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.14)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.07)'}>
            <div style={{fontSize:'3rem',marginBottom:14}}>{r.icon}</div>
            <h3 style={{fontSize:'1.15rem',fontWeight:800,marginBottom:8}}>{r.title}</h3>
            <p style={{fontSize:'.82rem',opacity:.7,lineHeight:1.5}}>{r.desc}</p>
          </div>
        ))}
      </div>
      <p style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',marginTop:32,position:'relative',zIndex:1}}>
        Trusted by pediatric clinics · Clinically guided · Privacy first
      </p>
    </div>
  )

  /* ── LOGIN / REGISTER FORM ── */
  const roleInfo = ROLES.find(r => r.key === role)
  return (
    <div style={{background:'linear-gradient(145deg,#0d1f1d,#0b8f7e)',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'white',borderRadius:24,padding:40,width:'100%',maxWidth:460,position:'relative'}}>
        <button onClick={() => { setRole(null); setError(''); setReferralPreview(null) }}
          style={{position:'absolute',top:16,left:20,background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer',color:'var(--muted)'}}>← Back</button>

        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:28,marginTop:8}}>
          <div style={{width:52,height:52,borderRadius:14,background:'var(--teal-pale)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem'}}>{roleInfo.icon}</div>
          <div>
            <h2 style={{fontFamily:'Playfair Display,serif',fontSize:'1.4rem'}}>{roleInfo.title} Portal</h2>
            <p style={{fontSize:'.82rem',color:'var(--muted)'}}>Sign in or create your account</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,background:'var(--bg)',borderRadius:10,padding:4,marginBottom:24}}>
          {['login','register'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              style={{flex:1,padding:9,borderRadius:7,fontSize:'.84rem',fontWeight:700,cursor:'pointer',border:'none',fontFamily:'Nunito,sans-serif',background:tab===t?'white':'none',color:tab===t?'var(--teal)':'var(--muted)',boxShadow:tab===t?'0 2px 8px rgba(0,0,0,.08)':'none',transition:'all .2s'}}>
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister}>
          {/* Register-only fields */}
          {tab === 'register' && <>
            <div className="form-row">
              <div className="form-group"><label>First Name</label><input className="form-control" value={form.firstName} onChange={e=>set('firstName',e.target.value)} placeholder="Jane" required /></div>
              <div className="form-group"><label>Last Name</label><input className="form-control" value={form.lastName} onChange={e=>set('lastName',e.target.value)} placeholder="Doe" /></div>
            </div>

            {role === 'clinic' && <div className="form-group"><label>Clinic Name</label><input className="form-control" value={form.clinicName} onChange={e=>set('clinicName',e.target.value)} placeholder="City Care Clinic" /></div>}

            {role === 'clinician' && <>
              <div className="form-group"><label>Specialization</label><input className="form-control" value={form.specialization} onChange={e=>set('specialization',e.target.value)} placeholder="Child Psychology" /></div>
              <div className="form-group">
                <label>Clinic ID <span style={{color:'var(--muted)',fontWeight:400}}>(from your clinic admin)</span></label>
                <input className="form-control" value={form.clinicId} onChange={e=>set('clinicId',e.target.value)} placeholder="CL-XXXX" required />
              </div>
            </>}

            {role === 'patient' && <>
              <div className="form-group"><label>Child's Date of Birth</label><input className="form-control" type="date" value={form.dob} onChange={e=>set('dob',e.target.value)} /></div>
              <div className="form-group">
                <label>Clinician ID <span style={{color:'var(--muted)',fontWeight:400}}>(from your doctor)</span></label>
                <input className="form-control" value={form.clinicianId} onChange={e=>set('clinicianId',e.target.value)} placeholder="DR-XXXX" required />
              </div>
            </>}

            {/* ── REFERRAL CODE — clinics only ── */}
            {role === 'clinic' && (
              <div className="form-group">
                <label style={{display:'flex',alignItems:'center',gap:8}}>
                  🎁 Referral Code
                  <span style={{color:'var(--muted)',fontWeight:400,fontSize:'.82rem'}}>(optional — unlocks free trial)</span>
                </label>
                <div style={{position:'relative'}}>
                  <input
                    className="form-control"
                    value={form.referralCode}
                    onChange={e => set('referralCode', e.target.value)}
                    placeholder="e.g. AUTISCAN2025"
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontWeight: 700,
                      borderColor: form.referralCode
                        ? (referralPreview ? '#10b981' : '#ef4444')
                        : 'var(--border)',
                      paddingRight: 40,
                    }}
                  />
                  {form.referralCode && (
                    <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:'1.1rem'}}>
                      {referralPreview ? '✅' : '❌'}
                    </span>
                  )}
                </div>

                {/* Valid referral banner */}
                {referralPreview && (
                  <div style={{marginTop:8,background:'#d1fae5',border:'1.5px solid #6ee7b7',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:'1.4rem'}}>🎁</span>
                    <div>
                      <div style={{fontWeight:800,color:'#065f46',fontSize:'.9rem'}}>{referralPreview.label}</div>
                      <div style={{fontSize:'.8rem',color:'#047857',marginTop:2}}>No payment needed — trial activates instantly on signup!</div>
                    </div>
                  </div>
                )}

                {/* Invalid referral notice */}
                {form.referralCode && !referralPreview && (
                  <div style={{marginTop:8,background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,padding:'8px 14px',fontSize:'.82rem',color:'#991b1b'}}>
                    ❌ Invalid code. Leave empty to subscribe later via the Plans page.
                  </div>
                )}
              </div>
            )}
          </>}

          {/* Common fields */}
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input className="form-control" type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="min 8 characters" required />
          </div>

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{marginTop:4}}>
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : referralPreview ? '🎁 Activate Free Trial' : 'Create Account'}
          </button>

          {tab === 'register' && role === 'clinic' && !referralPreview && (
            <p style={{textAlign:'center',marginTop:10,fontSize:'.79rem',color:'var(--muted)'}}>
              Have a referral code? Enter it above for a free trial — no card needed.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
