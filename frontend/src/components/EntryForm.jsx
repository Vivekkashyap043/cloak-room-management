import React, { useState, useRef, useEffect } from 'react'
import CameraCapture from './CameraCapture'
import QRScanner from './QRScanner'
import UploadIcon from './icons/UploadIcon'
import './EntryForm.css'
import Spinner from './icons/Spinner'

export default function EntryForm({ token }) {
  // Use relative API paths; remove env indirection
  const [tokenNumber, setTokenNumber] = useState('')
  // thingsName removed (items table used). Default record status is 'deposited'.
  const [status, setStatus] = useState('deposited')
  const [personPhoto, setPersonPhoto] = useState(null)
  const [previewPerson, setPreviewPerson] = useState(null)
  const personPreviewRef = useRef(null)
  const [items, setItems] = useState([
    { name: 'Phone', selected: false, count: 0, photoFile: null, photoPreview: null },
    { name: 'Bag', selected: false, count: 0, photoFile: null, photoPreview: null },
    { name: 'Key', selected: false, count: 0, photoFile: null, photoPreview: null }
  ])
  const [customItemName, setCustomItemName] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  useEffect(() => { console.debug('EntryForm showScanner ->', showScanner) }, [showScanner])
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [detectedAnim, setDetectedAnim] = useState(false)
  // toasts removed — use inline messages via setMessage / setSuccess
  const [loading, setLoading] = useState(false)
  const thingsCamRef = useRef(null)
  const personCamRef = useRef(null)
  const tokenInputRef = useRef(null)
  const [openCameraFor, setOpenCameraFor] = useState(null) // { type: 'item', idx } | 'person' | null

  // helper to set an item's file and preview
  async function handleItemFile(e, idx) {
    const f = e.target.files[0]
    if (!f) {
      setItems(prev => prev.map((p, i) => i === idx ? (p.photoPreview ? (URL.revokeObjectURL(p.photoPreview), { ...p, photoFile: null, photoPreview: null }) : { ...p, photoFile: null, photoPreview: null }) : p))
      return
    }
    if (!f.type.startsWith('image/')) {
      setMessage('Please upload an image file (jpg/png)')
      return
    }
    // compress if large
    const maxClientSize = 2 * 1024 * 1024
    let fileToUse = f
    if (f.size > maxClientSize) {
      setMessage('Compressing image...')
      try {
        fileToUse = await compressImageFile(f, { maxDim: 1280, quality: 0.75 })
        if (fileToUse.size > 5 * 1024 * 1024) {
          setMessage('Image too large after compression. Please try a smaller photo.')
          return
        }
      } catch (err) {
        console.error(err)
        setMessage('Failed to compress image. Try again.')
        return
      }
    }
    setItems(prev => {
      const copy = prev.map(p => ({ ...p }))
      try { if (copy[idx] && copy[idx].photoPreview) URL.revokeObjectURL(copy[idx].photoPreview) } catch (e) {}
      const newUrl = URL.createObjectURL(fileToUse)
      copy[idx] = { ...copy[idx], photoFile: fileToUse, photoPreview: newUrl }
      return copy
    })
    setMessage('')
  }

  async function handleFile(e, setter, previewSetter) {
    const f = e.target.files[0]
    if (!f) {
      try { if (personPreviewRef.current) { URL.revokeObjectURL(personPreviewRef.current); personPreviewRef.current = null } } catch (e) {}
      setter(null)
      previewSetter(null)
      return
    }
    // client-side validation: image only and max 2MB
    if (!f.type.startsWith('image/')) {
      setMessage('Please upload an image file (jpg/png)')
      return
    }
    // If file is large, attempt client-side compression before setting
    const maxClientSize = 2 * 1024 * 1024 // target ~2MB after compression
    if (f.size > maxClientSize) {
      setMessage('Compressing image...')
      try {
        const compressed = await compressImageFile(f, { maxDim: 1280, quality: 0.75 })
        if (compressed.size > 5 * 1024 * 1024) {
          // still too large even after compression; reject
          setMessage('Image too large after compression. Please try a smaller photo or use another device.')
          return
        }
  setter(compressed)
  try { if (personPreviewRef.current) { URL.revokeObjectURL(personPreviewRef.current) } } catch (e) {}
  const u = URL.createObjectURL(compressed)
  personPreviewRef.current = u
  previewSetter(u)
        setMessage('')
        return
      } catch (err) {
        console.error('compression error', err)
        setMessage('Failed to compress image. Try again or upload a smaller image.')
        return
      }
    }
    // acceptable size — use as-is
    setter(f)
    if (f) {
      try { if (personPreviewRef.current) URL.revokeObjectURL(personPreviewRef.current) } catch (e) {}
      const u = URL.createObjectURL(f)
      personPreviewRef.current = u
      previewSetter(u)
    }
    else previewSetter(null)
  }

  // compress an image File using canvas; returns a Promise<File>
  function compressImageFile(file, { maxDim = 1280, quality = 0.75 } = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onerror = (e) => reject(new Error('Image load error'))
      img.onload = () => {
        try {
          const origW = img.naturalWidth || img.width
          const origH = img.naturalHeight || img.height
          const scale = Math.min(1, maxDim / Math.max(origW, origH))
          const w = Math.round(origW * scale)
          const h = Math.round(origH * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Compression failed'))
            // create a File so FormData behaves consistently
            const newFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
            resolve(newFile)
          }, 'image/jpeg', quality)
        } catch (err) { reject(err) }
      }
      img.src = URL.createObjectURL(file)
    })
  }

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    if (!tokenNumber) return setMessage('Token number required')
    // require person photo
    if (!personPhoto) return setMessage('Person photo is required')

    // build items payload from selected items (count > 0) and include custom if provided
  const chosenItems = []
  const itemFiles = [];
    (items || []).forEach(it => {
      if (it.selected && it.count && it.count > 0) {
        chosenItems.push({ name: it.name, count: it.count })
        if (it.photoFile) itemFiles.push(it.photoFile)
      }
    })
    if (customItemName && customItemName.trim()) {
      // custom item added to list and included
      chosenItems.push({ name: customItemName.trim(), count: 1 })
    }
    if (!chosenItems.length) return setMessage('Select at least one item')

    const form = new FormData()
    form.append('token_number', tokenNumber)
    form.append('status', status)
    form.append('items', JSON.stringify(chosenItems))
  if (personPhoto) form.append('person_photo', personPhoto)
    // append per-item photos in same order as chosenItems; backend maps by order
  itemFiles.forEach(f => form.append('item_photos', f))

    try {
      setLoading(true)
  const res = await fetch(`/api/records`, {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: form
      })
      const data = await res.json()
  if (!res.ok) return setMessage(data.message || 'Failed to save entry')
  const successText = 'Entry deposited successfully!'
      setSuccess(successText)
      setMessage('')
      setTokenNumber('')
      // revoke object URLs we created for previews
      try { if (personPreviewRef.current) { URL.revokeObjectURL(personPreviewRef.current); personPreviewRef.current = null } } catch (e) {}
      setPersonPhoto(null)
      setPreviewPerson(null)
      // reset default items (none selected)
      // revoke item previews created via createObjectURL
      try {
        items.forEach(it => { if (it && it.photoPreview) { try { URL.revokeObjectURL(it.photoPreview) } catch (e) {} } })
      } catch (e) {}
      setItems([
        { name: 'Phone', selected: false, count: 0, photoFile: null, photoPreview: null },
        { name: 'Bag', selected: false, count: 0, photoFile: null, photoPreview: null },
        { name: 'Key', selected: false, count: 0, photoFile: null, photoPreview: null }
      ])
      setCustomItemName('')
    } catch (err) {
      setMessage('Server error')
    } finally {
      setLoading(false)
    }
  }

  // auto-clear success message after 2 seconds
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 2000)
    return () => clearTimeout(t)
  }, [success])

  // auto-clear error/info messages after 2 seconds
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 2000)
    return () => clearTimeout(t)
  }, [message])

  // Play a short beep using WebAudio and provide visual focus/animation feedback
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      g.gain.value = 0.0001
      o.connect(g)
      g.connect(ctx.destination)
      const now = ctx.currentTime
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
      o.start(now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
      o.stop(now + 0.2)
      // close context after short delay
      setTimeout(() => { try { ctx.close() } catch (e) {} }, 300)
    } catch (e) { console.debug('beep failed', e) }
  }

  function triggerDetectionFeedback() {
    // focus token input and show short animation
    try {
      if (tokenInputRef && tokenInputRef.current) {
        tokenInputRef.current.focus()
        tokenInputRef.current.select && tokenInputRef.current.select()
      }
    } catch (e) { /* ignore */ }
    setDetectedAnim(true)
    playBeep()
    setTimeout(() => setDetectedAnim(false), 700)
  }

  return (
    <div className="entry-form-inner">
      {/* Show a helpful banner when the page is not a secure context (HTTPS) so users know why camera may be blocked */}
      {typeof window !== 'undefined' && !window.isSecureContext && (
        <div style={{ background: '#fff4e5', border: '1px solid #ffd9b3', padding: 10, marginBottom: 12, borderRadius: 6 }} role="alert">
          Camera access requires a secure origin (HTTPS). If you're accessing this app via the LAN IP (http://...), the browser will block camera access — open the app via HTTPS (use mkcert) or a tunnel (ngrok/localtunnel) to enable the camera on remote devices.
        </div>
      )}
      <form onSubmit={submit} className="entry-grid">
        <div>
          <div className="form-group">
            <label htmlFor="token-number">Token Number</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={tokenInputRef} id="token-number" value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} required className={`large-input ${detectedAnim ? 'token-detected' : ''}`} placeholder="Enter unique token" />
              <button type="button" className="ghost" onClick={() => {
                console.log('Scan QR clicked')
                // prefer getUserMedia if available and the page is a secure context (HTTPS or localhost)
                const canUseCamera = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext
                if (!canUseCamera) {
                  // If getUserMedia isn't available due to insecure origin, give an explicit hint
                  if (typeof window !== 'undefined' && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    setMessage('Camera access blocked by insecure origin — open the app via HTTPS (or use ngrok)')
                  } else {
                    setMessage('Camera not available in this browser')
                  }
                  return
                }
                setShowScanner(true)
              }}>Scan QR</button>
            </div>
          </div>

          <div className="form-group">
            <label>Items</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(items || []).map((it, idx) => (
                <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28 }}>
                    <input type="checkbox" checked={!!it.selected} onChange={e => {
                      const checked = e.target.checked
                      setItems(prev => prev.map((p, i) => i === idx ? { ...p, selected: checked, count: checked && p.count === 0 ? 1 : (checked ? p.count : 0), photoFile: checked ? p.photoFile : null, photoPreview: checked ? p.photoPreview : null } : p))
                    }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>{it.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button type="button" className="ghost" disabled={!it.selected || it.count <= 1} onClick={() => {
                        setItems(prev => prev.map((p, i) => i === idx ? { ...p, count: Math.max(0, p.count - 1) } : p))
                      }}>-</button>
                      <div style={{ minWidth: 28, textAlign: 'center' }}>{it.count}</div>
                      <button type="button" className="ghost" disabled={!it.selected} onClick={() => {
                        setItems(prev => prev.map((p, i) => i === idx ? { ...p, count: p.count + 1 } : p))
                      }}>+</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f3f4f6', display: 'grid', placeItems: 'center' }}>
                        {it.photoPreview ? <img src={it.photoPreview} alt="item" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ fontSize: 20 }}>📦</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="ghost" onClick={() => {
                          // open camera for this item when getUserMedia is available and running in a secure context
                          const canUseGetUserMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext
                          if (canUseGetUserMedia) {
                            setOpenCameraFor({ type: 'item', idx })
                          } else {
                            // fallback to file input which may open the camera on some mobile browsers
                            const el = document.getElementById(`item-file-${idx}`)
                            if (el) el.click()
                            // if getUserMedia exists but page is insecure, hint to user
                            if (typeof window !== 'undefined' && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.isSecureContext) {
                              setMessage('Camera access requires HTTPS. Open the site via HTTPS or use a tunnel (ngrok) to enable the camera.');
                            }
                          }
                        }}>{it.photoPreview ? 'Retake' : 'Take'}</button>
                        <label className="ghost" style={{ cursor: 'pointer' }}>
                          Upload
                          <input id={`item-file-${idx}`} type="file" accept="image/*;capture=camera" capture="environment" style={{ display: 'none' }} onChange={e => handleItemFile(e, idx)} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="large-input" value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="Other item" />
                <button type="button" className="ghost" onClick={() => {
                  if (!customItemName.trim()) return
                  // add custom item and auto-select it with count 1
                  setItems(prev => [...prev, { name: customItemName.trim(), selected: true, count: 1, photoFile: null, photoPreview: null }])
                  setCustomItemName('')
                }}>Add</button>
              </div>
            </div>
          </div>
          {success && <div className="success-badge-left" role="status">{success}</div>}
        </div>

        <div>
            <div style={{ display: 'flex', gap: 12 }}>
              {/* Person photo (required) */}
              <div className="photo-box">
                <div className="photo-label">Person Photo (required)</div>
                <div className="photo-placeholder">
                  {previewPerson ? <img src={previewPerson} alt="person" onLoad={e => e.currentTarget.classList.add('loaded')} style={{ borderRadius: 8 }} /> : <div style={{ fontSize: 28 }}>�</div>}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button type="button" className="ghost" onClick={() => {
                    // prefer getUserMedia when available and secure; otherwise fall back to file input
                    const canUseGetUserMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext
                    if (canUseGetUserMedia) setOpenCameraFor('person')
                    else if (personCamRef.current) personCamRef.current.click()
                    if (typeof window !== 'undefined' && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.isSecureContext) {
                      setMessage('Camera access requires HTTPS. Open the site via HTTPS or use a tunnel (ngrok) to enable the camera.');
                    }
                  }} aria-label="Take person photo from camera">{previewPerson ? 'Retake' : 'Take from Camera'}</button>
                  <input
                    ref={personCamRef}
                    type="file"
                    accept="image/*;capture=camera"
                    capture="environment"
                    onChange={e => handleFile(e, setPersonPhoto, setPreviewPerson)}
                    style={{ position: 'absolute', left: '-9999px' }}
                  />
                  <label className="ghost" style={{ cursor: 'pointer' }}>
                    Upload Photo
                    <input type="file" accept="image/*" onChange={e => handleFile(e, setPersonPhoto, setPreviewPerson)} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, textAlign: 'center' }}>
            <button type="submit" className="primary big" aria-label="Submit Entry" disabled={loading}>{loading ? <><Spinner size={16} /> Saving...</> : 'Submit Entry'}</button>
          </div>
        </div>
      </form>
      {message && <div className="message">{message}</div>}
      {openCameraFor && (
        <CameraCapture
          onClose={() => setOpenCameraFor(null)}
          onCapture={blob => {
            // convert blob to File so the backend form-data can consume it
            const fileName = `${(openCameraFor && openCameraFor.type) ? openCameraFor.type : openCameraFor}-${Date.now()}.jpg`
            const file = new File([blob], fileName, { type: 'image/jpeg' })
            if (openCameraFor && openCameraFor.type === 'item') {
              const idx = openCameraFor.idx
              setItems(prev => {
                const copy = prev.map(p => ({ ...p }))
                try { if (copy[idx] && copy[idx].photoPreview) URL.revokeObjectURL(copy[idx].photoPreview) } catch (e) {}
                const u = URL.createObjectURL(file)
                copy[idx] = { ...copy[idx], photoFile: file, photoPreview: u }
                return copy
              })
            } else if (openCameraFor === 'things' || (openCameraFor && openCameraFor.type === 'things')) {
              // legacy/unused branch: no-op (avoid referencing removed state)
              console.debug('Captured for deprecated "things" target; ignoring')
            } else if (openCameraFor === 'person' || (openCameraFor && openCameraFor.type === 'person')) {
              // camera capture for person — set both file and preview so preview shows instantly
              try { if (personPreviewRef.current) URL.revokeObjectURL(personPreviewRef.current) } catch (e) {}
              const pu = URL.createObjectURL(file)
              personPreviewRef.current = pu
              setPersonPhoto(file)
              setPreviewPerson(pu)
            } else if (openCameraFor === 'scan' || (openCameraFor && openCameraFor.type === 'scan')) {
              // Attempt to decode QR from the captured photo using BarcodeDetector if available
              async function tryDetect() {
                try {
                  const imgBitmap = await createImageBitmap(blob)
                  const canvas = document.createElement('canvas')
                  canvas.width = imgBitmap.width
                  canvas.height = imgBitmap.height
                  const ctx = canvas.getContext('2d')
                  ctx.drawImage(imgBitmap, 0, 0)
                  // Try native BarcodeDetector first
                  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
                    try {
                      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
                      const results = await detector.detect(imgBitmap)
                      if (results && results.length) {
                        setTokenNumber(results[0].rawValue)
                        setSuccess('QR detected')
                        try { triggerDetectionFeedback() } catch (e) {}
                        return
                      }
                    } catch (bdErr) {
                      console.debug('BarcodeDetector capture detect failed', bdErr)
                    }
                  }
                  // Fallback to jsQR
                  try {
                    // import dynamically to avoid bundling errors if not installed
                    const { default: jsQR } = await import('jsqr')
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                    const code = jsQR(imageData.data, imageData.width, imageData.height)
                    if (code && code.data) {
                      setTokenNumber(code.data)
                      setSuccess('QR detected')
                      try { triggerDetectionFeedback() } catch (e) {}
                      return
                    }
                  } catch (jsErr) {
                    console.debug('jsQR detect failed', jsErr)
                  }
                  setMessage('No QR detected in capture')
                } catch (err) {
                  console.error('QR detect error', err)
                  setMessage('Failed to detect QR')
                }
              }
              tryDetect()
            }
            setOpenCameraFor(null)
          }}
        />
      )}
      {showScanner && (
        // debug overlay: show immediately so user sees feedback even if camera access fails
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, width: 320, textAlign: 'center' }}>
            <div style={{ marginBottom: 10 }}><strong>Opening scanner…</strong></div>
            <div style={{ marginBottom: 8 }}>If the camera permission prompt doesn't appear, check your browser permissions and that the site is served over HTTPS or localhost.</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button className="ghost" onClick={() => setShowScanner(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showScanner && (
        <QRScanner
          onClose={() => setShowScanner(false)}
          onDetected={value => {
            // populate token number when QR detected
            if (value) {
              setTokenNumber(value)
              setSuccess('QR detected')
              try { triggerDetectionFeedback() } catch (e) {}
              // only close the scanner if we actually detected a non-empty value
              setShowScanner(false)
            } else {
              // if detector emitted an empty/falsey value, keep scanner open and log for debugging
              console.debug('QRScanner reported empty value')
            }
          }}
        />
      )}
    </div>
  )
}
