import React, { useEffect, useState, useRef } from 'react'
import './AdminDashboard.css'

export default function AdminReport({ token, username, onLogout }) {
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ token: '', event: '', location: '', status: '', deposited: '', from: '', to: '', returned: '', incharge: '' })
  const [eventsList, setEventsList] = useState([])
  const tableRef = useRef(null)

  // load list of events (used to populate event dropdown)
  useEffect(() => {
    let mounted = true
    async function fetchEvents() {
      try {
        // Request all events (including inactive) so the report dropdown can show distinct event names
        const res = await fetch('/api/events?all=true', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Failed to load events')
        if (mounted) {
          setEventsList(data.events || [])
        }
      } catch (err) {
        // non-fatal for report; keep eventsList empty and show in console
        console.debug('Failed to load events for AdminReport:', err.message || err)
      } finally {
        // Always attempt to load records — backend is now expected to JOIN event in-charge fields
        if (mounted) {
          try { load() } catch (e) { /* ignore */ }
        }
      }
    }
    fetchEvents()
    return () => { mounted = false }
  }, [token])

  async function load(q = {}) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams(q).toString()
      const url = '/api/admin/records/all' + (params ? `?${params}` : '')
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load records')
      let recs = data.records || []

      // Server should include `event_incharge` and `incharge_phone` (via LEFT JOIN on events).
      // If the backend doesn't provide these fields (older DB), fall back to client-side mapping
      const needsFallback = recs.some(r => r.event_incharge === undefined || r.incharge_phone === undefined)
      if (needsFallback && eventsList && eventsList.length) {
        const evMap = new Map()
        eventsList.forEach(ev => {
          if (!ev || !ev.name) return
          evMap.set(ev.name, { incharge: ev.event_incharge || '', phone: ev.incharge_phone || '' })
        })
        recs = recs.map(r => {
          const info = evMap.get(r.event_name) || { incharge: '', phone: '' }
          return { ...r, event_incharge: r.event_incharge || info.incharge, incharge_phone: r.incharge_phone || info.phone }
        })
      }

      // If an incharge filter is provided, apply client-side filter by substring (case-insensitive)
      if (filters && filters.incharge && String(filters.incharge).trim()) {
        const needle = String(filters.incharge).trim().toLowerCase()
        recs = recs.filter(r => (r.event_incharge || '').toLowerCase().indexOf(needle) >= 0)
      }

      setRecords(recs)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Server error')
    } finally { setLoading(false) }
  }

  function updateFilter(k, v) {
    setFilters(prev => ({ ...prev, [k]: v }))
  }

  function buildQueryFromFilters() {
    const q = {}
    // include deposited single-date or from/to as provided
    Object.entries(filters).forEach(([k, v]) => {
      if (!v && v !== 0) return
      const s = String(v).trim()
      if (!s) return
      q[k] = v
    })
    return q
  }

  function applyFilters(e) {
    if (e && e.preventDefault) e.preventDefault()
    const q = buildQueryFromFilters()
    load(q)
  }

  async function downloadExport(format) {
    try {
      const q = buildQueryFromFilters()
      q.format = format
      const params = new URLSearchParams(q).toString()
      const url = '/api/admin/records/export' + (params ? `?${params}` : '')
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'Export failed')
      }
      const blob = await res.blob()
      const ext = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv'
      const filename = `report_${Date.now()}.${ext}`
      const urlBlob = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = urlBlob
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(urlBlob)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Export failed')
    }
  }

  // Client-side PDF export: open a printable window with the report table (includes images)
  function exportPdfClientSide() {
    try {
      if (!records || !records.length) return setError('No records to export')
      const tableEl = tableRef.current
      if (!tableEl) return setError('Nothing to export')

      const win = window.open('', '_blank')
      if (!win) return setError('Popup blocked. Allow popups for this site to export PDF.')

      const doc = win.document
      doc.open()
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Admin Report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;padding:20px;color:#111}
        h2{margin:0 0 12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #e1e1e1;padding:8px;vertical-align:top}
        th{background:#f7f7f7}
        img{display:block;max-width:100%;height:auto}
        .items-table td{border:none;padding:4px}
        </style></head><body><h2>Admin Report</h2>
      `)
      doc.close()

      // clone the table node and convert image src to absolute so they load in new window
      const cloned = tableEl.cloneNode(true)
      const imgs = cloned.querySelectorAll && cloned.querySelectorAll('img')
      if (imgs && imgs.length) {
        imgs.forEach(img => {
          try {
            const src = img.getAttribute('src') || ''
            img.src = new URL(src, window.location.href).href
          } catch (e) {}
        })
      }
      // append cloned table
      win.document.body.appendChild(cloned)

      // wait for images to finish loading before printing
      const winImgs = win.document.images || []
      let loaded = 0
      const total = winImgs.length
      if (total === 0) {
        win.focus()
        win.print()
        return
      }
      for (const im of winImgs) {
        im.onload = im.onerror = () => {
          loaded += 1
          if (loaded >= total) {
            win.focus()
            win.print()
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to export PDF')
    }
  }

  // Inline PDF export without navigation: render table into a hidden iframe and print that iframe
  function exportPdfInline() {
    try {
      if (!records || !records.length) return setError('No records to export')
      const tableEl = tableRef.current
      if (!tableEl) return setError('Nothing to export')

      // create hidden iframe
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.visibility = 'hidden'
      document.body.appendChild(iframe)

      const idoc = iframe.contentDocument || iframe.contentWindow.document
      idoc.open()
      idoc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Admin Report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;padding:12px;color:#111}
        h2{margin:0 0 12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #e1e1e1;padding:8px;vertical-align:top}
        th{background:#f7f7f7}
        img{display:block;max-width:100%;height:auto}
        .items-table td{border:none;padding:4px}
        @media print { img{max-width:96px;max-height:96px} }
        </style></head><body><h2>Admin Report</h2>`)
      idoc.close()

      const cloned = tableEl.cloneNode(true)
      const imgs = cloned.querySelectorAll && cloned.querySelectorAll('img')
      if (imgs && imgs.length) {
        imgs.forEach(img => {
          try {
            const src = img.getAttribute('src') || ''
            img.src = new URL(src, window.location.href).href
          } catch (e) {}
        })
      }

      idoc.body.appendChild(cloned)

      // wait for images to load then print
      const winImgs = idoc.images || []
      let loaded = 0
      const total = winImgs.length
      const doPrint = () => {
        try {
          iframe.contentWindow.focus()
          // trigger print for iframe only
          iframe.contentWindow.print()
        } catch (e) {
          console.error('Print failed', e)
          setError('Print failed: ' + (e && e.message))
        } finally {
          // cleanup after slight delay to let print dialog open
          setTimeout(() => { try { document.body.removeChild(iframe) } catch (e) {} }, 1000)
        }
      }

      if (total === 0) return doPrint()
      for (const im of winImgs) {
        im.onload = im.onerror = () => {
          loaded += 1
          if (loaded >= total) doPrint()
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to export PDF')
    }
  }

  return (
    <div className="adm-root">
      <header className="top-header">
        <div className="top-brand">
          <h2 className="brand-title">Admin Report</h2>
          <div className="brand-sub" style={{ paddingLeft: 8 }}>All records (recent) with items</div>
        </div>
        <div className="top-actions">
          <button className="logout-pill" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="adm-container">
        <div className="adm-grid">
          <section className="card left-card" style={{ gridColumn: '1 / -1' }}>
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Records</h3>
                <div>
                  <button className="btn-clear" onClick={() => load(buildQueryFromFilters())} style={{ marginRight: 8 }}>Refresh</button>
                </div>
              </div>

              <form onSubmit={applyFilters} style={{ marginTop: 12 }}>
                <div className="report-filters">
                  <div className="filter-input"><label>Token</label><input type="text" placeholder="Token" value={filters.token} onChange={e => updateFilter('token', e.target.value)} /></div>
                  <div className="filter-input"><label>Event name</label>
                    <select value={filters.event} onChange={e => updateFilter('event', e.target.value)}>
                      <option value="">All events</option>
                      {(() => {
                        // Show distinct event names only (ignore location/status) in the dropdown
                        if (!eventsList || !eventsList.length) return null
                        const names = eventsList.map(ev => ev && (ev.name || ev.id)).filter(Boolean)
                        const distinct = Array.from(new Set(names))
                        return distinct.map(n => <option key={n} value={n}>{n}</option>)
                      })()}
                    </select>
                  </div>
                  <div className="filter-input"><label>Location</label>
                    <select value={filters.location} onChange={e => updateFilter('location', e.target.value)}>
                      <option value="">All locations</option>
                      <option value="gents location">gents location</option>
                      <option value="ladies location">ladies location</option>
                    </select>
                    </div>
                    <div className="filter-input"><label>In-charge</label>
                        <input type="text" placeholder="In-charge name" value={filters.incharge} onChange={e => updateFilter('incharge', e.target.value)} />
                      </div>
                  <div className="filter-input"><label>Status</label>
                    <select value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
                      <option value="">Any</option>
                      <option value="deposited">deposited</option>
                      <option value="returned">returned</option>
                    </select>
                  </div>

                  <div className="filter-input full"><label>Deposited (exact date)</label><input type="date" value={filters.deposited} onChange={e => updateFilter('deposited', e.target.value)} /></div>
                  <div className="filter-input full"><label>Deposited range — From</label><input type="date" value={filters.from} onChange={e => updateFilter('from', e.target.value)} /></div>
                  <div className="filter-input full"><label>Deposited range — To</label><input type="date" value={filters.to} onChange={e => updateFilter('to', e.target.value)} /></div>

                  <div className="filter-input full"><label>Returned (exact date)</label><input type="date" value={filters.returned} onChange={e => updateFilter('returned', e.target.value)} /></div>

                  <div className="filter-actions">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" type="submit">Search</button>
                      <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ token: '', event: '', location: '', status: '', from: '', to: '', returned_from: '', returned_to: '', incharge: '' }); load() }}>Clear</button>
                    </div>
                    <div className="export-buttons">
                      <button type="button" className="btn" onClick={() => exportPdfClientSide()}>Export PDF</button>
                      <button type="button" className="btn" onClick={() => downloadExport('xlsx')}>Export Excel</button>
                    </div>
                  </div>
                </div>
              </form>

              {loading ? (
                <div className="empty-note">Loading records...</div>
              ) : error ? (
                <div className="empty-note">{error}</div>
              ) : records && records.length ? (
                <table className="events-table" ref={tableRef}>
                  <thead>
                    <tr className="table-head">
                      <th>Token</th>
                      <th>Event</th>
                      <th>In-charge</th>
                      <th>In-charge Phone</th>
                      <th>Location</th>
                      <th>Deposited At</th>
                      <th>Returned At</th>
                      <th>Status</th>
                      <th>Person Photo</th>
                      <th>Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <React.Fragment key={r.id}>
                        <tr>
                          <td style={{ verticalAlign: 'top' }}>{r.token_number}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.event_name || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.event_incharge || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.incharge_phone || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.location}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.deposited_at || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.returned_at || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.status || '-'}</td>
                          <td style={{ verticalAlign: 'top' }}>{r.person_photo_path ? <img src={r.person_photo_path} alt="person" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6 }} /> : '-'}</td>
                          <td>
                            {r.items && r.items.length ? (
                              <table style={{ width: '100%' }}>
                                <tbody>
                                  {r.items.map(it => (
                                    <tr key={it.id}>
                                      <td style={{ width: 36 }}>{it.item_photo_path ? <img src={it.item_photo_path} alt={it.item_name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} /> : <div style={{ width: 36, height: 36 }} />}</td>
                                      <td>{it.item_name}</td>
                                      <td style={{ textAlign: 'right' }}>× {it.item_count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="muted">No items</div>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-note">No records found.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
