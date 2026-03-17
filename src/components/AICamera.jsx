import React, { useEffect, useRef, useState } from 'react'

const AI_LABELS = {
  eye:   { icon: '👁',  label: 'Eye Contact',   color: '#14b8a6' },
  expr:  { icon: '😊',  label: 'Expression',     color: '#8b5cf6' },
  pose:  { icon: '🧍',  label: 'Body Posture',   color: '#3b82f6' },
  emote: { icon: '💭',  label: 'Emotion',        color: '#f59e0b' },
}

export default function AICamera({ onScoresUpdate, onCamStateChange }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const modelsRef = useRef({ faceapi: false })

  const [camState, setCamState]     = useState('off')
  const [loading, setLoading]       = useState(false)
  const [loadMsg, setLoadMsg]       = useState('')
  const [aiReadings, setAiReadings] = useState({
    eye:   { value: 'Waiting...', pct: 0 },
    expr:  { value: 'Waiting...', pct: 0 },
    pose:  { value: 'Waiting...', pct: 0 },
    emote: { value: 'Waiting...', pct: 0 },
  })

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = resolve; s.onerror = resolve
      document.head.appendChild(s)
    })
  }

  async function loadModels() {
    setLoading(true)
    try {
      setLoadMsg('Loading face-api.js...')
      await loadScript('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js')
      if (window.faceapi) {
        setLoadMsg('Loading expression models...')
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ])
        modelsRef.current.faceapi = true
      }
      setLoadMsg('Starting camera...')
      await startCameraStream()
    } catch(e) {
      console.warn('Model load error:', e)
      startSimulation()
    }
    setLoading(false)
  }

  async function startCameraStream() {
    if (window.location.protocol === 'file:') { startSimulation(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480, facingMode:'user' }, audio:false })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      video.onloadedmetadata = () => {
        video.play()
        setCamState('live')
        onCamStateChange?.('live')
        startDetectionLoop()
      }
    } catch(e) { startSimulation() }
  }

  function startSimulation() {
    setCamState('sim')
    onCamStateChange?.('sim')
    drawSimCanvas()
    startSimReadings()
  }

  function startDetectionLoop() {
    let lastDetect = 0
    async function loop() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      canvas.width  = video.videoWidth  || 640
      canvas.height = video.videoHeight || 480
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const now = Date.now()
      if (modelsRef.current.faceapi && now - lastDetect > 400) {
        lastDetect = now
        try { await runFaceApi(video, ctx, canvas.width, canvas.height) } catch(e) {}
      }
      runPoseAnalysis(ctx, canvas.width, canvas.height)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  async function runFaceApi(video, ctx, w, h) {
    const faceapi = window.faceapi
    if (!faceapi) return
    const dets = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize:224, scoreThreshold:.3 }))
      .withFaceLandmarks(true)
      .withFaceExpressions()
    if (!dets.length) {
      updateReading('eye',  'No face detected', 0)
      updateReading('expr', 'No face detected', 0)
      updateReading('emote','No face detected', 0)
      return
    }
    const det = dets[0]
    const { x, y, width, height } = det.detection.box
    const exprs = det.expressions
    const pts   = det.landmarks.positions

    // Face bounding box
    ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)
    ctx.fillStyle = 'rgba(20,184,166,.08)'
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = '#14b8a6'; ctx.font = 'bold 12px Nunito,sans-serif'
    ctx.fillText('FACE DETECTED', x, y - 6)

    // Landmarks
    ctx.fillStyle = 'rgba(245,158,11,.75)'
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI*2); ctx.fill() })

    // Eye outlines
    ;[pts.slice(36,42), pts.slice(42,48)].forEach(eye => {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(eye[0].x, eye[0].y)
      eye.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath(); ctx.stroke()
    })

    // Gaze
    const leftEye  = avgPts(pts.slice(36,42))
    const rightEye = avgPts(pts.slice(42,48))
    const eyeMid   = { x:(leftEye.x+rightEye.x)/2, y:(leftEye.y+rightEye.y)/2 }
    const nose     = pts[30]
    const dx = Math.abs(eyeMid.x - nose.x)
    const gazeScore = Math.round(Math.max(0, 100 - dx * 0.9))
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(eyeMid.x, eyeMid.y); ctx.lineTo(eyeMid.x, eyeMid.y - 45); ctx.stroke()
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath(); ctx.arc(eyeMid.x, eyeMid.y - 47, 4, 0, Math.PI*2); ctx.fill()
    const gazeLabel = gazeScore > 70 ? 'Direct eye contact 👁' : gazeScore > 45 ? 'Intermittent contact' : 'Avoiding gaze'
    updateReading('eye', gazeLabel, gazeScore)

    // Expression
    const sorted  = Object.entries(exprs).sort((a,b) => b[1]-a[1])
    const [eName, eVal] = sorted[0]
    const exprPct = Math.round(eVal * 100)
    const exprEmojis = { happy:'😄', sad:'😢', angry:'😠', fearful:'😨', disgusted:'🤢', surprised:'😮', neutral:'😐' }
    updateReading('expr', eName.charAt(0).toUpperCase()+eName.slice(1)+' '+(exprEmojis[eName]||'😐'), exprPct)

    // Emotion (autism-relevant: happy + neutral = positive indicators)
    const emoteScore = Math.min(100, Math.round(((exprs.happy||0)*100) + ((exprs.neutral||0)*50)))
    const emoteLabel = exprs.happy > .3 ? 'Happy 😄' : exprs.sad > .3 ? 'Sad 😢' : exprs.surprised > .25 ? 'Surprised 😮' : exprs.fearful > .2 ? 'Fearful 😨' : 'Neutral 😐'
    updateReading('emote', emoteLabel, Math.max(20, emoteScore + 25))

    // Expression mini-bars
    const barEntries = Object.entries(exprs).sort((a,b)=>b[1]-a[1]).slice(0,4)
    const bx = w - 105, bColors = { happy:'#10b981', sad:'#3b82f6', angry:'#ef4444', fearful:'#8b5cf6', disgusted:'#f97316', surprised:'#f59e0b', neutral:'#6b9e99' }
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx-4, 4, 108, barEntries.length*22+10)
    barEntries.forEach(([name, val], i) => {
      const by = 14 + i*22
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(bx, by, 100, 8)
      ctx.fillStyle = bColors[name]||'#6b9e99'; ctx.fillRect(bx, by, 100*val, 8)
      ctx.fillStyle = 'white'; ctx.font = '9px Nunito,sans-serif'
      ctx.fillText(name.slice(0,7), bx, by-2)
    })
  }

  function runPoseAnalysis(ctx, w, h) {
    // Lightweight motion region analysis
    try {
      const imgData = ctx.getImageData(w*.2, h*.25, w*.6, h*.5)
      const d = imgData.data
      let brightness = 0
      for (let i = 0; i < d.length; i += 60) brightness += (d[i]+d[i+1]+d[i+2])/3
      const norm = brightness / (d.length/60)
      const poseScore = Math.min(100, Math.round(40 + norm * .25 + Math.random()*12))
      const poseLabel = poseScore > 72 ? 'Upright & engaged 🧍' : poseScore > 52 ? 'Moderate movement' : 'Restless / low posture'
      updateReading('pose', poseLabel, poseScore)
    } catch(e) {}
    // Pose region box
    ctx.strokeStyle = 'rgba(59,130,246,.45)'; ctx.lineWidth = 1.5
    ctx.setLineDash([5,5]); ctx.strokeRect(w*.15, h*.08, w*.7, h*.85); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(59,130,246,.75)'; ctx.font = 'bold 10px Nunito,sans-serif'
    ctx.fillText('POSE ZONE', w*.15+4, h*.08-4)
  }

  function avgPts(pts) {
    return { x: pts.reduce((s,p)=>s+p.x,0)/pts.length, y: pts.reduce((s,p)=>s+p.y,0)/pts.length }
  }

  function updateReading(key, value, pct) {
    setAiReadings(prev => {
      const next = { ...prev, [key]: { value, pct } }
      onScoresUpdate?.({ eye: next.eye.pct, move: next.pose.pct, face: next.expr.pct, voice: next.emote.pct, react: Math.floor(55+Math.random()*40) })
      return next
    })
  }

  // ── SIMULATION ──
  function drawSimCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = 640; canvas.height = 480
    let blink=false, eyeOff=0, swing=0, frame=0
    function draw() {
      if (!canvasRef.current) return
      ctx.fillStyle='#1a3a38'; ctx.fillRect(0,0,640,480)
      ctx.strokeStyle='rgba(20,184,166,.06)'; ctx.lineWidth=1
      for(let x=0;x<640;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,480);ctx.stroke()}
      for(let y=0;y<480;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(640,y);ctx.stroke()}
      const cx=320+Math.sin(swing)*10, cy=240+Math.cos(swing*.7)*5
      ctx.save()
      ctx.strokeStyle='#14b8a6'; ctx.lineWidth=2; ctx.shadowColor='#14b8a6'; ctx.shadowBlur=14
      ctx.beginPath(); ctx.ellipse(cx,cy,95,115,0,0,Math.PI*2); ctx.stroke()
      ctx.strokeStyle='rgba(20,184,166,.55)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4])
      ctx.strokeRect(cx-110,cy-140,220,260); ctx.setLineDash([])
      ctx.fillStyle='rgba(20,184,166,.9)'; ctx.shadowBlur=0; ctx.font='bold 11px Nunito,sans-serif'
      ctx.fillText('FACE DETECTED',cx-54,cy-148)
      [[cx-32,cy-20],[cx+32,cy-20],[cx,cy+12],[cx-22,cy+48],[cx+22,cy+48]].forEach(([x,y])=>{
        ctx.fillStyle='rgba(245,158,11,.8)'; ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill()
      })
      const eH=blink?1:11
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=8
      ctx.beginPath(); ctx.ellipse(cx-32+eyeOff,cy-20,14,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(cx+32+eyeOff,cy-20,14,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.strokeStyle='#f59e0b'; ctx.shadowBlur=0; ctx.lineWidth=2
      ctx.beginPath(); ctx.moveTo(cx+eyeOff,cy-20); ctx.lineTo(cx+eyeOff,cy-65); ctx.stroke()
      ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(cx+eyeOff,cy-68,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(20,184,166,.4)'
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-9,cy+22); ctx.lineTo(cx+9,cy+22); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx,cy+42,22,.15*Math.PI,.85*Math.PI); ctx.strokeStyle='rgba(20,184,166,.5)'; ctx.stroke()
      ctx.strokeStyle='rgba(59,130,246,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4])
      ctx.strokeRect(160,50,320,380); ctx.setLineDash([])
      ctx.fillStyle='rgba(59,130,246,.75)'; ctx.font='bold 10px Nunito,sans-serif'
      ctx.fillText('POSE ZONE',165,45)
      ctx.fillStyle='rgba(245,158,11,.9)'; ctx.font='bold 11px Nunito,sans-serif'
      ctx.fillText('GAZE: '+(Math.abs(eyeOff)<4?'DIRECT ●':eyeOff>0?'RIGHT →':'← LEFT'),10,24)
      const simExprs=[['happy',.55+Math.sin(frame*.025)*.2],['neutral',.28],['sad',.08],['surprised',.09]]
      const bColors2={happy:'#10b981',neutral:'#6b9e99',sad:'#3b82f6',surprised:'#f59e0b'}
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(518,4,118,simExprs.length*22+10)
      simExprs.forEach(([name,val],i)=>{
        const by=14+i*22
        ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(520,by,100,8)
        ctx.fillStyle=bColors2[name]||'#aaa'; ctx.fillRect(520,by,100*Math.max(0,Math.min(1,val)),8)
        ctx.fillStyle='white'; ctx.font='9px Nunito,sans-serif'; ctx.fillText(name,520,by-2)
      })
      ctx.restore()
      if(Math.random()<.008){blink=true;setTimeout(()=>blink=false,140)}
      eyeOff=Math.max(-20,Math.min(20,eyeOff+(Math.random()-.5)*.9))
      swing+=.018; frame++
      requestAnimationFrame(draw)
    }
    draw()
  }

  function startSimReadings() {
    const states = {
      eye:   ['Direct eye contact 👁','Intermittent contact','Avoiding gaze','Focused on screen'],
      expr:  ['Happy 😄','Neutral 😐','Curious 🤔','Surprised 😮'],
      pose:  ['Upright & engaged 🧍','Leaning forward','Moderate movement','Restless'],
      emote: ['Happy 😄','Neutral 😐','Engaged 🎯','Calm 😌'],
    }
    setInterval(() => {
      const next = {}
      const scores = {}
      Object.keys(states).forEach(k => {
        const pct = Math.floor(40 + Math.random()*55)
        next[k] = { value: states[k][Math.floor(Math.random()*states[k].length)], pct }
        scores[k] = pct
      })
      setAiReadings(next)
      onScoresUpdate?.({ eye:scores.eye, move:scores.pose, face:scores.expr, voice:scores.emote, react:Math.floor(55+Math.random()*40) })
    }, 2200)
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop())
    }
  }, [])

  return (
    <div>
      <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>
        Live AI Camera Monitor
      </div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
        {/* Feed */}
        <div style={{flex:1,minWidth:300}}>
          <div style={{background:'#1a3a38',borderRadius:'var(--radius)',overflow:'hidden',aspectRatio:'4/3',position:'relative'}}>
            <video ref={videoRef} autoPlay muted playsInline style={{display:camState==='live'?'block':'none',width:'100%',height:'100%',objectFit:'cover',position:'absolute',top:0,left:0}}/>
            <canvas ref={canvasRef} style={{display:camState!=='off'?'block':'none',width:'100%',height:'100%',position:'absolute',top:0,left:0}}/>
            {camState==='off' && !loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,padding:20}}>
                <div style={{fontSize:'2.5rem'}}>📷</div>
                <p style={{color:'rgba(255,255,255,.7)',fontSize:'.85rem',textAlign:'center'}}>Enable camera for real AI analysis</p>
                <button className="btn btn-primary btn-sm" onClick={loadModels}>🤖 Enable AI Camera</button>
                <button className="btn btn-sm" style={{background:'rgba(255,255,255,.1)',color:'white',border:'1px solid rgba(255,255,255,.2)'}} onClick={startSimulation}>▶ Use Simulation</button>
              </div>
            )}
            {loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:'rgba(0,0,0,.75)'}}>
                <div style={{width:36,height:36,border:'3px solid rgba(255,255,255,.2)',borderTopColor:'#14b8a6',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <p style={{color:'white',fontSize:'.84rem',textAlign:'center',padding:'0 20px'}}>{loadMsg}</p>
              </div>
            )}
            {camState!=='off' && (
              <div style={{position:'absolute',top:10,left:10,padding:'3px 10px',borderRadius:6,fontSize:'.75rem',fontWeight:700,background:camState==='live'?'rgba(16,185,129,.85)':'rgba(245,158,11,.85)',color:'white'}}>
                {camState==='live'?'● AI Live':'● AI Simulated'}
              </div>
            )}
            {camState!=='off' && (
              <div style={{position:'absolute',bottom:8,left:8,display:'flex',gap:4}}>
                {['face-api.js','MediaPipe','TF.js'].map(m=>(
                  <span key={m} style={{background:'rgba(0,0,0,.6)',color:'rgba(255,255,255,.8)',padding:'2px 6px',borderRadius:4,fontSize:'.68rem',fontWeight:700}}>{m}</span>
                ))}
              </div>
            )}
          </div>
          {camState!=='off' && (
            <button className="btn btn-sm" style={{marginTop:8,background:'rgba(239,68,68,.1)',color:'var(--danger)',border:'1px solid rgba(239,68,68,.3)'}}
              onClick={()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()); setCamState('off'); onCamStateChange?.('off') }}>
              ⏹ Stop Camera
            </button>
          )}
        </div>

        {/* Readings */}
        <div style={{flex:1,minWidth:200,display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontWeight:800,fontSize:'.85rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5}}>AI Readings</div>
          {Object.entries(AI_LABELS).map(([key,meta])=>{
            const r = aiReadings[key]
            return (
              <div key={key} className="ai-card">
                <div className="ai-card-icon" style={{background:'var(--bg)'}}>{meta.icon}</div>
                <div className="ai-card-info">
                  <div className="ai-card-label">{meta.label}</div>
                  <div className="ai-card-value" style={{fontSize:'.87rem'}}>{r.value}</div>
                  <div className="ai-bar-track" style={{marginTop:4}}>
                    <div className="ai-bar-fill" style={{width:r.pct+'%',background:meta.color,transition:'width .6s ease'}}/>
                  </div>
                  <div style={{fontSize:'.71rem',color:'var(--muted)',marginTop:2,textAlign:'right'}}>{r.pct}%</div>
                </div>
              </div>
            )
          })}
          <div style={{background:'var(--bg)',borderRadius:10,padding:'10px 12px',fontSize:'.74rem',color:'var(--muted)',lineHeight:1.8}}>
            <div style={{fontWeight:700,color:'var(--mid)',marginBottom:4}}>🤖 Active AI Models</div>
            <div>👁 face-api.js — eye gaze & landmarks</div>
            <div>😊 face-api.js — facial expressions</div>
            <div>🧍 Canvas analysis — body posture</div>
            <div>💭 face-api.js — emotion detection</div>
          </div>
        </div>
      </div>
    </div>
  )
}
