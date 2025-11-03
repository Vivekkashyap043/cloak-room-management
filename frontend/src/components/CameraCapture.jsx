import React, { useEffect, useRef, useState } from 'react'

export default function CameraCapture({ onClose, onCapture, preferredFacing = 'environment' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facingMode, setFacingMode] = useState(preferredFacing)
  const [error, setError] = useState('')

  useEffect(() => {
    startStream()
    return () => stopStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  async function startStream() {
    try {
      setError('')
      stopStream()
      // Try preferred facingMode first, then fall back to a generic video constraint
      let stream = null
      try {
        const constraints = { video: { facingMode } }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (firstErr) {
        // first attempt failed (some browsers are picky about facingMode); try a generic video constraint
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
        } catch (secondErr) {
          throw secondErr
        }
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // play() can reject on autoplay policies; ignore play errors but leave stream active
        try { await videoRef.current.play() } catch (playErr) { /* ignore */ }
      }
    } catch (err) {
      console.error('camera start error', err)
      setError('Unable to access camera. Please allow camera permission or try a different browser.')
    }
  }

  function stopStream() {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { t.stop() } catch (e) { /* ignore */ }
        })
        streamRef.current = null
      }
      if (videoRef.current) {
        try { videoRef.current.pause() } catch (e) { /* ignore */ }
        try { videoRef.current.srcObject = null } catch (e) { /* ignore */ }
        try { videoRef.current.removeAttribute('src'); videoRef.current.load && videoRef.current.load() } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('stopStream error', err)
    }
  }

  function handleCapture() {
    const video = videoRef.current
    if (!video || !videoRef.current || error) return
    try {
      // Capture at the video resolution but scale down to a max dimension
      const origW = video.videoWidth || 640
      const origH = video.videoHeight || 480
      const maxDim = 1280 // target max width/height to keep uploads reasonably small
      const scale = Math.min(1, maxDim / Math.max(origW, origH))
      const w = Math.round(origW * scale)
      const h = Math.round(origH * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, w, h)
      // stop stream immediately so camera is closed as soon as capture happens
      stopStream()
      // export compressed JPEG; lower quality helps keep file size down on mobile
      canvas.toBlob(blob => {
        if (!blob) return setError('Capture failed')
        onCapture(blob)
      }, 'image/jpeg', 0.75)
    } catch (ex) {
      console.error('capture error', ex)
      setError('Capture failed')
      stopStream()
    }
  }

  function toggleFacing() {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Camera</strong>
          <div>
            <button onClick={toggleFacing} style={smallBtnStyle} aria-label="Toggle camera">Flip</button>
            <button onClick={() => { stopStream(); onClose() }} style={smallBtnStyle} aria-label="Close camera">Close</button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {error ? <div style={{ color: '#c00' }}>{error}</div> : <video ref={videoRef} style={{ width: '100%', maxHeight: 420, background: '#000' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
          <button onClick={handleCapture} className="primary" aria-label="Capture photo" disabled={!!error} style={error ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>Capture</button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
}
const panelStyle = { background: '#fff', padding: 12, width: '92%', maxWidth: 720, borderRadius: 8 }
const smallBtnStyle = { marginLeft: 8, padding: '6px 10px', borderRadius: 6 }
