import { useState, useEffect } from 'react'
import {
  getEmployeeListConfig,
  updateEmployeeListConfig,
  uploadEmployeeListCsv,
  getEmployeeList,
  getEmployeeListLeftAfterUpload
} from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './EmployeeListConfig.css'

const EmployeeListConfig = () => {
  const [config, setConfig] = useState({ enabled: true, count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [listItems, setListItems] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [leftEmployeesModal, setLeftEmployeesModal] = useState(null) // { left_employees: [...] } or null
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getEmployeeListConfig()
      setConfig({
        enabled: data.enabled !== false,
        count: data.count != null ? data.count : 0
      })
      if ((data.count || 0) > 0) {
        fetchList()
      } else {
        setListItems([])
      }
    } catch (err) {
      console.error('Error fetching employee list config:', err)
      setError(err.message || err.detail || 'Failed to load config')
    } finally {
      setLoading(false)
    }
  }

  const fetchList = async () => {
    try {
      setListLoading(true)
      const data = await getEmployeeList({ limit: 500 })
      setListItems(data.items || [])
    } catch (err) {
      setListItems([])
    } finally {
      setListLoading(false)
    }
  }

  const handleToggleEnabled = async (checked) => {
    try {
      setError(null)
      setSuccess(null)
      await updateEmployeeListConfig({ enabled: checked })
      setConfig((c) => ({ ...c, enabled: checked }))
      setSuccess(checked ? 'Verification enabled. Company Employee signup will require a match in the list.' : 'Verification disabled. Company Employee signup will not check the list.')
    } catch (err) {
      setError(err.message || err.detail || 'Failed to update setting')
    }
  }

  const allowedExtensions = ['.csv', '.xlsx', '.xls']
  const isAllowedFile = (f) => f && allowedExtensions.some(ext => f.name.toLowerCase().endsWith(ext))

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)')
      return
    }
    try {
      setUploading(true)
      setError(null)
      setSuccess(null)
      const data = await uploadEmployeeListCsv(file)
      setSuccess(data.message || `Updated ${data.count} employees`)
      setFile(null)
      await fetchConfig()
      if ((data.count || 0) > 0) await fetchList()
      emitAdminActivity({ type: 'employee_list', count: data.count })
    } catch (err) {
      const msg = err.message || err.detail || 'Upload failed'
      // If server still returns CSV-only message, guide user to restart backend or use CSV
      if (msg.toLowerCase().includes('must be') && msg.toLowerCase().includes('csv') && !msg.toLowerCase().includes('excel')) {
        setError('This server only accepts CSV. Restart the backend to accept Excel (.xlsx, .xls), or upload a CSV file.')
      } else {
        setError(msg)
      }
    } finally {
      setUploading(false)
    }
  }

  const openListDifferenceModal = async () => {
    try {
      setDiffLoading(true)
      setError(null)
      const data = await getEmployeeListLeftAfterUpload()
      setLeftEmployeesModal({ left_employees: data.left_employees || [] })
    } catch (err) {
      setError(err.message || err.detail || 'Failed to load list difference')
    } finally {
      setDiffLoading(false)
    }
  }

  const downloadTemplate = () => {
    const csv = 'employee_id,full_name,email\nCT1001,John Doe,john@example.com'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'company_employee_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="employee-list-config">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="employee-list-config">
      <div className="employee-list-config-header">
        <h1>Employee List</h1>
        <div className={`employee-list-diff-popover-wrap${leftEmployeesModal !== null ? ' employee-list-diff-popover-open' : ''}`}>
          <button
            type="button"
            className="employee-list-config-diff-btn"
            onClick={openListDifferenceModal}
            disabled={diffLoading}
          >
            {diffLoading ? 'Loading...' : 'View list difference'}
          </button>
          {leftEmployeesModal !== null && (
            <div className="employee-list-left-popover">
              <h2 className="employee-list-left-modal-title">Left company employees</h2>
              <p className="employee-list-left-modal-desc">
                Employees who were in the previous list but are not in the current list after the last upload.
              </p>
              {(!leftEmployeesModal.left_employees || leftEmployeesModal.left_employees.length === 0) ? (
                <p className="employee-list-left-modal-empty">No difference. Everyone in the previous list is in the current list (or no list has been uploaded yet).</p>
              ) : (
                <>
                  <div className="employee-list-left-modal-list-wrap">
                    <table className="employee-list-config-table employee-list-left-modal-table">
                      <thead>
                        <tr>
                          <th>Employee ID</th>
                          <th>Name</th>
                          <th>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leftEmployeesModal.left_employees.map((e, i) => (
                          <tr key={e.user_id || i}>
                            <td>{e.employee_id || '-'}</td>
                            <td>{e.full_name || '-'}</td>
                            <td>{e.email || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="employee-list-left-modal-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="employee-list-left-modal-close"
                  onClick={() => setLeftEmployeesModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="employee-list-config-error">{error}</div>}
      {success && <div className="employee-list-config-success">{success}</div>}

      <section className="employee-list-config-section employee-list-config-section-verification">
        <h2>Verification toggle</h2>
        <label className="employee-list-config-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
          />
          <span>Require employee list for Company Employee verification</span>
        </label>
      </section>

      {config.count > 0 && (
        <section className="employee-list-config-section employee-list-config-section-uploaded">
          <h2>Uploaded list</h2>
          <p>Uploaded list is stored in the database. Below are the employees currently in the list.</p>
          {listLoading ? (
            <p>Loading list...</p>
          ) : (
            <div className="employee-list-config-table-wrap">
              <table className="employee-list-config-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Full name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {listItems.map((row, i) => (
                    <tr key={i}>
                      <td>{row.employee_id}</td>
                      <td>{row.full_name}</td>
                      <td>{row.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="employee-list-config-section employee-list-config-section-upload">
        <h2>Upload list (CSV or Excel)</h2>
        <p>Upload a CSV or Excel (.xlsx, .xls) with columns: <code>employee_id</code>, <code>full_name</code>, <code>email</code>. This replaces the uploaded list.</p>
        <a href="#" onClick={(e) => { e.preventDefault(); downloadTemplate() }} className="employee-list-config-template">Download CSV template</a>
        <form onSubmit={handleUpload} className="employee-list-config-upload">
          <div
            className={`employee-list-config-drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files[0]
              if (isAllowedFile(f)) setFile(f)
            }}
          >
            {!file ? (
              <>
                <p>Drag a CSV or Excel file here or</p>
                <label className="employee-list-config-browse">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  Browse
                </label>
              </>
            ) : (
              <div className="employee-list-config-file-preview">
                <span>📄 {file.name}</span>
                <button type="button" onClick={() => setFile(null)}>Remove</button>
              </div>
            )}
          </div>
          <button type="submit" disabled={!file || uploading} className="employee-list-config-submit">
            {uploading ? 'Uploading...' : 'Upload list'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default EmployeeListConfig
