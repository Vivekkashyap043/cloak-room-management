import React, { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export default function QRScanner({ onDetected, onClose }) {
  console.debug('QRScanner render (component body)')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const lastSeenRef = useRef({ value: null, time: 0 })

  useEffect(() => {
    start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    console.debug('QRScanner.start()')
    setError('')
    try {
      console.debug('QRScanner requesting camera')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      console.debug('QRScanner got stream')
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try { await videoRef.current.play() } catch (e) { /* ignore */ }
      }
      // start detection loop if BarcodeDetector is available
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const loop = async () => {
          try {
            // ensure video element exists
            if (!videoRef.current) {
              if (streamRef.current) setTimeout(loop, 300)
              return
            }
            // wait until video has enough data to draw a frame
            if (videoRef.current.readyState < 2) {
              if (streamRef.current) setTimeout(loop, 300)
              return
            }
            const canvas = document.createElement('canvas')
            canvas.width = videoRef.current.videoWidth || 640
            canvas.height = videoRef.current.videoHeight || 480
            const ctx = canvas.getContext('2d')
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
            const imgBitmap = await createImageBitmap(canvas)
            const results = await detector.detect(imgBitmap)
            if (results && results.length) {
              const code = results[0].rawValue
              console.debug('QR seen (BarcodeDetector):', code)
              const prev = lastSeenRef.current
              const now = Date.now()
              if (prev.value === code && (now - prev.time) < 800) {
                console.debug('QR confirmed (BarcodeDetector):', code)
                if (onDetected) onDetected(code)
                stop()
                return
              } else {
                lastSeenRef.current = { value: code, time: now }
              }
            }
          } catch (err) {
            console.debug('qr detect err', err)
          }
          // schedule next iteration while stream is active
          if (streamRef.current) setTimeout(loop, 300)
        }
        // start loop shortly after video starts
        setTimeout(loop, 300)
      } else {
        // Fallback to jsQR when BarcodeDetector API isn't available
        const loop = async () => {
          try {
            if (!videoRef.current) {
              if (streamRef.current) setTimeout(loop, 300)
              return
            }
            if (videoRef.current.readyState < 2) {
              if (streamRef.current) setTimeout(loop, 300)
              return
            }
            const canvas = document.createElement('canvas')
            canvas.width = videoRef.current.videoWidth || 640
            canvas.height = videoRef.current.videoHeight || 480
            const ctx = canvas.getContext('2d')
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height)
            if (code && code.data) {
              console.debug('QR seen (jsQR):', code.data)
              const prev = lastSeenRef.current
              const now = Date.now()
              if (prev.value === code.data && (now - prev.time) < 800) {
                console.debug('QR confirmed (jsQR):', code.data)
                if (onDetected) onDetected(code.data)
                stop()
                return
              } else {
                lastSeenRef.current = { value: code.data, time: now }
              }
            }
          } catch (err) {
            console.debug('jsQR detect err', err)
          }
          if (streamRef.current) setTimeout(loop, 300)
        }
        setTimeout(loop, 300)
      }
    } catch (err) {
      console.error('QR camera start error', err)
      setError('Unable to access camera')
    }
  }

  function stop() {
    try {
      console.debug('QRScanner.stop() called')
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => { try { t.stop() } catch (e) {} })
        streamRef.current = null
      }
      if (videoRef.current) { try { videoRef.current.pause() } catch (e) {} videoRef.current.srcObject = null }
    } catch (err) { console.error('stop err', err) }
    // Do not call onClose() here — let the parent decide when to close the modal.
  }

  function handleCloseClick() {
    // stop stream and then notify parent to close the modal
    try {
      stop()
    } catch (e) {}
    if (onClose) onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', padding: 12, borderRadius: 8, width: '92%', maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Scan QR</strong>
          <div>
            <button onClick={handleCloseClick} style={{ marginLeft: 8 }}>Close</button>
          </div>
        </div>
        <div style={{ background: '#000', height: 360 }}>
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        {error && <div style={{ color: '#c00', marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  )
}
