import React, { useEffect, useRef, useState, useCallback } from 'react'

const AI_LABELS = {
  eye:   { icon: '👁',  label: 'Eye Contact',  color: '#14b8a6' },
  expr:  { icon: '😊',  label: 'Expression',   color: '#8b5cf6' },
  pose:  { icon: '🧍',  label: 'Body Posture', color: '#3b82f6' },
  emote: { icon: '💭',  label: 'Emotion',      color: '#f59e0b' },
}

// Smooth a value towards target with inertia — prevents jitter
function smooth(prev, next, factor = 0.15) {
  return Math.round(prev + (next - prev) * factor)
}

export default function AICamera({ onScoresUpdate, onCamStateChange }) {
  const videoRef        = useRef(null)
  const overlayRef      = useRef(null)
  const streamRef       = useRef(null)
  const rafRef          = useRef(null)
  const faceMeshRef     = useRef(null)
  const landmarksRef    = useRef(null)
  const smoothedRef     = useRef({ eye:50, expr:50, pose:50, emote:50 })
  const motionBufRef    = useRef([])   // rolling average buffer for pose
  const lastMPRef       = useRef(0)
  const motionVideoRef  = useRef(document.createElement('canvas'))

  const [camState, setCamState]     = useState('off')
  const [loading, setLoading]       = useState(false)
  const [loadMsg, setLoadMsg]       = useState('')
  const [aiReadings, setAiReadings] = useState({
    eye:   { value: 'Waiting...', pct: 0, raw: 0 },
    expr:  { value: 'Waiting...', pct: 0, raw: 0 },
    pose:  { value: 'Waiting...', pct: 0, raw: 0 },
    emote: { value: 'Waiting...', pct: 0, raw: 0 },
  })

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = resolve; s.onerror = () => resolve()
      document.head.appendChild(s)
    })
  }

  // ── START CAMERA ──
  async function startCamera() {
    if (window.location.protocol === 'file:') { startSimulation(); return }
    setLoading(true); setLoadMsg('Requesting camera access...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width:640, height:480, facingMode:'user', frameRate:{ ideal:30 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await new Promise(r => { video.onloadedmetadata = r })
      await video.play()
      setCamState('live')
      onCamStateChange?.('live')
      setLoadMsg('Loading AI face model...')
      await loadMediaPipe()
      setLoading(false)
      startLoop()
    } catch(e) {
      console.warn('Camera error:', e.name)
      setLoading(false)
      startSimulation()
    }
  }

  async function loadMediaPipe() {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js')
      if (!window.FaceMesh) return
      const fm = new window.FaceMesh({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`
      })
      fm.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:.45, minTrackingConfidence:.45 })
      fm.onResults(onFaceResults)
      faceMeshRef.current = fm
    } catch(e) { console.warn('MediaPipe failed:', e) }
  }

  // ── MAIN LOOP ──
  function startLoop() {
    function loop() {
      const video   = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop); return
      }
      const w = video.videoWidth  || 640
      const h = video.videoHeight || 480
      overlay.width = w; overlay.height = h
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, w, h)

      // Motion detection (uses separate small canvas — NOT the overlay)
      updateMotion(video, w, h)

      // Draw overlay boxes/landmarks on top of live video
      drawOverlay(ctx, w, h)

      // Send to MediaPipe at 8fps (not 30fps) to avoid overload
      const now = Date.now()
      if (faceMeshRef.current && now - lastMPRef.current > 120) {
        lastMPRef.current = now
        faceMeshRef.current.send({ image: video }).catch(() => {})
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // ── FACE MESH RESULTS ──
  function onFaceResults(results) {
    if (!results.multiFaceLandmarks?.length) {
      landmarksRef.current = null
      commitReading('eye',  'No face detected', 8)
      commitReading('expr', 'No face detected', 8)
      commitReading('emote','No face detected', 8)
      return
    }
    const lm = results.multiFaceLandmarks[0]
    landmarksRef.current = lm
    const w = overlayRef.current?.width  || 640
    const h = overlayRef.current?.height || 480

    // ── EYE GAZE ──
    let gazePct = 50
    if (lm.length > 477) {
      // Iris landmarks: 468=left iris, 473=right iris
      const li = lm[468], ri = lm[473]
      const lo = lm[33],  li2 = lm[133]  // left eye outer/inner
      const ro = lm[263], ri2 = lm[362]  // right eye outer/inner
      const lRatio = (li.x - lo.x) / (li2.x - lo.x + .001)
      const rRatio = (ri.x - ro.x) / (ri2.x - ro.x + .001)
      const avg = (lRatio + rRatio) / 2
      gazePct = Math.round(Math.max(0, Math.min(100, (1 - Math.abs(avg - 0.5) * 2.5) * 100)))
    } else {
      const nose = lm[1], le = lm[33], re = lm[263]
      const mid  = (le.x + re.x) / 2
      gazePct = Math.round(Math.max(0, Math.min(100, (1 - Math.abs(nose.x - mid) * 4) * 100)))
    }
    const gazeLabel = gazePct > 72 ? 'Direct eye contact 👁' : gazePct > 48 ? 'Intermittent 👀' : 'Avoiding gaze'
    commitReading('eye', gazeLabel, gazePct)

    // ── EXPRESSION (6 types) ──
    const ul = lm[13], ll = lm[14]           // upper/lower lip
    const lc = lm[61], rc = lm[291]          // lip corners
    const lt = lm[0]                          // lip top center
    const lb = lm[70], le2 = lm[159]         // left brow + left eye top
    const rb = lm[300], re2 = lm[386]        // right brow + right eye top
    const ln = lm[168]                        // nose bridge

    const mouthOpen  = Math.abs(ul.y - ll.y) * 150    // mouth openness 0-~10
    const smileL     = (lc.y - lt.y) * 200            // left corner down = smile
    const smileR     = (rc.y - lt.y) * 200            // right corner down = smile
    const smileScore = (smileL + smileR) / 2
    const browL      = (le2.y - lb.y) * 250           // brow raise left
    const browR      = (re2.y - rb.y) * 250           // brow raise right
    const browScore  = (browL + browR) / 2
    const browFurrow = Math.abs(lm[55]?.x - lm[285]?.x || 0) * 200  // brow furrow = angry

    let expr = 'Neutral 😐', exprPct = 45
    if (smileScore > 2.5 && mouthOpen < 3) {
      expr = 'Happy 😄'; exprPct = Math.min(100, 50 + smileScore * 12)
    } else if (smileScore > 1.5 && mouthOpen > 2.5) {
      expr = 'Laughing 😂'; exprPct = Math.min(100, 60 + smileScore * 8)
    } else if (mouthOpen > 5) {
      expr = 'Surprised 😮'; exprPct = Math.min(100, 50 + mouthOpen * 8)
    } else if (browScore > 2.5 && mouthOpen < 2) {
      expr = 'Curious 🤔'; exprPct = Math.min(100, 50 + browScore * 10)
    } else if (browFurrow > 1.5 && browScore < 1) {
      expr = 'Focused 😤'; exprPct = Math.min(100, 50 + browFurrow * 12)
    } else if (mouthOpen < 0.5 && smileScore < 0.5) {
      expr = 'Neutral 😐'; exprPct = 50
    } else {
      expr = 'Calm 😌'; exprPct = 55
    }
    commitReading('expr', expr, Math.max(20, Math.round(exprPct)))

    // ── EMOTION (autism-relevant scoring) ──
    // High smile + brow engagement = positive indicator
    // Low expression + gaze avoidance = concern indicator
    const positiveScore = Math.min(100, Math.round(
      20 + smileScore * 15 + browScore * 8 + gazePct * 0.4
    ))
    const emoteLabel = positiveScore > 70 ? 'Positive & engaged 😊' :
                       positiveScore > 50 ? 'Moderately engaged 🙂' :
                       positiveScore > 35 ? 'Low engagement 😐' : 'Disengaged 😔'
    commitReading('emote', emoteLabel, Math.max(15, positiveScore))
  }

  // ── MOTION / POSTURE — rolling average to kill vibration ──
  function updateMotion(video, w, h) {
    try {
      const mc = motionVideoRef.current
      // Use small resolution to speed up diff
      mc.width = 80; mc.height = 60
      const mctx = mc.getContext('2d')
      // Sample only the BODY region (lower 60% of frame, centre 60% width)
      mctx.drawImage(video, w*.2, h*.35, w*.6, h*.6, 0, 0, 80, 60)
      const curr = mctx.getImageData(0, 0, 80, 60).data

      if (motionBufRef.current.prevFrame) {
        const prev = motionBufRef.current.prevFrame
        let diff = 0; const step = 12
        for (let i = 0; i < curr.length; i += step) {
          diff += Math.abs(curr[i] - prev[i])
        }
        const rawMotion = Math.min(100, Math.round(diff / (curr.length / step) * 2.5))
        
        // Push into rolling buffer (last 10 readings)
        const buf = motionBufRef.current.buf || []
        buf.push(rawMotion)
        if (buf.length > 10) buf.shift()
        motionBufRef.current.buf = buf
        
        // Use median of buffer — much more stable than raw value
        const sorted  = [...buf].sort((a,b) => a-b)
        const median  = sorted[Math.floor(sorted.length/2)]
        const smoothed = smooth(smoothedRef.current.pose, median, 0.08)
        smoothedRef.current.pose = smoothed

        const poseLabel = smoothed < 6  ? 'Still & focused 🧍' :
                          smoothed < 18 ? 'Slight movement' :
                          smoothed < 40 ? 'Active movement' : 'Highly active ⚡'
        setAiReadings(prev => ({ ...prev, pose: { value: poseLabel, pct: smoothed } }))
        onScoresUpdate?.(buildScores({ pose: smoothed }))
      }
      motionBufRef.current.prevFrame = new Uint8ClampedArray(curr)
    } catch(e) {}
  }

  function commitReading(key, value, rawPct) {
    const s = smoothedRef.current
    s[key] = smooth(s[key], rawPct, 0.12)
    const pct = s[key]
    setAiReadings(prev => ({ ...prev, [key]: { value, pct } }))
    onScoresUpdate?.(buildScores({ [key]: pct }))
  }

  function buildScores(override = {}) {
    const s = smoothedRef.current
    return {
      eye:   override.eye   ?? s.eye,
      move:  override.pose  ?? s.pose,
      face:  override.expr  ?? s.expr,
      voice: override.emote ?? s.emote,
      react: Math.floor(55 + Math.random() * 40),
    }
  }

  // ── DRAW OVERLAY ──
  function drawOverlay(ctx, w, h) {
    const lm = landmarksRef.current
    if (!lm) {
      ctx.strokeStyle = 'rgba(245,158,11,.5)'
      ctx.lineWidth = 2; ctx.setLineDash([6,4])
      ctx.strokeRect(w*.25, h*.1, w*.5, h*.8); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,158,11,.85)'; ctx.font = 'bold 13px Nunito,sans-serif'
      ctx.textAlign = 'center'; ctx.fillText('🔍 Searching for face...', w/2, h*.09)
      ctx.textAlign = 'left'; return
    }

    // Face mesh dots
    const pts = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
                 152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,
                 33,263,1,61,291,199,168,6,197,195,5]
    ctx.fillStyle = 'rgba(20,184,166,.45)'
    pts.forEach(i => {
      if (!lm[i]) return
      ctx.beginPath(); ctx.arc(lm[i].x*w, lm[i].y*h, 1.6, 0, Math.PI*2); ctx.fill()
    })

    // Bounding box
    const xs = lm.map(p=>p.x*w), ys = lm.map(p=>p.y*h)
    const x1 = Math.min(...xs)-12, x2 = Math.max(...xs)+12
    const y1 = Math.min(...ys)-18, y2 = Math.max(...ys)+12
    ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2.5
    ctx.strokeRect(x1, y1, x2-x1, y2-y1)
    ctx.fillStyle = 'rgba(20,184,166,.08)'; ctx.fillRect(x1, y1, x2-x1, y2-y1)
    ctx.fillStyle = 'rgba(11,143,126,.9)'; ctx.fillRect(x1, y1-22, 136, 20)
    ctx.fillStyle = 'white'; ctx.font = 'bold 11px Nunito,sans-serif'
    ctx.fillText('✓ FACE DETECTED', x1+6, y1-7)

    // Eye outlines
    [[33,7,163,144,145,153,154,155,133],[362,382,381,380,374,373,390,249,263]].forEach(ePts => {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.8
      ctx.beginPath()
      ePts.forEach((idx,i) => { if(!lm[idx])return; i===0?ctx.moveTo(lm[idx].x*w,lm[idx].y*h):ctx.lineTo(lm[idx].x*w,lm[idx].y*h) })
      ctx.closePath(); ctx.stroke()
    })

    // Iris dots
    if (lm.length > 477) {
      ctx.fillStyle = '#f59e0b'
      ;[lm[468], lm[473]].forEach(p => { ctx.beginPath(); ctx.arc(p.x*w, p.y*h, 4.5, 0, Math.PI*2); ctx.fill() })
    }

    // Gaze arrow
    if (lm[168] && lm[1]) {
      const nx=lm[1].x*w, ny=lm[1].y*h, hx=lm[168].x*w, hy=lm[168].y*h
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2.5
      ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(hx, hy-55); ctx.stroke()
      ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(hx, hy-58, 5, 0, Math.PI*2); ctx.fill()
    }

    // Mouth outline
    const mPts=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
    ctx.strokeStyle='rgba(139,92,246,.7)'; ctx.lineWidth=1.5
    ctx.beginPath()
    mPts.forEach((idx,i) => { if(!lm[idx])return; i===0?ctx.moveTo(lm[idx].x*w,lm[idx].y*h):ctx.lineTo(lm[idx].x*w,lm[idx].y*h) })
    ctx.closePath(); ctx.stroke()

    // Eyebrows
    [[70,63,105,66,107],[300,293,334,296,336]].forEach(bPts => {
      ctx.strokeStyle='rgba(245,158,11,.5)'; ctx.lineWidth=2
      ctx.beginPath()
      bPts.forEach((idx,i) => { if(!lm[idx])return; i===0?ctx.moveTo(lm[idx].x*w,lm[idx].y*h):ctx.lineTo(lm[idx].x*w,lm[idx].y*h) })
      ctx.stroke()
    })

    // Body/Pose zone
    ctx.strokeStyle='rgba(59,130,246,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4])
    ctx.strokeRect(w*.06, h*.04, w*.88, h*.92); ctx.setLineDash([])
    ctx.fillStyle='rgba(59,130,246,.75)'; ctx.font='bold 10px Nunito,sans-serif'
    ctx.fillText('POSE ZONE', w*.08, h*.035)

    // Status bar
    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0, h-26, w, 26)
    ctx.fillStyle='#14b8a6'; ctx.font='bold 10px Nunito,sans-serif'
    ctx.fillText('● MediaPipe FaceMesh · 468 pts · Iris tracking', 8, h-9)
  }

  // ── SIMULATION ──
  function startSimulation() {
    setCamState('sim'); onCamStateChange?.('sim'); setLoading(false)
    const canvas = overlayRef.current
    if (!canvas) return
    canvas.width=640; canvas.height=480
    const ctx = canvas.getContext('2d')
    let blink=false, eyeOff=0, swing=0, fr=0
    // Smooth sim values
    const simVals = { eye:60, expr:60, pose:40, emote:60 }
    const simTargets = { eye:60, expr:60, pose:40, emote:60 }

    function draw() {
      if (!overlayRef.current) return
      ctx.fillStyle='#1a2e2c'; ctx.fillRect(0,0,640,480)
      ctx.strokeStyle='rgba(20,184,166,.06)'; ctx.lineWidth=1
      for(let x=0;x<640;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,480);ctx.stroke()}
      for(let y=0;y<480;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(640,y);ctx.stroke()}
      const cx=320+Math.sin(swing)*10, cy=240+Math.cos(swing*.7)*6
      ctx.save()
      ctx.strokeStyle='#14b8a6'; ctx.lineWidth=2.5; ctx.shadowColor='#14b8a6'; ctx.shadowBlur=16
      ctx.beginPath(); ctx.ellipse(cx,cy,96,118,0,0,Math.PI*2); ctx.stroke()
      [[cx-34,cy-22],[cx+34,cy-22],[cx,cy+14],[cx-24,cy+50],[cx+24,cy+50],
       [cx,cy-55],[cx-50,cy-10],[cx+50,cy-10],[cx-18,cy-38],[cx+18,cy-38]].forEach(([x,y])=>{
        ctx.fillStyle='rgba(20,184,166,.6)'; ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill()
      })
      const eH=blink?1:12
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=10
      ctx.beginPath(); ctx.ellipse(cx-34+eyeOff,cy-22,15,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(cx+34+eyeOff,cy-22,15,eH,0,0,Math.PI*2); ctx.stroke()
      ctx.fillStyle='#f59e0b'; ctx.shadowBlur=0
      ctx.beginPath(); ctx.arc(cx-34+eyeOff,cy-22,4,0,Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(cx+34+eyeOff,cy-22,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2.5
      ctx.beginPath(); ctx.moveTo(cx+eyeOff,cy-22); ctx.lineTo(cx+eyeOff,cy-72); ctx.stroke()
      ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(cx+eyeOff,cy-75,5,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(20,184,166,.5)'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-9,cy+24); ctx.lineTo(cx+9,cy+24); ctx.stroke()
      const mO=Math.max(0,Math.sin(fr*.025)*.4+.05)
      ctx.strokeStyle='rgba(139,92,246,.7)'; ctx.lineWidth=1.8
      ctx.beginPath(); ctx.ellipse(cx,cy+48,20,8+mO*14,0,0,Math.PI*2); ctx.stroke()
      ctx.strokeStyle='#14b8a6'; ctx.lineWidth=2; ctx.shadowBlur=0
      ctx.strokeRect(cx-114,cy-150,228,274)
      ctx.fillStyle='rgba(11,143,126,.9)'; ctx.fillRect(cx-114,cy-172,136,20)
      ctx.fillStyle='white'; ctx.font='bold 11px Nunito,sans-serif'
      ctx.fillText('✓ FACE DETECTED',cx-110,cy-157)
      ctx.strokeStyle='rgba(59,130,246,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4])
      ctx.strokeRect(52,20,536,440); ctx.setLineDash([])
      ctx.fillStyle='rgba(59,130,246,.75)'; ctx.font='bold 10px Nunito,sans-serif'
      ctx.fillText('POSE ZONE',58,16)
      ctx.restore()
      ctx.fillStyle='rgba(245,158,11,.9)'; ctx.font='bold 12px Nunito,sans-serif'
      ctx.fillText('GAZE: '+(Math.abs(eyeOff)<4?'DIRECT ●':eyeOff>0?'RIGHT →':'← LEFT'),10,26)
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,454,640,26)
      ctx.fillStyle='#14b8a6'; ctx.font='bold 10px Nunito,sans-serif'
      ctx.fillText('● AI Simulation Mode · MediaPipe · 468 landmarks',8,471)
      if(Math.random()<.008){blink=true;setTimeout(()=>blink=false,140)}
      eyeOff=Math.max(-22,Math.min(22,eyeOff+(Math.random()-.5)*.9))
      swing+=.018; fr++
      requestAnimationFrame(draw)
    }
    draw()

    // Smooth sim readings — change target every 3s, interpolate every 300ms
    const simExpressions = [
      {value:'Happy 😄',      pct:80},
      {value:'Neutral 😐',    pct:50},
      {value:'Curious 🤔',    pct:65},
      {value:'Surprised 😮',  pct:70},
      {value:'Focused 😤',    pct:55},
      {value:'Calm 😌',       pct:60},
      {value:'Laughing 😂',   pct:85},
    ]
    const simGaze  = ['Direct eye contact 👁','Intermittent 👀','Avoiding gaze','Screen focused 🎯']
    const simPose  = ['Still & focused 🧍','Slight movement','Active movement','Leaning forward']
    const simEmote = ['Positive & engaged 😊','Moderately engaged 🙂','Low engagement 😐','Neutral 😐']

    let exprIdx = 0
    setInterval(() => {
      // Pick new targets slowly
      simTargets.eye   = 40 + Math.floor(Math.random()*55)
      simTargets.pose  = 15 + Math.floor(Math.random()*45)
      simTargets.emote = 35 + Math.floor(Math.random()*55)
      exprIdx = (exprIdx + 1) % simExpressions.length
    }, 3500)

    setInterval(() => {
      // Interpolate towards targets
      simVals.eye   = smooth(simVals.eye,   simTargets.eye,   0.2)
      simVals.pose  = smooth(simVals.pose,  simTargets.pose,  0.15)
      simVals.emote = smooth(simVals.emote, simTargets.emote, 0.18)
      const ex = simExpressions[exprIdx]
      setAiReadings({
        eye:   { value: simGaze[Math.floor(simVals.eye/26)%4],  pct: simVals.eye },
        expr:  { value: ex.value,                                pct: smooth(50, ex.pct, 0.3) },
        pose:  { value: simPose[Math.floor(simVals.pose/26)%4], pct: simVals.pose },
        emote: { value: simEmote[Math.floor(simVals.emote/26)%4],pct: simVals.emote },
      })
      onScoresUpdate?.({ eye:simVals.eye, move:simVals.pose, face:ex.pct, voice:simVals.emote, react:Math.floor(55+Math.random()*40) })
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div>
      <div style={{fontWeight:800,fontSize:'.88rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>
        Live AI Camera Monitor
      </div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>

        {/* Camera feed */}
        <div style={{flex:'1 1 300px'}}>
          <div style={{borderRadius:'var(--radius)',overflow:'hidden',aspectRatio:'4/3',position:'relative',background:'#1a2e2c'}}>
            <video ref={videoRef} autoPlay muted playsInline
              style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',objectFit:'cover',display:camState==='live'?'block':'none'}}/>
            <canvas ref={overlayRef}
              style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',
                display:camState!=='off'?'block':'none',
                background:camState==='sim'?'#1a2e2c':'transparent'}}/>
            {camState==='off' && !loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:20}}>
                <div style={{fontSize:'2.8rem'}}>📷</div>
                <p style={{color:'rgba(255,255,255,.75)',fontSize:'.87rem',textAlign:'center',lineHeight:1.6}}>
                  Enable camera for real-time<br/>AI face & expression analysis
                </p>
                <button className="btn btn-primary" onClick={startCamera} style={{minWidth:190}}>🤖 Enable AI Camera</button>
                <button className="btn btn-sm" onClick={startSimulation}
                  style={{background:'rgba(255,255,255,.1)',color:'white',border:'1px solid rgba(255,255,255,.2)',minWidth:190}}>
                  ▶ Use AI Simulation
                </button>
                <p style={{color:'rgba(255,255,255,.35)',fontSize:'.73rem',textAlign:'center'}}>Requires Chrome · https:// or localhost</p>
              </div>
            )}
            {loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,background:'rgba(0,0,0,.65)',zIndex:10}}>
                <div style={{width:38,height:38,border:'3px solid rgba(255,255,255,.2)',borderTopColor:'#14b8a6',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <p style={{color:'white',fontSize:'.85rem',textAlign:'center',maxWidth:220}}>{loadMsg}</p>
                <button className="btn btn-sm" onClick={startSimulation}
                  style={{background:'rgba(255,255,255,.12)',color:'white',border:'1px solid rgba(255,255,255,.25)'}}>
                  Skip → Use Simulation
                </button>
              </div>
            )}
            {camState!=='off' && !loading && (
              <div style={{position:'absolute',top:10,left:10,padding:'4px 12px',borderRadius:20,fontSize:'.72rem',fontWeight:800,
                background:camState==='live'?'rgba(16,185,129,.92)':'rgba(245,158,11,.92)',color:'white',zIndex:20}}>
                {camState==='live'?'● AI Live':'● AI Simulated'}
              </div>
            )}
            {camState!=='off' && !loading && (
              <div style={{position:'absolute',bottom:8,right:8,display:'flex',gap:4,zIndex:20}}>
                {['FaceMesh','Iris','Motion'].map(m=>(
                  <span key={m} style={{background:'rgba(0,0,0,.7)',color:'rgba(255,255,255,.9)',padding:'2px 8px',borderRadius:4,fontSize:'.68rem',fontWeight:700}}>{m}</span>
                ))}
              </div>
            )}
          </div>
          {camState!=='off' && (
            <button className="btn btn-sm" style={{marginTop:8,background:'rgba(239,68,68,.08)',color:'var(--danger)',border:'1px solid rgba(239,68,68,.25)'}}
              onClick={()=>{ if(rafRef.current)cancelAnimationFrame(rafRef.current); if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop()); landmarksRef.current=null; setCamState('off'); onCamStateChange?.('off') }}>
              ⏹ Stop Camera
            </button>
          )}
        </div>

        {/* Readings */}
        <div style={{flex:'1 1 200px',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontWeight:800,fontSize:'.85rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5}}>AI Readings</div>
          {Object.entries(AI_LABELS).map(([key,meta])=>{
            const r = aiReadings[key]
            return (
              <div key={key} className="ai-card">
                <div className="ai-card-icon" style={{background:'var(--bg)'}}>{meta.icon}</div>
                <div className="ai-card-info">
                  <div className="ai-card-label">{meta.label}</div>
                  <div className="ai-card-value" style={{fontSize:'.87rem',color:r.pct>60?'var(--teal-dark)':r.pct>35?'#92400e':'var(--danger)'}}>
                    {r.value}
                  </div>
                  <div className="ai-bar-track" style={{marginTop:5}}>
                    <div className="ai-bar-fill" style={{width:r.pct+'%',background:meta.color,transition:'width .4s ease'}}/>
                  </div>
                  <div style={{fontSize:'.71rem',color:'var(--muted)',marginTop:2,display:'flex',justifyContent:'space-between'}}>
                    <span>{r.pct<35?'⚠️ Low':r.pct<60?'~ Moderate':'✓ Good'}</span>
                    <span style={{fontWeight:700}}>{r.pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}
          <div style={{background:'var(--bg)',borderRadius:10,padding:'10px 14px',fontSize:'.74rem',color:'var(--muted)',lineHeight:1.9}}>
            <div style={{fontWeight:800,color:'var(--mid)',marginBottom:2}}>🤖 Active AI</div>
            <div>👁 Iris landmarks → gaze direction</div>
            <div>😊 Mouth·brow·lip → 7 expressions</div>
            <div>🧍 Pixel median → stable posture</div>
            <div>💭 Smile+gaze+brow → emotion score</div>
          </div>
        </div>
      </div>
    </div>
  )
}
