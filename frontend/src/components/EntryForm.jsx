import React, { useState, useRef, useEffect } from 'react'
import CameraCapture from './CameraCapture'
import UploadIcon from './icons/UploadIcon'
import './EntryForm.css'
import Spinner from './icons/Spinner'

export default function EntryForm({ token }) {
  // Use relative API paths; remove env indirection
  const [tokenNumber, setTokenNumber] = useState('')
  const [personName, setPersonName] = useState('')
  const [thingsName, setThingsName] = useState('')
  const [status, setStatus] = useState('submitted')
  const [personPhoto, setPersonPhoto] = useState(null)
  const [thingsPhoto, setThingsPhoto] = useState(null)
  const [previewPerson, setPreviewPerson] = useState(null)
  const [previewThings, setPreviewThings] = useState(null)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  // toasts removed — use inline messages via setMessage / setSuccess
  const [loading, setLoading] = useState(false)
  const personCamRef = useRef(null)
  const thingsCamRef = useRef(null)
  const [openCameraFor, setOpenCameraFor] = useState(null) // 'person' | 'things' | null

  async function handleFile(e, setter, previewSetter) {
    const f = e.target.files[0]
    if (!f) {
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
        previewSetter(URL.createObjectURL(compressed))
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
    if (f) previewSetter(URL.createObjectURL(f))
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
    if (!tokenNumber || !personName || !thingsName || !personPhoto || !thingsPhoto) return setMessage('All fields and photos are required')
    const form = new FormData()
    form.append('token_number', tokenNumber)
    form.append('person_name', personName)
    form.append('things_name', thingsName)
    form.append('status', status)
    form.append('person_photo', personPhoto)
    form.append('things_photo', thingsPhoto)

    try {
      setLoading(true)
  const res = await fetch(`/api/records`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form
      })
      const data = await res.json()
  if (!res.ok) return setMessage(data.message || 'Failed to save entry')
  const successText = 'Entry submitted successfully!'
  setSuccess(successText)
      setMessage('')
      setSuccess(successText)
      setTokenNumber('')
      setPersonName('')
      setThingsName('')
      setPersonPhoto(null)
      setThingsPhoto(null)
      setPreviewPerson(null)
      setPreviewThings(null)
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

  return (
    <div className="entry-form-inner">
      <form onSubmit={submit} className="entry-grid">
        <div>
          <div className="form-group">
            <label htmlFor="token-number">Token Number</label>
            <input id="token-number" value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} required className="large-input" placeholder="Enter unique token" />
          </div>

          <div className="form-group">
            <label htmlFor="person-name">Person Name</label>
            <input id="person-name" value={personName} onChange={e => setPersonName(e.target.value)} required className="large-input" placeholder="Enter person's full name" />
          </div>

          <div className="form-group">
            <label htmlFor="item-name">Item Name</label>
            <input id="item-name" value={thingsName} onChange={e => setThingsName(e.target.value)} required className="large-input" placeholder="Describe the item" />
          </div>
          {success && <div className="success-badge-left" role="status">{success}</div>}
        </div>

        <div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="photo-box">
              <div className="photo-label">Person's Photo</div>
              <div className="photo-placeholder">
                {previewPerson ? <img src={previewPerson} alt="person" onLoad={e => e.currentTarget.classList.add('loaded')} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ fontSize: 28 }}>📷</div>}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" className="ghost" onClick={() => {
                  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
                  // prefer in-app camera on desktop; on mobile prefer native camera via file input
                  if (!isMobile && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) setOpenCameraFor('person')
                  else if (personCamRef.current) personCamRef.current.click()
                }} aria-label="Take person photo from camera">{previewPerson ? 'Retake' : 'Take from Camera'}</button>
                {/* keep the input off-screen (not display:none) so mobile browsers will open the camera */}
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

            <div className="photo-box">
              <div className="photo-label">Item's Photo</div>
              <div className="photo-placeholder">
                {previewThings ? <img src={previewThings} alt="things" onLoad={e => e.currentTarget.classList.add('loaded')} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ fontSize: 28 }}>📦</div>}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button type="button" className="ghost" onClick={() => {
                  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
                  if (!isMobile && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) setOpenCameraFor('things')
                  else if (thingsCamRef.current) thingsCamRef.current.click()
                }} aria-label="Take item photo from camera">{previewThings ? 'Retake' : 'Take from Camera'}</button>
                {/* keep the input off-screen (not display:none) so mobile browsers will open the camera */}
                <input
                  ref={thingsCamRef}
                  type="file"
                  accept="image/*;capture=camera"
                  capture="environment"
                  onChange={e => handleFile(e, setThingsPhoto, setPreviewThings)}
                  style={{ position: 'absolute', left: '-9999px' }}
                />
                <label className="ghost" style={{ cursor: 'pointer' }}>
                  Upload Photo
                  <input type="file" accept="image/*" onChange={e => handleFile(e, setThingsPhoto, setPreviewThings)} style={{ display: 'none' }} />
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
            const fileName = `${openCameraFor}-${Date.now()}.jpg`
            const file = new File([blob], fileName, { type: 'image/jpeg' })
            if (openCameraFor === 'person') {
              setPersonPhoto(file)
              setPreviewPerson(URL.createObjectURL(file))
            } else {
              setThingsPhoto(file)
              setPreviewThings(URL.createObjectURL(file))
            }
            setOpenCameraFor(null)
          }}
        />
      )}
    </div>
  )
}
