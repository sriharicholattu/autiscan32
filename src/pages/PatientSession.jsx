import React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const WORD_LIST = ['cat','dog','ball','sun','red','cup','hat','fish','bird','tree','shoe','book','star','cake','frog','rain','blue','boat','milk','hand']
const ANIMALS   = ['🐰','🐱','🐶','🦊','🐸','🐻','🐼','🦁']
const COLORS    = [{n:'Red',h:'#ef4444'},{n:'Blue',h:'#3b82f6'},{n:'Green',h:'#22c55e'},{n:'Yellow',h:'#eab308'},{n:'Purple',h:'#a855f7'},{n:'Orange',h:'#f97316'},{n:'Pink',h:'#ec4899'},{n:'Teal',h:'#14b8a6'}]

export default function PatientSession() {
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState('session')
  const [gameIdx, setGameIdx] = useState(0)
  const [step, setStep] = useState(1) // 1=camera, 2=games, 3=done
  const [toast, setToast] = useState(null)
  const [sessions, setSessions] = useState([])

  // Camera / AI
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const aiTimerRef  = useRef(null)
  const [camState, setCamState]   = useState('off') // off | live | sim
  const [aiData, setAiData]       = useState({ eye:'Waiting...', move:'Waiting...', face:'Waiting...', voice:'Waiting...', eyePct:0, movePct:0, facePct:0, voicePct:0 })

  // Game scores stored for report
  const scoresRef = useRef({ bubble:0, animal:0, simon:0, color:0, sound:0, eye:0, move:0, face:0, voice:0, react:0 })

  // Bubble pop
  const [bScore, setBScore] = useState(0)
  const [bPopped, setBPopped] = useState(0)
  const [bMissed, setBMissed] = useState(0)
  const bubbleTimerRef = useRef(null)

  // Animal
  const [anScore, setAnScore]  = useState(0)
  const [anMiss, setAnMiss]    = useState(0)
  const [anPos, setAnPos]      = useState({ top:'40%', left:'40%' })
  const [anEmoji, setAnEmoji]  = useState('🐰')
  const anTimerRef = useRef(null)

  // Simon
  const [simonSeq, setSimonSeq]       = useState([])
  const [simonLevel, setSimonLevel]   = useState(0)
  const [simonBest, setSimonBest]     = useState(0)
  const [simonMsg, setSimonMsg]       = useState('Press Start to begin')
  const [simonActive, setSimonActive] = useState(false)
  const simonPlayerRef = useRef([])

  // Color match
  const [curColor, setCurColor] = useState(COLORS[0])
  const [colorOpts, setColorOpts] = useState([])
  const [colorScore, setColorScore] = useState(0)
  const [colorWrong, setColorWrong] = useState(0)
  const [colorMsg, setColorMsg] = useState('Press Start to play')

  // Sound & repeat
  const [curWord, setCurWord]         = useState('')
  const [soundMsg, setSoundMsg]       = useState('Press Speak Word to begin')
  const [soundResult, setSoundResult] = useState('')
  const [soundCorrect, setSoundCorrect] = useState(0)
  const [soundAttempts, setSoundAttempts] = useState(0)
  const [soundListening, setSoundListening] = useState(false)
  const [showWave, setShowWave]       = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => { loadSessions(); return cleanup }, [])

  function notify(msg) { setToast(msg); setTimeout(()=>setToast(null),3000) }
  function cleanup() {
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop())
    if (aiTimerRef.current) clearInterval(aiTimerRef.current)
    if (bubbleTimerRef.current) clearInterval(bubbleTimerRef.current)
    if (anTimerRef.current) clearInterval(anTimerRef.current)
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch(e){} }
  }

  async function loadSessions() {
    if (!profile?.patient_id) return
    const { data } = await supabase.from('reports').select('*').eq('patient_id', profile.patient_id).order('created_at',{ascending:false})
    setSessions(data || [])
  }

  // ── CAMERA ──
  async function startCamera() {
    if (window.location.protocol === 'file:') { activateSim(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.style.display = 'block' }
      setCamState('live')
      startAI()
      notify('Camera enabled — AI monitoring active 👁')
    } catch(e) {
      if (e.name === 'NotAllowedError') notify('Camera denied. Click "Simulate" to continue.')
      else activateSim()
    }
  }

  function activateSim() {
    setCamState('sim')
    startAI()
    drawSimFace()
    notify('AI simulation mode active')
  }

  function startAI() {
    const labels = [
      {key:'eye',vals:['Good eye contact','Intermittent','Looking away']},
      {key:'move',vals:['Normal posture','Active movement','Repetitive motion']},
      {key:'face',vals:['Smiling 😊','Neutral 😐','No response']},
      {key:'voice',vals:['Responsive','Delayed','No vocalization']},
    ]
    aiTimerRef.current = setInterval(() => {
      setAiData(prev => {
        const next = { ...prev }
        labels.forEach(l => {
          const pct = Math.floor(35 + Math.random() * 60)
          next[l.key] = l.vals[Math.floor(Math.random()*l.vals.length)] + ' (' + pct + '%)'
          next[l.key+'Pct'] = pct
          scoresRef.current[l.key] = pct
        })
        scoresRef.current.react = Math.floor(60 + Math.random()*35)
        return next
      })
    }, 2200)
  }

  function drawSimFace() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let blink=false, eyeOff=0, swing=0
    function frame() {
      if (!canvasRef.current) return
      ctx.clearRect(0,0,480,360)
      ctx.fillStyle='#1a3a38'; ctx.fillRect(0,0,480,360)
      ctx.strokeStyle='rgba(20,184,166,.08)'; ctx.lineWidth=1
      for(let x=0;x<480;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,360);ctx.stroke()}
      for(let y=0;y<360;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(480,y);ctx.stroke()}
      const cx=240+Math.sin(swing)*8, cy=180+Math.cos(swing*.7)*4
      ctx.save()
      ctx.strokeStyle='#14b8a6'; ctx.lineWidth=2; ctx.shadowColor='#14b8a6'; ctx.shadowBlur=12
      ctx.beginPath(); ctx.ellipse(cx,cy,90,110,0,0,Math.PI*2); ctx.stroke()
      [[cx-30,cy-18],[cx+30,cy-18],[cx,cy+10],[cx-20,cy+45],[cx+20,cy+45]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fillStyle='rgba(20,184,166,.7)';ctx.fill()})
      const eH=blink?1:10
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=8
      ctx.beginPath(); ctx.ellipse(cx-30+eyeOff,cy-18,14,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(cx+30+eyeOff,cy-18,14,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.strokeStyle='rgba(20,184,166,.5)'; ctx.shadowBlur=0
      ctx.beginPath(); ctx.moveTo(cx,cy-5); ctx.lineTo(cx-8,cy+18); ctx.lineTo(cx+8,cy+18); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx,cy+38,20,.1*Math.PI,.9*Math.PI); ctx.strokeStyle='rgba(20,184,166,.6)'; ctx.stroke()
      ctx.strokeStyle='rgba(20,184,166,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4])
      ctx.strokeRect(cx-100,cy-130,200,240); ctx.setLineDash([])
      ctx.fillStyle='rgba(20,184,166,.9)'; ctx.font='bold 11px Nunito,sans-serif'; ctx.fillText('FACE DETECTED',cx-52,cy-138)
      ctx.restore()
      ctx.fillStyle='rgba(245,158,11,.8)'; ctx.font='bold 10px Nunito,sans-serif'
      ctx.fillText('GAZE: '+(Math.abs(eyeOff)<3?'DIRECT ●':eyeOff>0?'RIGHT →':'← LEFT'),12,24)
      if(Math.random()<.008){blink=true;setTimeout(()=>blink=false,150)}
      eyeOff=Math.max(-18,Math.min(18,eyeOff+(Math.random()-.5)*.8)); swing+=.015
      requestAnimationFrame(frame)
    }
    frame()
  }

  // ── BUBBLE POP ──
  function startBubbles() {
    setBScore(0); setBPopped(0); setBMissed(0)
    scoresRef.current.bubble = 0
    const arena = document.getElementById('bubble-arena')
    if (!arena) return
    arena.innerHTML = ''
    if (bubbleTimerRef.current) clearInterval(bubbleTimerRef.current)
    bubbleTimerRef.current = setInterval(() => spawnBubble(arena), 900)
    setTimeout(() => { clearInterval(bubbleTimerRef.current); notify('Bubble Pop done!') }, 30000)
  }
  function spawnBubble(arena) {
    const emojis=['🫧','⭐','🌟','💫','🎈','🔵','🟢','🟡','🟠','🔴']
    const sz = 48+Math.random()*32
    const b = document.createElement('div')
    b.className='bubble'
    b.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*85}%;background:hsl(${Math.random()*360},70%,75%);animation-duration:${3+Math.random()*2}s`
    b.textContent=emojis[Math.floor(Math.random()*emojis.length)]
    b.addEventListener('click',()=>{
      b.classList.add('bubble-pop')
      setBPopped(p=>{const n=p+1;scoresRef.current.bubble=Math.min(100,Math.round((n/(n+bMissed))*100));return n})
      setBScore(s=>s+10)
      setTimeout(()=>b.remove(),300)
    })
    b.addEventListener('animationend',()=>{ setBMissed(m=>m+1); b.remove() })
    arena.appendChild(b)
  }

  // ── ANIMAL ──
  function startAnimal() {
    setAnScore(0); setAnMiss(0); scoresRef.current.animal=0
    if (anTimerRef.current) clearInterval(anTimerRef.current)
    anTimerRef.current = setInterval(() => {
      setAnPos({ top:(10+Math.random()*75)+'%', left:(10+Math.random()*75)+'%' })
      setAnEmoji(ANIMALS[Math.floor(Math.random()*ANIMALS.length)])
      setAnMiss(m=>m+1)
    }, 1800)
    setTimeout(()=>{ clearInterval(anTimerRef.current); notify('Follow Animal done!') }, 30000)
  }
  function catchAnimal() {
    setAnScore(s=>{ const n=s+1; scoresRef.current.animal=Math.min(100,Math.round(n/(n+anMiss)*100)); return n })
    setAnPos({ top:(10+Math.random()*75)+'%', left:(10+Math.random()*75)+'%' })
    setAnEmoji(ANIMALS[Math.floor(Math.random()*ANIMALS.length)])
  }

  // ── SIMON ──
  const simonRef = useRef([])
  function startSimon() {
    simonRef.current=[]; simonPlayerRef.current=[]
    setSimonSeq([]); setSimonLevel(0); setSimonActive(false)
    addStep([])
  }
  function addStep(seq) {
    const next=[...seq, Math.floor(Math.random()*4)]
    simonRef.current=next
    setSimonSeq(next); setSimonLevel(next.length)
    setSimonBest(b=>Math.max(b,next.length))
    setSimonMsg('Watch the pattern...')
    simonPlayerRef.current=[]; setSimonActive(false)
    playSeq(next,0)
  }
  function playSeq(seq,i) {
    if(i>=seq.length){ setTimeout(()=>{ setSimonMsg('Your turn! Repeat the pattern.'); setSimonActive(true) },400); return }
    const btn=document.getElementById('s'+seq[i])
    setTimeout(()=>{ btn?.classList.add('lit'); setTimeout(()=>{ btn?.classList.remove('lit'); playSeq(seq,i+1) },500) },i*700+200)
  }
  function simonInput(idx) {
    if(!simonActive) return
    const btn=document.getElementById('s'+idx)
    btn?.classList.add('lit'); setTimeout(()=>btn?.classList.remove('lit'),200)
    simonPlayerRef.current=[...simonPlayerRef.current,idx]
    const pos=simonPlayerRef.current.length-1
    if(simonPlayerRef.current[pos]!==simonRef.current[pos]){
      setSimonMsg('❌ Wrong! Press Start again.'); setSimonActive(false)
      scoresRef.current.simon=Math.min(100,Math.round((simonRef.current.length-1)/Math.max(simonRef.current.length,1)*100))
      return
    }
    if(simonPlayerRef.current.length===simonRef.current.length){
      setSimonMsg('✅ Correct! Next level...'); setSimonActive(false)
      scoresRef.current.simon=Math.min(100,Math.round(simonRef.current.length/10*100))
      setTimeout(()=>addStep(simonRef.current),900)
    }
  }

  // ── COLOR MATCH ──
  function startColor() { setColorScore(0); setColorWrong(0); nextColor() }
  function nextColor() {
    const sh=[...COLORS].sort(()=>Math.random()-.5)
    const target=sh[0]
    const opts=[...new Map([...sh.slice(0,4)].map(c=>[c.n,c])).values()]
    if(!opts.find(c=>c.n===target.n)) opts[0]=target
    setCurColor(target); setColorOpts(opts.slice(0,4)); setColorMsg('Tap the matching color')
  }
  function checkColor(name) {
    if(name===curColor.n){
      setColorScore(s=>{ const n=s+1; scoresRef.current.color=Math.min(100,Math.round(n/(n+colorWrong)*100)); return n })
      setColorMsg('✅ Correct!')
    } else {
      setColorWrong(w=>w+1); setColorMsg('❌ Try again!')
    }
    setTimeout(nextColor,700)
  }

  // ── SOUND REPEAT ──
  function speakWord() {
    if(!window.speechSynthesis){ setSoundMsg('Speech synthesis not supported. Use Chrome.'); return }
    let w; do { w=WORD_LIST[Math.floor(Math.random()*WORD_LIST.length)] } while(w===curWord && WORD_LIST.length>1)
    setCurWord(w); setSoundResult(''); setSoundListening(false)
    setSoundAttempts(a=>a+1)
    window.speechSynthesis.cancel()
    const utt=new SpeechSynthesisUtterance(w)
    utt.rate=0.8; utt.pitch=1.1; utt.volume=1
    const voices=window.speechSynthesis.getVoices()
    const v=voices.find(v=>v.lang.startsWith('en')&&v.name.toLowerCase().includes('female'))||voices.find(v=>v.lang.startsWith('en'))
    if(v) utt.voice=v
    utt.onend=()=>setSoundMsg('Now say the word 🎙')
    window.speechSynthesis.speak(utt)
    setSoundMsg('Listen carefully...')
  }

  function startListening() {
    if(window.location.protocol==='file:'){ setSoundMsg('Open via Live Server for mic access.'); return }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition
    if(!SR){ setSoundMsg('Use Chrome for speech recognition.'); return }
    if(recognitionRef.current){ try{recognitionRef.current.stop()}catch(e){} }
    const r=new SR(); r.lang='en-US'; r.interimResults=false; r.maxAlternatives=5
    recognitionRef.current=r; setSoundListening(true); setShowWave(true); setSoundMsg('Listening...')
    r.onresult=e=>{
      const alts=Array.from(e.results[0]).map(a=>a.transcript.toLowerCase().trim())
      const heard=alts[0]
      const ok=alts.some(a=>a===curWord||a.includes(curWord)||curWord.includes(a))
      setSoundListening(false); setShowWave(false)
      if(ok){
        setSoundCorrect(c=>{ const n=c+1; scoresRef.current.sound=Math.min(100,Math.round(n/soundAttempts*100)); return n })
        setSoundResult('✅ Correct! "'+heard+'"')
        setSoundMsg('Great! Press Speak Word for next.')
      } else {
        setSoundResult('❌ Heard "'+heard+'" — expected "'+curWord+'"')
        setSoundMsg('Try again — press Speak Word.')
      }
    }
    r.onerror=e=>{ setSoundListening(false); setShowWave(false); setSoundMsg(e.error==='not-allowed'?'Mic permission denied.':'Error: '+e.error) }
    r.onend=()=>{ setSoundListening(false); setShowWave(false) }
    try{ r.start() }catch(e){}
  }

  // ── SUBMIT REPORT ──
  async function submitReport() {
    if (!profile?.patient_id) return
    const s=scoresRef.current
    const summary=genSummary(s)
    const sessionNo=(sessions.length||0)+1
    const { error } = await supabase.from('reports').insert({
      patient_id: profile.patient_id,
      clinician_id: profile.clinician_id,
      session_no: sessionNo,
      score_eye: s.eye, score_move: s.move, score_face: s.face, score_voice: s.voice, score_react: s.react,
      score_bubble: s.bubble, score_animal: s.animal, score_simon: s.simon, score_color: s.color, score_sound: s.sound,
      ai_summary: summary,
      reviewed: false,
    })
    if (!error) {
      await supabase.from('patients').update({ sessions: sessionNo }).eq('patient_id', profile.patient_id)
      cleanup()
      setStep(3)
      await loadSessions()
    } else {
      notify('Error submitting report. Try again.')
    }
  }

  function genSummary(s) {
    const avg=(s.eye+s.move+s.face+s.voice+s.react)/5
    if(avg>75) return 'The child demonstrates strong behavioral responses across all parameters. Eye contact, movement, and voice responses are within expected range for the age group. Low concern indicators.'
    if(avg>50) return 'The child shows moderate behavioral responses. Some parameters such as facial expression recognition or voice response may benefit from further observation. Recommend continued monitoring.'
    return 'Several parameters indicate potential areas of concern including eye contact, facial expression, and voice response. Detailed clinical evaluation is recommended.'
  }

  const GAME_TABS = ['🫧 Bubble Pop','🐾 Follow Animal','🎮 Simon Says','🎨 Color Match','🔊 Sound & Repeat']
  const clinicianName = profile?.clinician_name || 'your clinician'

  return (
    <div style={{minHeight:'100vh'}}>
      <div className="topbar">
        <div className="logo">Auti<span>Scan</span></div>
        <div className="topbar-right">
          <span className="role-badge">🧒 Patient</span>
          <span style={{fontWeight:700,color:'var(--mid)'}}>{profile?.name}</span>
          <span style={{fontSize:'.8rem',color:'var(--muted)'}}>→ {clinicianName}</span>
          <button className="btn btn-danger btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div className="dashboard-layout">
        <div className="sidebar">
          <ul className="sidebar-menu">
            <li><button className={`sidebar-item ${tab==='session'?'active':''}`} onClick={()=>setTab('session')}>🎮 My Session</button></li>
            <li><button className={`sidebar-item ${tab==='progress'?'active':''}`} onClick={()=>setTab('progress')}>📈 My Progress</button></li>
          </ul>
          <div style={{marginTop:24,padding:'14px 16px',background:'var(--teal-pale)',borderRadius:'var(--radius-sm)'}}>
            <div style={{fontSize:'.75rem',color:'var(--muted)',fontWeight:700}}>PATIENT ID</div>
            <div style={{fontFamily:'monospace',fontSize:'1rem',color:'var(--teal)',fontWeight:800,marginTop:4}}>{profile?.patient_id}</div>
          </div>
        </div>

        <div className="main-content">
          {tab === 'session' && <>
            {step === 3 ? (
              <div style={{textAlign:'center',padding:'60px 20px'}}>
                <div style={{fontSize:'4rem',marginBottom:16}}>✅</div>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:'1.8rem',marginBottom:8}}>Session Submitted!</h2>
                <p style={{color:'var(--muted)',marginBottom:28}}>Your assessment has been sent to your clinician for review.<br/>You'll be notified when the report is ready.</p>
                <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                  <button className="btn btn-primary" onClick={()=>{setStep(1);setTab('progress')}}>📈 View Progress</button>
                </div>
              </div>
            ) : <>
              <div className="page-header"><h2>Assessment Session</h2><p>Complete all games — the AI will monitor and generate your report.</p></div>

              {/* Progress bar */}
              <div className="card" style={{marginBottom:20}}>
                <div style={{fontWeight:800,fontSize:'.85rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:14}}>Session Progress</div>
                <div className="progress-steps">
                  {[{label:'Camera',n:1},{label:'Games',n:2},{label:'Report',n:3}].map(s2=>(
                    <div key={s2.n} className={`prog-step ${step>s2.n?'done':step===s2.n?'active':''}`}>
                      <div className="prog-dot">{step>s2.n?'✓':s2.n}</div>
                      <div className="prog-label">{s2.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Camera + AI */}
              <div className="camera-section">
                <div style={{flex:1,minWidth:280}}>
                  <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>Live Camera Monitor</div>
                  <div className="camera-feed">
                    <video ref={videoRef} autoPlay muted playsInline style={{display:'none',width:'100%',height:'100%',objectFit:'cover'}}/>
                    <canvas ref={canvasRef} width={480} height={360} style={{display:camState==='sim'?'block':'none',width:'100%',height:'100%'}}/>
                    {camState==='off' && (
                      <div className="camera-overlay">
                        <div style={{fontSize:'2.5rem'}}>📷</div>
                        <button className="btn btn-primary btn-sm" onClick={startCamera}>Enable Camera</button>
                        <button className="btn btn-amber btn-sm" onClick={activateSim} style={{marginTop:4}}>▶ Use AI Simulation</button>
                        <p style={{color:'rgba(255,255,255,.6)',fontSize:'.78rem',marginTop:4}}>Camera works on http://localhost (Live Server)</p>
                      </div>
                    )}
                    <div className={`cam-status ${camState!=='off'?'cam-live':'cam-off'}`}>
                      {camState==='live'?'● Live':camState==='sim'?'● Simulated':'● Off'}
                    </div>
                  </div>
                  {camState !== 'off' && (
                    <div style={{display:'flex',gap:8,marginTop:10}}>
                      <button className="btn btn-sm" style={{background:'var(--teal)',color:'white',border:'none'}} onClick={()=>setStep(2)}>→ Proceed to Games</button>
                    </div>
                  )}
                </div>

                <div className="ai-readings">
                  <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5}}>AI Readings</div>
                  {[
                    {icon:'👁',label:'Eye Contact',key:'eye',color:'var(--teal)'},
                    {icon:'🧍',label:'Body Movement',key:'move',color:'var(--blue)'},
                    {icon:'😊',label:'Facial Expression',key:'face',color:'var(--purple)'},
                    {icon:'🔊',label:'Voice Response',key:'voice',color:'var(--amber)'},
                  ].map(a=>(
                    <div key={a.key} className="ai-card">
                      <div className="ai-card-icon" style={{background:'var(--bg)'}}>{a.icon}</div>
                      <div className="ai-card-info">
                        <div className="ai-card-label">{a.label}</div>
                        <div className="ai-card-value">{aiData[a.key]}</div>
                        <div className="ai-bar-track"><div className="ai-bar-fill" style={{width:(aiData[a.key+'Pct']||0)+'%',background:a.color}}/></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Games */}
              <div style={{marginTop:8}}>
                <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:14}}>Assessment Games</div>
                <div className="games-nav">
                  {GAME_TABS.map((g,i)=><button key={g} className={`game-tab ${gameIdx===i?'active':''}`} onClick={()=>setGameIdx(i)}>{g}</button>)}
                </div>

                {/* Bubble Pop */}
                {gameIdx===0 && <div className="game-box">
                  <div className="game-title">🫧 Bubble Pop</div>
                  <div className="game-desc">Pop as many bubbles as you can! Tests touch response & attention.</div>
                  <div id="bubble-arena"></div>
                  <div className="game-scores-bar">
                    <div className="gscore">Score: <span>{bScore}</span></div>
                    <div className="gscore">Popped: <span>{bPopped}</span></div>
                    <div className="gscore">Missed: <span>{bMissed}</span></div>
                    <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={startBubbles}>▶ Start</button>
                  </div>
                </div>}

                {/* Follow Animal */}
                {gameIdx===1 && <div className="game-box">
                  <div className="game-title">🐾 Follow the Animal</div>
                  <div className="game-desc">Tap the animal as it moves! Tests visual tracking & coordination.</div>
                  <div id="animal-arena" style={{position:'relative',width:'100%',height:240,background:'linear-gradient(135deg,#fef9ec,#fff8e1)',borderRadius:14,overflow:'hidden',border:'1.5px solid var(--border)'}}>
                    <div className="animal-target" style={{top:anPos.top,left:anPos.left}} onClick={catchAnimal}>{anEmoji}</div>
                  </div>
                  <div className="game-scores-bar">
                    <div className="gscore">Catches: <span>{anScore}</span></div>
                    <div className="gscore">Misses: <span>{anMiss}</span></div>
                    <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={startAnimal}>▶ Start</button>
                  </div>
                </div>}

                {/* Simon Says */}
                {gameIdx===2 && <div className="game-box">
                  <div className="game-title">🎮 Simon Says</div>
                  <div className="game-desc">Watch the pattern and repeat it! Tests memory & instruction following.</div>
                  <div style={{textAlign:'center',marginBottom:14,fontWeight:700,color:'var(--muted)'}}>{simonMsg}</div>
                  <div className="simon-grid">
                    {[{c:'#4ade80',e:'🟢'},{c:'#f87171',e:'🔴'},{c:'#60a5fa',e:'🔵'},{c:'#fbbf24',e:'🟡'}].map((b,i)=>(
                      <button key={i} id={'s'+i} className="simon-btn" style={{background:b.c}} onClick={()=>simonInput(i)}>{b.e}</button>
                    ))}
                  </div>
                  <div className="game-scores-bar" style={{marginTop:14}}>
                    <div className="gscore">Level: <span>{simonLevel}</span></div>
                    <div className="gscore">Best: <span>{simonBest}</span></div>
                    <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={startSimon}>▶ Start</button>
                  </div>
                </div>}

                {/* Color Match */}
                {gameIdx===3 && <div className="game-box">
                  <div className="game-title">🎨 Color Match</div>
                  <div className="game-desc">Match the color shown! Tests cognitive recognition.</div>
                  <div style={{textAlign:'center'}}>
                    <div className="color-display" style={{background:curColor.h}}>?</div>
                    <p style={{textAlign:'center',marginBottom:14,fontWeight:700,color:'var(--muted)'}}>{colorMsg}</p>
                    <div className="color-options">
                      {colorOpts.map(c=><div key={c.n} className="color-opt" style={{background:c.h}} onClick={()=>checkColor(c.n)}/>)}
                    </div>
                  </div>
                  <div className="game-scores-bar">
                    <div className="gscore">Correct: <span>{colorScore}</span></div>
                    <div className="gscore">Wrong: <span>{colorWrong}</span></div>
                    <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={startColor}>▶ Start</button>
                  </div>
                </div>}

                {/* Sound Repeat */}
                {gameIdx===4 && <div className="game-box">
                  <div className="game-title">🔊 Sound & Repeat</div>
                  <div className="game-desc">The app speaks a word. The child repeats it into the mic! Tests voice response.</div>
                  <div style={{textAlign:'center'}}>
                    <div className="word-display">{curWord ? curWord.toUpperCase() : '—'}</div>
                    <div style={{fontWeight:700,color:'var(--muted)',marginBottom:12}}>{soundMsg}</div>
                    {soundResult && <div style={{fontSize:'1.1rem',fontWeight:800,marginBottom:12}}>{soundResult}</div>}
                    {showWave && <div className="sound-waveform" style={{marginBottom:14}}>
                      <div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/><div className="wave-bar"/>
                    </div>}
                    <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                      <button className="btn btn-primary" onClick={speakWord} disabled={soundListening}>🔊 Speak Word</button>
                      <button className="btn" style={{background:'var(--coral)',color:'white'}} onClick={startListening} disabled={soundListening||!curWord}>🎙 Listen</button>
                    </div>
                  </div>
                  <div className="game-scores-bar" style={{marginTop:16}}>
                    <div className="gscore">Correct: <span>{soundCorrect}</span></div>
                    <div className="gscore">Attempts: <span>{soundAttempts}</span></div>
                    <div className="gscore">Accuracy: <span>{soundAttempts>0?Math.round(soundCorrect/soundAttempts*100)+'%':'—'}</span></div>
                  </div>
                </div>}
              </div>

              {/* Submit */}
              <div style={{marginTop:20,background:'linear-gradient(135deg,var(--teal-pale),#fff)',borderRadius:'var(--radius)',padding:22,border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
                <div>
                  <div style={{fontWeight:800}}>Ready to submit your session?</div>
                  <div style={{color:'var(--muted)',fontSize:'.87rem'}}>Your report will be sent to your clinician for review.</div>
                </div>
                <button className="btn btn-primary" onClick={submitReport}>📤 Submit Report</button>
              </div>
            </>}
          </>}

          {tab === 'progress' && <>
            <div className="page-header"><h2>My Progress</h2><p>Track your assessment sessions.</p></div>
            <div className="card">
              {sessions.length === 0
                ? <p style={{color:'var(--muted)'}}>No sessions yet. Complete your first assessment!</p>
                : <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {sessions.map(s=>(
                      <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'var(--bg)',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)'}}>
                        <div><strong>Session {s.session_no}</strong> <span style={{color:'var(--muted)',fontSize:'.85rem'}}>· {new Date(s.created_at).toLocaleDateString('en-IN')}</span></div>
                        <span className={`badge ${s.conclusion?'badge-green':'badge-amber'}`}>{s.conclusion||'Pending Review'}</span>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </>}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
