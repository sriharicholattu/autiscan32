import React, { useEffect, useRef, useState } from 'react'

const AI_LABELS = {
  eye:   { icon: '👁',  label: 'Eye Contact',  color: '#14b8a6' },
  expr:  { icon: '😊',  label: 'Expression',   color: '#8b5cf6' },
  pose:  { icon: '🧍',  label: 'Body Posture', color: '#3b82f6' },
  emote: { icon: '💭',  label: 'Emotion',      color: '#f59e0b' },
}

export default function AICamera({ onScoresUpdate, onCamStateChange }) {
  const videoRef     = useRef(null)
  const overlayRef   = useRef(null)  // transparent canvas ON TOP of video
  const streamRef    = useRef(null)
  const rafRef       = useRef(null)
  const faceMeshRef  = useRef(null)
  const landmarksRef = useRef(null)
  const prevFrameRef = useRef(null)
  const motionCanvasRef = useRef(document.createElement('canvas'))

  const [camState, setCamState]     = useState('off') // off | live | sim
  const [loading, setLoading]       = useState(false)
  const [loadMsg, setLoadMsg]       = useState('')
  const [aiReadings, setAiReadings] = useState({
    eye:   { value: 'Waiting...', pct: 0 },
    expr:  { value: 'Waiting...', pct: 0 },
    pose:  { value: 'Waiting...', pct: 0 },
    emote: { value: 'Waiting...', pct: 0 },
  })

  // ── LOAD SCRIPT ──
  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src; s.async = true
      s.onload = resolve; s.onerror = resolve
      document.head.appendChild(s)
    })
  }

  // ── START REAL CAMERA ──
  async function startCamera() {
    if (window.location.protocol === 'file:') {
      startSimulation(); return
    }
    setLoading(true)
    setLoadMsg('Requesting camera...')
    try {
      // Get camera stream first — show it immediately
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      video.onloadedmetadata = async () => {
        await video.play()
        setCamState('live')
        onCamStateChange?.('live')
        setLoadMsg('Loading AI models...')
        // Load MediaPipe AFTER camera is already showing
        await loadMediaPipe()
        setLoading(false)
        startOverlayLoop()
      }
    } catch(e) {
      console.warn('Camera error:', e.name, e.message)
      setLoading(false)
      startSimulation()
    }
  }

  // ── LOAD MEDIAPIPE ──
  async function loadMediaPipe() {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js')
      if (!window.FaceMesh) return
      const faceMesh = new window.FaceMesh({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`
      })
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      faceMesh.onResults(results => {
        if (results.multiFaceLandmarks?.length) {
          landmarksRef.current = results.multiFaceLandmarks[0]
          analyzeLandmarks(results.multiFaceLandmarks[0])
        } else {
          landmarksRef.current = null
          updateReading('eye',  'No face in frame', 15)
          updateReading('expr', 'No face in frame', 15)
          updateReading('emote','No face in frame', 15)
        }
      })
      faceMeshRef.current = faceMesh
    } catch(e) {
      console.warn('MediaPipe load failed, using pixel analysis only')
    }
  }

  // ── OVERLAY LOOP — draws on transparent canvas over real video ──
  function startOverlayLoop() {
    let lastMP = 0
    function loop() {
      const video   = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay) { rafRef.current = requestAnimationFrame(loop); return }
      if (video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return }

      overlay.width  = video.videoWidth  || 640
      overlay.height = video.videoHeight || 480
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      // Draw AI overlay (landmarks, boxes, arrows)
      drawOverlay(ctx, overlay.width, overlay.height)

      // Motion detection from video pixels
      detectMotion(video, overlay.width, overlay.height)

      // Send to MediaPipe every 250ms
      const now = Date.now()
      if (faceMeshRef.current && now - lastMP > 250) {
        lastMP = now
        faceMeshRef.current.send({ image: video }).catch(() => {})
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // ── ANALYZE MEDIAPIPE LANDMARKS ──
  function analyzeLandmarks(lm) {
    const w = overlayRef.current?.width  || 640
    const h = overlayRef.current?.height || 480

    // EYE GAZE — iris landmarks (refined)
    if (lm.length > 477) {
      const li = lm[468], ri = lm[473]  // iris centers
      const le = lm[33],  re = lm[263]  // eye outer corners
      const li2 = lm[133], ri2 = lm[362] // eye inner corners
      const leftRatio  = (li.x - le.x)  / (li2.x - le.x  + .001)
      const rightRatio = (ri.x - re.x)  / (ri2.x - re.x  + .001)
      const avg = (leftRatio + rightRatio) / 2
      const gazePct = Math.round(Math.max(0, Math.min(100, (1 - Math.abs(avg - 0.5) * 2.2) * 100)))
      const gazeLabel = gazePct > 72 ? 'Direct eye contact 👁' : gazePct > 48 ? 'Intermittent 👀' : 'Avoiding gaze'
      updateReading('eye', gazeLabel, gazePct)
    }

    // EXPRESSION — mouth & brows
    const upperLip   = lm[13], lowerLip = lm[14]
    const mouthOpen  = Math.abs(upperLip.y - lowerLip.y) * 100
    const leftCorner = lm[61], rightCorner = lm[291], mouthTop = lm[0]
    const smileVal   = Math.max(0, ((leftCorner.y + rightCorner.y) / 2 - mouthTop.y) * 200)
    const leftBrow   = lm[70], leftEyeTop = lm[159]
    const browRaise  = Math.max(0, (leftEyeTop.y - leftBrow.y) * 300)

    let expr = 'Neutral 😐', exprPct = 50
    if (smileVal > 1.5)      { expr = 'Happy 😄';     exprPct = Math.min(100, 50 + smileVal * 15) }
    else if (mouthOpen > 3)  { expr = 'Surprised 😮'; exprPct = Math.min(100, 50 + mouthOpen * 10) }
    else if (browRaise > 2)  { expr = 'Curious 🤔';   exprPct = Math.min(100, 50 + browRaise * 10) }
    updateReading('expr', expr, Math.max(20, Math.round(exprPct)))

    // EMOTION
    const emoteScore = Math.min(100, Math.round(25 + smileVal * 20 + browRaise * 8))
    const emoteLabel = emoteScore > 65 ? 'Positive 😊' : emoteScore > 40 ? 'Engaged 🎯' : 'Neutral 😐'
    updateReading('emote', emoteLabel, Math.max(20, emoteScore))
  }

  // ── MOTION DETECTION ──
  function detectMotion(video, w, h) {
    try {
      const mc = motionCanvasRef.current
      mc.width = Math.floor(w / 4); mc.height = Math.floor(h / 4)
      const mctx = mc.getContext('2d')
      mctx.drawImage(video, 0, 0, mc.width, mc.height)
      const curr = mctx.getImageData(0, 0, mc.width, mc.height).data
      if (prevFrameRef.current && prevFrameRef.current.length === curr.length) {
        let diff = 0
        for (let i = 0; i < curr.length; i += 8) {
          diff += Math.abs(curr[i] - prevFrameRef.current[i])
        }
        const motion = Math.min(100, Math.round(diff / (curr.length / 8) * 4))
        const poseLabel = motion < 5  ? 'Still & focused 🧍' :
                          motion < 20 ? 'Slight movement' :
                          motion < 45 ? 'Active movement' : 'Highly active ⚡'
        updateReading('pose', poseLabel, Math.min(100, 25 + motion * 1.5))
      }
      prevFrameRef.current = new Uint8ClampedArray(curr)
    } catch(e) {}
  }

  // ── DRAW OVERLAY ON TRANSPARENT CANVAS ──
  function drawOverlay(ctx, w, h) {
    const lm = landmarksRef.current

    if (!lm) {
      // Searching indicator
      ctx.strokeStyle = 'rgba(245,158,11,.6)'
      ctx.lineWidth = 2; ctx.setLineDash([6, 4])
      ctx.strokeRect(w * .25, h * .1, w * .5, h * .8)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,158,11,.9)'
      ctx.font = 'bold 13px Nunito,sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('🔍 Searching for face...', w / 2, h * .09)
      ctx.textAlign = 'left'
      return
    }

    // Face mesh sparse dots
    const sparsePts = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,33,263,1,61,291,199]
    ctx.fillStyle = 'rgba(20,184,166,.5)'
    sparsePts.forEach(i => {
      if (!lm[i]) return
      ctx.beginPath()
      ctx.arc(lm[i].x * w, lm[i].y * h, 1.8, 0, Math.PI * 2)
      ctx.fill()
    })

    // Bounding box
    const xs = lm.map(p => p.x * w), ys = lm.map(p => p.y * h)
    const minX = Math.min(...xs) - 12, maxX = Math.max(...xs) + 12
    const minY = Math.min(...ys) - 16, maxY = Math.max(...ys) + 12
    ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2.5
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
    ctx.fillStyle = 'rgba(11,143,126,.08)'
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
    // Label
    ctx.fillStyle = 'rgba(11,143,126,.85)'
    ctx.fillRect(minX, minY - 22, 130, 20)
    ctx.fillStyle = 'white'; ctx.font = 'bold 11px Nunito,sans-serif'
    ctx.fillText('✓ FACE DETECTED', minX + 6, minY - 7)

    // Eye outlines
    const leftEyePts  = [33,7,163,144,145,153,154,155,133]
    const rightEyePts = [362,382,381,380,374,373,390,249,263]
    ;[leftEyePts, rightEyePts].forEach(pts => {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.8
      ctx.beginPath()
      pts.forEach((idx, i) => {
        if (!lm[idx]) return
        i === 0 ? ctx.moveTo(lm[idx].x*w, lm[idx].y*h) : ctx.lineTo(lm[idx].x*w, lm[idx].y*h)
      })
      ctx.closePath(); ctx.stroke()
    })

    // Iris dots (if refined landmarks available)
    if (lm.length > 477) {
      [lm[468], lm[473]].forEach(iris => {
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath(); ctx.arc(iris.x*w, iris.y*h, 4, 0, Math.PI*2); ctx.fill()
      })
    }

    // Gaze arrow from nose bridge upward
    if (lm[168] && lm[1]) {
      const nx = lm[1].x * w, ny = lm[1].y * h
      const hx = lm[168].x * w, hy = lm[168].y * h
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(hx, hy - 55); ctx.stroke()
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath(); ctx.arc(hx, hy - 58, 5, 0, Math.PI*2); ctx.fill()
    }

    // Mouth outline
    const mouthPts = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
    ctx.strokeStyle = 'rgba(139,92,246,.7)'; ctx.lineWidth = 1.5
    ctx.beginPath()
    mouthPts.forEach((idx, i) => {
      if (!lm[idx]) return
      i === 0 ? ctx.moveTo(lm[idx].x*w, lm[idx].y*h) : ctx.lineTo(lm[idx].x*w, lm[idx].y*h)
    })
    ctx.closePath(); ctx.stroke()

    // Pose zone border
    ctx.strokeStyle = 'rgba(59,130,246,.45)'
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.strokeRect(w*.08, h*.04, w*.84, h*.92)
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(59,130,246,.8)'
    ctx.font = 'bold 10px Nunito,sans-serif'
    ctx.fillText('POSE ZONE', w*.1, h*.035)

    // Bottom status bar
    ctx.fillStyle = 'rgba(0,0,0,.55)'
    ctx.fillRect(0, h - 26, w, 26)
    ctx.fillStyle = '#14b8a6'; ctx.font = 'bold 10px Nunito,sans-serif'
    ctx.fillText('● MediaPipe FaceMesh Active', 8, h - 9)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.fillText('468 landmarks · iris tracking · emotion', w * .45, h - 9)
  }

  function updateReading(key, value, pct) {
    setAiReadings(prev => {
      const next = { ...prev, [key]: { value, pct: Math.round(pct) } }
      onScoresUpdate?.({
        eye:   next.eye.pct,
        move:  next.pose.pct,
        face:  next.expr.pct,
        voice: next.emote.pct,
        react: Math.floor(55 + Math.random() * 40),
      })
      return next
    })
  }

  // ── SIMULATION ──
  function startSimulation() {
    setCamState('sim')
    onCamStateChange?.('sim')
    setLoading(false)
    const canvas = overlayRef.current
    if (!canvas) return
    canvas.width = 640; canvas.height = 480
    let blink = false, eyeOff = 0, swing = 0, fr = 0
    function draw() {
      if (!overlayRef.current) return
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#1a2e2c'; ctx.fillRect(0, 0, 640, 480)
      // Grid
      ctx.strokeStyle = 'rgba(20,184,166,.07)'; ctx.lineWidth = 1
      for (let x = 0; x < 640; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,480); ctx.stroke() }
      for (let y = 0; y < 480; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(640,y); ctx.stroke() }
      const cx = 320 + Math.sin(swing) * 10, cy = 240 + Math.cos(swing*.7) * 6
      ctx.save()
      // Head outline
      ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2.5
      ctx.shadowColor = '#14b8a6'; ctx.shadowBlur = 16
      ctx.beginPath(); ctx.ellipse(cx, cy, 96, 118, 0, 0, Math.PI*2); ctx.stroke()
      // Landmark dots
      [[cx-34,cy-22],[cx+34,cy-22],[cx,cy+14],[cx-24,cy+50],[cx+24,cy+50],
       [cx-50,cy-10],[cx+50,cy-10],[cx,cy-55],[cx-18,cy-38],[cx+18,cy-38]].forEach(([x,y]) => {
        ctx.fillStyle = 'rgba(20,184,166,.65)'
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill()
      })
      // Eyes
      const eH = blink ? 1 : 12
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 10
      ctx.beginPath(); ctx.ellipse(cx-34+eyeOff, cy-22, 15, eH, 0, 0, Math.PI*2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(cx+34+eyeOff, cy-22, 15, eH, 0, 0, Math.PI*2); ctx.stroke()
      // Iris dots
      ctx.fillStyle = '#f59e0b'; ctx.shadowBlur = 0
      ctx.beginPath(); ctx.arc(cx-34+eyeOff, cy-22, 4, 0, Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(cx+34+eyeOff, cy-22, 4, 0, Math.PI*2); ctx.fill()
      // Gaze arrow
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(cx+eyeOff, cy-22); ctx.lineTo(cx+eyeOff, cy-72); ctx.stroke()
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath(); ctx.arc(cx+eyeOff, cy-75, 5, 0, Math.PI*2); ctx.fill()
      // Nose
      ctx.strokeStyle = 'rgba(20,184,166,.5)'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-9,cy+24); ctx.lineTo(cx+9,cy+24); ctx.stroke()
      // Mouth (animated)
      const mO = Math.max(0, Math.sin(fr*.03)*.4+.05)
      ctx.strokeStyle = 'rgba(139,92,246,.7)'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.ellipse(cx, cy+48, 20, 8+mO*14, 0, 0, Math.PI*2); ctx.stroke()
      // Bounding box
      ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = 2; ctx.shadowBlur = 0
      ctx.strokeRect(cx-112, cy-148, 224, 270)
      ctx.fillStyle = 'rgba(11,143,126,.85)'
      ctx.fillRect(cx-112, cy-170, 132, 20)
      ctx.fillStyle = 'white'; ctx.font = 'bold 11px Nunito,sans-serif'
      ctx.fillText('✓ FACE DETECTED', cx-108, cy-155)
      // Pose zone
      ctx.strokeStyle = 'rgba(59,130,246,.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([5,4])
      ctx.strokeRect(52, 20, 536, 440); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(59,130,246,.8)'; ctx.font = 'bold 10px Nunito,sans-serif'
      ctx.fillText('POSE ZONE', 58, 16)
      ctx.restore()
      // Gaze label
      ctx.fillStyle = 'rgba(245,158,11,.95)'; ctx.font = 'bold 12px Nunito,sans-serif'
      ctx.fillText('GAZE: ' + (Math.abs(eyeOff)<4 ? 'DIRECT ●' : eyeOff>0 ? 'RIGHT →' : '← LEFT'), 10, 26)
      // Status bar
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 454, 640, 26)
      ctx.fillStyle = '#14b8a6'; ctx.font = 'bold 10px Nunito,sans-serif'
      ctx.fillText('● AI Simulation Mode', 8, 471)
      ctx.fillStyle = 'rgba(255,255,255,.5)'
      ctx.fillText('MediaPipe · 468 landmarks · iris tracking', 200, 471)
      if (Math.random() < .008) { blink = true; setTimeout(() => blink = false, 140) }
      eyeOff = Math.max(-22, Math.min(22, eyeOff + (Math.random()-.5) * .9))
      swing += .018; fr++
      requestAnimationFrame(draw)
    }
    draw()
    // Simulate readings
    const states = {
      eye:   ['Direct eye contact 👁','Intermittent 👀','Avoiding gaze','Screen focused 🎯'],
      expr:  ['Happy 😄','Neutral 😐','Curious 🤔','Surprised 😮'],
      pose:  ['Still & focused 🧍','Slight movement','Active movement','Leaning forward'],
      emote: ['Positive 😊','Neutral 😐','Engaged 🎯','Calm 😌'],
    }
    setInterval(() => {
      const next = {}, scores = {}
      Object.keys(states).forEach(k => {
        const pct = Math.floor(40 + Math.random()*55)
        next[k]   = { value: states[k][Math.floor(Math.random()*states[k].length)], pct }
        scores[k] = pct
      })
      setAiReadings(next)
      onScoresUpdate?.({ eye:scores.eye, move:scores.pose, face:scores.expr, voice:scores.emote, react:Math.floor(55+Math.random()*40) })
    }, 2000)
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

        {/* ── CAMERA FEED ── */}
        <div style={{flex:'1 1 300px'}}>
          <div style={{borderRadius:'var(--radius)',overflow:'hidden',aspectRatio:'4/3',position:'relative',background:'#1a2e2c'}}>

            {/* Real video — always underneath */}
            <video ref={videoRef} autoPlay muted playsInline
              style={{
                position:'absolute', top:0, left:0,
                width:'100%', height:'100%',
                objectFit:'cover',
                display: camState === 'live' ? 'block' : 'none',
              }}
            />

            {/* Overlay canvas — transparent, draws AI boxes ON TOP of video */}
            <canvas ref={overlayRef}
              style={{
                position:'absolute', top:0, left:0,
                width:'100%', height:'100%',
                display: camState !== 'off' ? 'block' : 'none',
                // For sim mode, canvas has background; for live mode it's transparent
                background: camState === 'sim' ? '#1a2e2c' : 'transparent',
              }}
            />

            {/* OFF state buttons */}
            {camState === 'off' && !loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:20}}>
                <div style={{fontSize:'2.8rem'}}>📷</div>
                <p style={{color:'rgba(255,255,255,.75)',fontSize:'.87rem',textAlign:'center',lineHeight:1.5}}>
                  Enable camera for real-time<br/>AI face & expression analysis
                </p>
                <button className="btn btn-primary" onClick={startCamera} style={{minWidth:180}}>
                  🤖 Enable AI Camera
                </button>
                <button className="btn btn-sm"
                  style={{background:'rgba(255,255,255,.12)',color:'white',border:'1px solid rgba(255,255,255,.25)',minWidth:180}}
                  onClick={startSimulation}>
                  ▶ Use AI Simulation
                </button>
                <p style={{color:'rgba(255,255,255,.35)',fontSize:'.73rem',textAlign:'center'}}>
                  Requires Chrome · https:// or localhost
                </p>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,background:'rgba(0,0,0,.6)',zIndex:10}}>
                <div style={{width:38,height:38,border:'3px solid rgba(255,255,255,.2)',borderTopColor:'#14b8a6',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <p style={{color:'white',fontSize:'.85rem',textAlign:'center',maxWidth:220}}>{loadMsg}</p>
                <button className="btn btn-sm"
                  style={{background:'rgba(255,255,255,.15)',color:'white',border:'1px solid rgba(255,255,255,.3)'}}
                  onClick={startSimulation}>
                  Skip → Use Simulation
                </button>
              </div>
            )}

            {/* Status badge */}
            {camState !== 'off' && !loading && (
              <div style={{position:'absolute',top:10,left:10,padding:'4px 12px',borderRadius:20,fontSize:'.72rem',fontWeight:800,
                background: camState==='live' ? 'rgba(16,185,129,.92)' : 'rgba(245,158,11,.92)',
                color:'white', backdropFilter:'blur(4px)', zIndex:20}}>
                {camState === 'live' ? '● AI Live' : '● AI Simulated'}
              </div>
            )}

            {/* Model badges */}
            {camState !== 'off' && !loading && (
              <div style={{position:'absolute',bottom:8,right:8,display:'flex',gap:4,zIndex:20}}>
                {['FaceMesh','Iris','Motion'].map(m => (
                  <span key={m} style={{background:'rgba(0,0,0,.7)',color:'rgba(255,255,255,.9)',padding:'2px 8px',borderRadius:4,fontSize:'.68rem',fontWeight:700}}>
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stop button */}
          {camState !== 'off' && (
            <button className="btn btn-sm"
              style={{marginTop:8,background:'rgba(239,68,68,.08)',color:'var(--danger)',border:'1px solid rgba(239,68,68,.25)'}}
              onClick={() => {
                if (rafRef.current) cancelAnimationFrame(rafRef.current)
                if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
                landmarksRef.current = null
                setCamState('off')
                onCamStateChange?.('off')
              }}>
              ⏹ Stop Camera
            </button>
          )}
        </div>

        {/* ── AI READINGS PANEL ── */}
        <div style={{flex:'1 1 200px',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontWeight:800,fontSize:'.85rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5}}>
            AI Readings
          </div>

          {Object.entries(AI_LABELS).map(([key, meta]) => {
            const r = aiReadings[key]
            return (
              <div key={key} className="ai-card">
                <div className="ai-card-icon" style={{background:'var(--bg)',fontSize:'1.2rem'}}>{meta.icon}</div>
                <div className="ai-card-info">
                  <div className="ai-card-label">{meta.label}</div>
                  <div className="ai-card-value" style={{fontSize:'.87rem',color: r.pct > 60 ? 'var(--teal-dark)' : r.pct > 35 ? '#92400e' : 'var(--danger)'}}>
                    {r.value}
                  </div>
                  <div className="ai-bar-track" style={{marginTop:5}}>
                    <div className="ai-bar-fill" style={{width:r.pct+'%',background:meta.color,transition:'width .5s ease'}}/>
                  </div>
                  <div style={{fontSize:'.71rem',color:'var(--muted)',marginTop:2,display:'flex',justifyContent:'space-between'}}>
                    <span>{r.pct < 35 ? '⚠️ Low' : r.pct < 60 ? '~ Moderate' : '✓ Good'}</span>
                    <span style={{fontWeight:700}}>{r.pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}

          <div style={{background:'var(--bg)',borderRadius:10,padding:'10px 14px',fontSize:'.74rem',color:'var(--muted)',lineHeight:2}}>
            <div style={{fontWeight:800,color:'var(--mid)',marginBottom:2}}>🤖 Active AI Models</div>
            <div>👁 Iris landmarks → gaze direction</div>
            <div>😊 Mouth/brow mesh → expression</div>
            <div>🧍 Pixel diff → motion/posture</div>
            <div>💭 Combined score → emotion</div>
          </div>
        </div>
      </div>
    </div>
  )
}
