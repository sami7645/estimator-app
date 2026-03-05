import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  UploadCloud,
  Star,
  Archive as ArchiveIcon,
  Trash2,
  FileText,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  ChevronDown,
  Pencil,
  Pin,
  SlidersHorizontal,
  Mail,
  Inbox,
  RefreshCw,
} from 'lucide-react'
import type { Project, PlanSet, ProjectEmail } from '../api'
import {
  fetchProjects,
  createProject,
  fetchPlanSets,
  fetchPlanSet,
  uploadPlanSet,
  updateProject,
  deleteProject,
  fetchProjectEmails,
  MEDIA_BASE,
} from '../api'
import { useAuth } from '../context/AuthContext'
import './ProjectsPage.css'

type ProjectCategory = 'all' | 'starred' | 'my' | 'archived'

const LIST_COLUMN_ORDER_KEY = 'projects-list-column-order'
const LIST_PIN_PROJECT_KEY = 'projects-list-pin-project'
const FILTERS_CONFIG_KEY = 'projects-filters-config'

type ListColumnKey = 'project' | 'planSet' | 'created' | 'pages' | 'actions'
type ProjectsFilterKey = 'project' | 'email' | 'minSheets' | 'maxSheets' | 'dateFrom' | 'dateTo' | 'sort'

const DEFAULT_LIST_COLUMNS: ListColumnKey[] = ['project', 'planSet', 'created', 'pages', 'actions']
const ALL_FILTER_KEYS: ProjectsFilterKey[] = ['project', 'email', 'minSheets', 'maxSheets', 'dateFrom', 'dateTo', 'sort']

function loadListColumnOrder(): ListColumnKey[] {
  try {
    const raw = localStorage.getItem(LIST_COLUMN_ORDER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed) && parsed.length === DEFAULT_LIST_COLUMNS.length) {
        const valid = new Set(DEFAULT_LIST_COLUMNS)
        if (parsed.every((k) => valid.has(k as ListColumnKey))) return parsed as ListColumnKey[]
      }
    }
  } catch {}
  return [...DEFAULT_LIST_COLUMNS]
}

function loadListPinProject(): boolean {
  try {
    const raw = localStorage.getItem(LIST_PIN_PROJECT_KEY)
    return raw === 'true'
  } catch {}
  return false
}

function loadProjectsFilterConfig(): ProjectsFilterKey[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(FILTERS_CONFIG_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k) => (ALL_FILTER_KEYS as string[]).includes(k)) as ProjectsFilterKey[]
        if (valid.length === 0) return [] // user unchecked all; keep it that way
        const missing = ALL_FILTER_KEYS.filter((k) => !valid.includes(k))
        return [...valid, ...missing]
      }
    }
  } catch {}
  return [...ALL_FILTER_KEYS]
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [planSets, setPlanSets] = useState<PlanSet[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'created_at'>('created_at')
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<ProjectCategory>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    // Load view mode from localStorage, default to 'grid'
    const saved = localStorage.getItem('projects-view-mode')
    return (saved === 'grid' || saved === 'list') ? saved : 'grid'
  })
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [filterProjectId, setFilterProjectId] = useState<number | null>(null)
  const [filterMinSheets, setFilterMinSheets] = useState<number | null>(null)
  const [filterMaxSheets, setFilterMaxSheets] = useState<number | null>(null)
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [uploadedPlanSetId, setUploadedPlanSetId] = useState<number | null>(null)
  const [listColumnOrder, setListColumnOrder] = useState<ListColumnKey[]>(loadListColumnOrder)
  const [pinProjectColumn, setPinProjectColumn] = useState(loadListPinProject)
  const [listColumnDragKey, setListColumnDragKey] = useState<ListColumnKey | null>(null)
  const [activeFilters, setActiveFilters] = useState<ProjectsFilterKey[]>(loadProjectsFilterConfig)
  const [showFilterConfig, setShowFilterConfig] = useState(false)
  const [projectEmails, setProjectEmails] = useState<Map<number, ProjectEmail[]>>(new Map())
  const [filterEstimatingEmail, setFilterEstimatingEmail] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('projects-view-mode', viewMode)
  }, [viewMode])

  // If Project column is not first, pin state should be off so the icon
  // never shows \"pinned\" when Project is in 2nd/3rd/etc positions.
  useEffect(() => {
    if (listColumnOrder[0] !== 'project' && pinProjectColumn) {
      setPinProjectColumn(false)
    }
  }, [listColumnOrder, pinProjectColumn])

  const FILTER_LABELS: Record<ProjectsFilterKey, string> = {
    project: 'Project',
    email: 'Estimating email',
    minSheets: 'Min sheets',
    maxSheets: 'Max sheets',
    dateFrom: 'From date',
    dateTo: 'To date',
    sort: 'Sort',
  }

  useEffect(() => {
    try {
      localStorage.setItem(LIST_COLUMN_ORDER_KEY, JSON.stringify(listColumnOrder))
    } catch {}
  }, [listColumnOrder])

  useEffect(() => {
    try {
      localStorage.setItem(LIST_PIN_PROJECT_KEY, String(pinProjectColumn))
    } catch {}
  }, [pinProjectColumn])

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTERS_CONFIG_KEY, JSON.stringify(activeFilters))
    } catch {}
  }, [activeFilters])

  // React to designer header actions via hash (#upload, #new)
  useEffect(() => {
    if (location.hash === '#upload' || location.hash === '#new') {
      setShowUploadModal(true)
      navigate('/designer', { replace: true })
    }
  }, [location.hash, navigate])

  async function loadData() {
    try {
      const [projs, sets] = await Promise.all([fetchProjects(), fetchPlanSets()])
      setProjects(projs)
      setPlanSets(sets)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(
    projectId: number | null,
    projectName: string,
    planSetName: string,
    file: File,
  ) {
    try {
      let project: Project | undefined

      if (projectId != null) {
        project = projects.find((p) => p.id === projectId)
      } else {
        project = projects.find((p) => p.name === projectName)
        if (!project) {
          const created = await createProject({ name: projectName }, token ?? undefined)
          if (created) {
            project = created
            setProjects((prev) => [...prev, created])
          }
        }
      }

      if (!project) {
        throw new Error('Project not found')
      }

      const planSet = await uploadPlanSet(project.id, planSetName, file)
      setUploadedPlanSetId(planSet.id)
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message)
    }
  }

  async function loadProjectEmailsForProject(projectId: number) {
    if (projectEmails.has(projectId)) return
    try {
      const emails = await fetchProjectEmails(projectId)
      setProjectEmails((prev) => new Map(prev).set(projectId, emails))
    } catch {
      // silently ignore - emails are optional
    }
  }

  function handleUploadComplete() {
    setUploadedPlanSetId(null)
    setShowUploadModal(false)
    void loadData()
  }

  const filteredPlanSets = planSets
    .filter((ps) => {
      const project = projects.find((p) => p.id === ps.project)
      if (!project) return false

      const isStarred = !!project.is_starred
      const isArchived = !!project.is_archived
      const isMine = user ? project.owner === user.id : false

      if (category === 'all') {
        // All active (non-archived) projects
        return !isArchived
      }
      if (category === 'starred') {
        return isStarred && !isArchived
      }
      if (category === 'my') {
        return isMine && !isArchived
      }
      if (category === 'archived') {
        return isArchived
      }
      return true
    })
    .filter((ps) => {
      if (filter === 'all') return true
      const project = projects.find((p) => p.id === ps.project)
      return project?.name.toLowerCase().includes(filter.toLowerCase())
    })
    .filter((ps) => {
      if (!searchQuery) return true
      return ps.name.toLowerCase().includes(searchQuery.toLowerCase())
    })
    .filter((ps) => {
      if (filterProjectId != null && ps.project !== filterProjectId) return false
      if (filterEstimatingEmail) {
        const proj = projects.find((p) => p.id === ps.project)
        if (!proj || proj.estimating_email !== filterEstimatingEmail) return false
      }
      const sheetCount = ps.pages?.length || 0
      if (filterMinSheets != null && sheetCount < filterMinSheets) return false
      if (filterMaxSheets != null && sheetCount > filterMaxSheets) return false
      if (filterDateFrom) {
        const psDate = ps.created_at ? new Date(ps.created_at) : null
        if (!psDate || psDate < new Date(filterDateFrom)) return false
      }
      if (filterDateTo) {
        const psDate = ps.created_at ? new Date(ps.created_at) : null
        if (!psDate || psDate > new Date(filterDateTo + 'T23:59:59')) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    })

  const visiblePlanSets = filteredPlanSets.filter((ps) =>
    selectedProjectId != null ? ps.project === selectedProjectId : true,
  )

  if (loading) {
    return (
      <div className="projects-page">
        <div className="loading">Loading your projects…</div>
      </div>
    )
  }

  const totalProjects = projects.length
  const activeProjects = projects.filter((p) => !p.is_archived).length
  const starredProjects = projects.filter((p) => p.is_starred).length
  const archivedProjects = projects.filter((p) => p.is_archived).length

  const activeCategoryLabel =
    {
      all: 'All projects',
      starred: 'Starred projects',
      my: 'My projects',
      archived: 'Archived projects',
    }[category] || 'All projects'

  return (
    <div className="projects-page">
      <div className="projects-gradient" />
      <div className="projects-layout">
        <aside className="projects-sidebar-glass" aria-label="Projects">
          <div className="projects-sidebar-filters" aria-label="Project filters">
            <button
              type="button"
              className={`projects-sidebar-filter-btn ${category === 'all' ? 'active' : ''}`}
              onClick={() => {
                setCategory('all')
                setSelectedProjectId(null)
              }}
              title="All projects"
            >
              <span>All</span>
            </button>
            <button
              type="button"
              className={`projects-sidebar-filter-btn ${category === 'starred' ? 'active' : ''}`}
              onClick={() => {
                setCategory('starred')
                setSelectedProjectId(null)
              }}
              title="Starred projects"
            >
              <Star size={14} />
            </button>
            <button
              type="button"
              className={`projects-sidebar-filter-btn ${category === 'my' ? 'active' : ''}`}
              onClick={() => {
                setCategory('my')
                setSelectedProjectId(null)
              }}
              title="My projects"
            >
              <span>Me</span>
            </button>
            <button
              type="button"
              className={`projects-sidebar-filter-btn ${category === 'archived' ? 'active' : ''}`}
              onClick={() => {
                setCategory('archived')
                setSelectedProjectId(null)
              }}
              title="Archived projects"
            >
              <ArchiveIcon size={14} />
            </button>
          </div>

          <div className="projects-tree" aria-label="Projects and plan sets">
            {projects.length === 0 && <div className="projects-tree-empty">No projects yet.</div>}
            {projects
              .filter((project) => {
                const isStarred = !!project.is_starred
                const isArchived = !!project.is_archived
                const isMine = user ? project.owner === user.id : false
                if (category === 'all') return !isArchived
                if (category === 'starred') return isStarred && !isArchived
                if (category === 'my') return isMine && !isArchived
                if (category === 'archived') return isArchived
                return true
              })
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((project) => {
                const projectPlanSets = planSets.filter((ps) => ps.project === project.id)
                const totalPages = projectPlanSets.reduce((sum, ps) => sum + (ps.pages?.length || 0), 0)
                const isExpanded = expandedProjects.has(project.id)
                const isSelected = selectedProjectId === project.id
                return (
                  <div key={project.id} className="projects-tree-project">
                    <button
                      type="button"
                      className={`projects-tree-project-header ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedProjectId(project.id)
                        setExpandedProjects((prev) => {
                          const next = new Set(prev)
                          next.add(project.id)
                          return next
                        })
                        void loadProjectEmailsForProject(project.id)
                      }}
                    >
                      <span
                        className="projects-tree-project-chevron"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedProjects((prev) => {
                            const next = new Set(prev)
                            if (next.has(project.id)) next.delete(project.id)
                            else next.add(project.id)
                            return next
                          })
                        }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="projects-tree-project-title">
                        {project.name || 'Untitled project'}
                      </span>
                      {totalPages > 0 && (
                        <span className="projects-tree-project-pages">{totalPages} sheets</span>
                      )}
                    </button>
                    {isExpanded && projectPlanSets.length > 0 && (
                      <div className="projects-tree-plan-list">
                        {projectPlanSets.map((ps) => {
                          const totalPages = ps.pages?.length || 0
                          return (
                            <button
                              key={ps.id}
                              type="button"
                              className="projects-tree-plan"
                              onClick={() => navigate(`/designer/plan-set/${ps.id}/view`)}
                              title={ps.name}
                            >
                              <span className="projects-tree-plan-bullet" />
                              <span className="projects-tree-plan-name">{ps.name}</span>
                              <span className="projects-tree-plan-pages">{totalPages} sheets</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {isExpanded && projectPlanSets.length === 0 && (
                      <div className="projects-tree-plan-empty">No plan sets</div>
                    )}
                    {isExpanded && (
                      <div className="projects-tree-plan-list projects-tree-email-list">
                        <div className="projects-tree-email-section-title" title="Project emails: invitations and change notices">
                          Emails
                        </div>
                        <div className="projects-tree-email-group">
                          <span className="projects-tree-email-label">
                            <Inbox size={12} /> Invitations ({(projectEmails.get(project.id) || []).filter((e) => e.category === 'invite').length})
                          </span>
                          {(projectEmails.get(project.id) || []).filter((e) => e.category === 'invite').length === 0 ? (
                            <div className="projects-tree-email-empty">No invitations</div>
                          ) : (
                            (projectEmails.get(project.id) || []).filter((e) => e.category === 'invite').map((em) => (
                              <div key={em.id} className="projects-tree-plan projects-tree-email-item" title={em.subject}>
                                <Mail size={12} />
                                <span className="projects-tree-plan-name">{em.subject || '(no subject)'}</span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="projects-tree-email-group">
                          <span className="projects-tree-email-label">
                            <RefreshCw size={12} /> Changes ({(projectEmails.get(project.id) || []).filter((e) => e.category === 'change').length})
                          </span>
                          {(projectEmails.get(project.id) || []).filter((e) => e.category === 'change').length === 0 ? (
                            <div className="projects-tree-email-empty">No changes</div>
                          ) : (
                            (projectEmails.get(project.id) || []).filter((e) => e.category === 'change').map((em) => (
                              <div key={em.id} className="projects-tree-plan projects-tree-email-item" title={em.subject}>
                                <Mail size={12} />
                                <span className="projects-tree-plan-name">{em.subject || '(no subject)'}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          <div className="projects-sidebar-footer" />
        </aside>

        <main className="projects-main">
          <div className="projects-toolbar-row">
            <div className="projects-toolbar-glass">
              {/* Top row: search left, filter config + view toggle right */}
              <div className="projects-toolbar-top">
                <div className="search-input-wrapper">
                  <Search size={16} className="search-input-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search plan sets…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="projects-toolbar-main-actions">
                  <div className="projects-filter-customize">
                    <button
                      type="button"
                      className="projects-filter-config-btn"
                      onClick={() => setShowFilterConfig((v) => !v)}
                      title="Customize filters"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                    {showFilterConfig && (
                      <div className="projects-filter-config-menu">
                        {ALL_FILTER_KEYS.map((key) => {
                          const enabled = activeFilters.includes(key)
                          const idx = activeFilters.indexOf(key)
                          return (
                            <div key={key} className="projects-filter-config-row">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => {
                                    setActiveFilters((prev) => {
                                      if (prev.includes(key)) {
                                        return prev.filter((k) => k !== key)
                                      }
                                      return [...prev, key]
                                    })
                                  }}
                                />
                                <span>{FILTER_LABELS[key]}</span>
                              </label>
                              <div className="projects-filter-config-arrows">
                                <button
                                  type="button"
                                  disabled={!enabled || idx <= 0}
                                  onClick={() =>
                                    setActiveFilters((prev) => {
                                      const i = prev.indexOf(key)
                                      if (i <= 0) return prev
                                      const next = [...prev]
                                      const [item] = next.splice(i, 1)
                                      next.splice(i - 1, 0, item)
                                      return next
                                    })
                                  }
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={!enabled || idx === -1 || idx >= activeFilters.length - 1}
                                  onClick={() =>
                                    setActiveFilters((prev) => {
                                      const i = prev.indexOf(key)
                                      if (i === -1 || i >= prev.length - 1) return prev
                                      const next = [...prev]
                                      const [item] = next.splice(i, 1)
                                      next.splice(i + 1, 0, item)
                                      return next
                                    })
                                  }
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="projects-view-toggle">
                    <button
                      type="button"
                      className={`projects-view-toggle-btn ${
                        viewMode === 'grid' ? 'active' : ''
                      }`}
                      onClick={() => setViewMode('grid')}
                      title="Card view"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      type="button"
                      className={`projects-view-toggle-btn ${
                        viewMode === 'list' ? 'active' : ''
                      }`}
                      onClick={() => setViewMode('list')}
                      title="List view"
                    >
                      <ListIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
              {/* Second row: basic filter dropdowns */}
              <div className="projects-toolbar-filters-row">
              {activeFilters.map((key) => {
                if (key === 'project') {
                  return (
                    <select
                      key={key}
                      className="filter-select"
                      value={filterProjectId || ''}
                      onChange={(e) => setFilterProjectId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">All projects</option>
                      {projects
                        .filter((p) => {
                          const isArchived = !!p.is_archived
                          if (category === 'archived') return isArchived
                          return !isArchived
                        })
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  )
                }
                if (key === 'email') {
                  const emails = [...new Set(projects.map((p) => p.estimating_email).filter(Boolean))]
                  if (emails.length === 0) return null
                  return (
                    <select
                      key={key}
                      className="filter-select"
                      value={filterEstimatingEmail}
                      onChange={(e) => setFilterEstimatingEmail(e.target.value)}
                    >
                      <option value="">All emails</option>
                      {emails.map((em) => (
                        <option key={em} value={em}>{em}</option>
                      ))}
                    </select>
                  )
                }
                if (key === 'minSheets') {
                  return (
                    <select
                      key={key}
                      className="filter-select"
                      value={filterMinSheets || ''}
                      onChange={(e) => setFilterMinSheets(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Min sheets</option>
                      <option value="1">1+ sheets</option>
                      <option value="5">5+ sheets</option>
                      <option value="10">10+ sheets</option>
                      <option value="20">20+ sheets</option>
                      <option value="50">50+ sheets</option>
                    </select>
                  )
                }
                if (key === 'maxSheets') {
                  return (
                    <select
                      key={key}
                      className="filter-select"
                      value={filterMaxSheets || ''}
                      onChange={(e) => setFilterMaxSheets(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Max sheets</option>
                      <option value="5">Up to 5</option>
                      <option value="10">Up to 10</option>
                      <option value="20">Up to 20</option>
                      <option value="50">Up to 50</option>
                    </select>
                  )
                }
                if (key === 'dateFrom') {
                  return (
                    <input
                      key={key}
                      type="date"
                      className="filter-date-input"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      placeholder="From date"
                      title="Created from"
                    />
                  )
                }
                if (key === 'dateTo') {
                  return (
                    <input
                      key={key}
                      type="date"
                      className="filter-date-input"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      placeholder="To date"
                      title="Created to"
                    />
                  )
                }
                if (key === 'sort') {
                  return (
                    <select
                      key={key}
                      className="sort-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'name' | 'created_at')}
                    >
                      <option value="created_at">Newest first</option>
                      <option value="name">Name A–Z</option>
                    </select>
                  )
                }
                return null
              })}
              </div>
            </div>
          </div>

          <div className="projects-content-scroll">
          {viewMode === 'grid' ? (
            <div className="projects-grid-scroll">
              <motion.div
                className="projects-grid"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.08 }}
              >
                {visiblePlanSets.map((planSet) => {
                const project = projects.find((p) => p.id === planSet.project)
                const createdLabel = planSet.created_at
                  ? new Date(planSet.created_at).toLocaleDateString()
                  : '—'
                const pagesCount = planSet.pages?.length || 0

                return (
                  <motion.button
                    key={planSet.id}
                    type="button"
                    className="project-card glass-card"
                    onClick={() => navigate(`/designer/plan-set/${planSet.id}/view`)}
                    whileHover={{ y: -2, boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    <div className="project-card-header">
                      <div>
                        <h3>{planSet.name}</h3>
                        <p className="project-subtitle">
                          {project?.name || 'Untitled project'}
                          {project?.client_name ? ` · ${project.client_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="project-card-body">
                      <p className="project-date">Created {createdLabel}</p>
                      {project && token && (
                        <div className="project-card-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="project-card-actions-left">
                            <button
                              type="button"
                              className={
                                'project-card-action-btn' +
                                (project.is_starred ? ' project-card-action-btn-starred' : '')
                              }
                              title={project.is_starred ? 'Unstar project' : 'Star project'}
                              onClick={async () => {
                                try {
                                  const updated = await updateProject(
                                    project.id,
                                    { is_starred: !project.is_starred },
                                    token,
                                  )
                                  setProjects((prev) =>
                                    prev.map((p) => (p.id === project.id ? updated : p)),
                                  )
                                } catch (err) {
                                  alert((err as Error).message)
                                }
                              }}
                            >
                              <Star size={12} />
                            </button>
                            <button
                              type="button"
                              className={
                                'project-card-action-btn' +
                                (project.is_archived ? ' project-card-action-btn-archived' : '')
                              }
                              title={project.is_archived ? 'Unarchive project' : 'Archive project'}
                              onClick={async () => {
                                try {
                                  const updated = await updateProject(
                                    project.id,
                                    { is_archived: !project.is_archived },
                                    token,
                                  )
                                  setProjects((prev) =>
                                    prev.map((p) => (p.id === project.id ? updated : p)),
                                  )
                                } catch (err) {
                                  alert((err as Error).message)
                                }
                              }}
                            >
                              <ArchiveIcon size={12} />
                            </button>
                            <button
                              type="button"
                              className="project-card-action-btn"
                              title="Edit project"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingProject(project)
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="project-card-action-btn project-card-action-danger"
                              title="Delete project"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteProjectTarget(project)
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="project-pages-chip">
                            <FileText size={12} />
                            <span>{pagesCount}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.button>
                )
              })}
              </motion.div>
              {visiblePlanSets.length === 0 && (
                <div className="empty-state glass-card">
                  <p>No plan sets found. Adjust filters or upload a new project.</p>
                </div>
              )}
            </div>
          ) : (
            <motion.div
              className="projects-list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08 }}
            >
              <div
                className="projects-list-header"
                style={{
                  gridTemplateColumns: listColumnOrder
                    .map((k) =>
                      k === 'project'
                        ? 'minmax(150px, 2fr)'
                        : k === 'planSet'
                          ? 'minmax(180px, 2fr)'
                          : k === 'created'
                            ? 'minmax(100px, 1.2fr)'
                            : k === 'pages'
                              ? 'minmax(60px, 0.8fr)'
                              : 'minmax(140px, 1.6fr)',
                    )
                    .join(' '),
                }}
              >
                {listColumnOrder.map((colKey) => (
                  <span
                    key={colKey}
                    className={
                      (colKey === 'project'
                        ? `projects-list-col-project ${pinProjectColumn ? 'projects-list-col-pinned' : ''}`
                        : colKey === 'planSet'
                          ? 'projects-list-col-name'
                          : colKey === 'created'
                            ? 'projects-list-col-date'
                            : colKey === 'pages'
                              ? 'projects-list-col-pages'
                              : 'projects-list-col-actions') +
                      (listColumnDragKey === colKey ? ' projects-list-col-dragging' : '')
                    }
                    draggable
                    onDragStart={(e) => {
                      if ((e.target as HTMLElement).closest?.('.projects-list-pin-btn')) {
                        e.preventDefault()
                        return
                      }
                      setListColumnDragKey(colKey)
                    }}
                    onDragEnd={() => setListColumnDragKey(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (!listColumnDragKey || listColumnDragKey === colKey) return
                      let nextOrder: ListColumnKey[] | null = null
                      setListColumnOrder((prev) => {
                        const from = prev.indexOf(listColumnDragKey)
                        const to = prev.indexOf(colKey)
                        if (from === -1 || to === -1) return prev
                        const next = [...prev]
                        next.splice(from, 1)
                        next.splice(to, 0, listColumnDragKey)
                        nextOrder = next
                        return next
                      })
                      // If Project column is no longer first after a manual drag,
                      // automatically un-pin it so pin semantics stay \"Project is first\".
                      if (nextOrder && nextOrder[0] !== 'project') {
                        setPinProjectColumn(false)
                      }
                    }}
                  >
                    {colKey === 'project' && (
                      <button
                        type="button"
                        className="projects-list-pin-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Pin also guarantees Project column is first
                          setListColumnOrder((prev) => [
                            'project',
                            ...prev.filter((k) => k !== 'project'),
                          ])
                          setPinProjectColumn((p) => !p)
                        }}
                        title={pinProjectColumn ? 'Unpin Project column' : 'Pin Project column and keep it first'}
                      >
                        <Pin size={12} className={pinProjectColumn ? 'pinned' : ''} />
                      </button>
                    )}
                    {colKey === 'project' && 'Project'}
                    {colKey === 'planSet' && 'Plan set'}
                    {colKey === 'created' && 'Created'}
                    {colKey === 'pages' && 'Sheets'}
                    {colKey === 'actions' && 'Actions'}
                  </span>
                ))}
              </div>
              <div className="projects-list-body">
              {visiblePlanSets.map((planSet) => {
                const project = projects.find((p) => p.id === planSet.project)
                const createdLabel = planSet.created_at
                  ? new Date(planSet.created_at).toLocaleDateString()
                  : '—'
                const pagesCount = planSet.pages?.length || 0

                return (
                  <button
                    key={planSet.id}
                    type="button"
                    className="projects-list-row"
                    onClick={() => navigate(`/designer/plan-set/${planSet.id}/view`)}
                    style={{
                      gridTemplateColumns: listColumnOrder
                        .map((k) =>
                          k === 'project'
                            ? 'minmax(150px, 2fr)'
                            : k === 'planSet'
                              ? 'minmax(180px, 2fr)'
                              : k === 'created'
                                ? 'minmax(100px, 1.2fr)'
                                : k === 'pages'
                                  ? 'minmax(60px, 0.8fr)'
                                  : 'minmax(140px, 1.6fr)',
                        )
                        .join(' '),
                    }}
                  >
                    {listColumnOrder.map((colKey) => {
                      if (colKey === 'project') {
                        return (
                          <span
                            key={colKey}
                            className={`projects-list-col-project ${pinProjectColumn ? 'projects-list-col-pinned' : ''}`}
                          >
                            <span className="projects-list-project-name">
                              {project?.name || 'Untitled project'}
                            </span>
                          </span>
                        )
                      }
                      if (colKey === 'planSet') {
                        return (
                          <span key={colKey} className="projects-list-col-name">
                            <span className="projects-list-plan-name">{planSet.name}</span>
                          </span>
                        )
                      }
                      if (colKey === 'created') {
                        return (
                          <span key={colKey} className="projects-list-col-date">
                            {createdLabel}
                          </span>
                        )
                      }
                      if (colKey === 'pages') {
                        return (
                          <span key={colKey} className="projects-list-col-pages">
                            {pagesCount}
                          </span>
                        )
                      }
                      return (
                        <span
                          key={colKey}
                          className="projects-list-col-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                      {project && token && (
                        <>
                          <button
                            type="button"
                            className={
                              'project-card-action-btn' +
                              (project.is_starred ? ' project-card-action-btn-starred' : '')
                            }
                            title={project.is_starred ? 'Unstar project' : 'Star project'}
                            onClick={async () => {
                              try {
                                const updated = await updateProject(
                                  project.id,
                                  { is_starred: !project.is_starred },
                                  token,
                                )
                                setProjects((prev) =>
                                  prev.map((p) => (p.id === project.id ? updated : p)),
                                )
                              } catch (err) {
                                alert((err as Error).message)
                              }
                            }}
                          >
                            <Star size={12} />
                          </button>
                          <button
                            type="button"
                            className={
                              'project-card-action-btn' +
                              (project.is_archived ? ' project-card-action-btn-archived' : '')
                            }
                            title={project.is_archived ? 'Unarchive project' : 'Archive project'}
                            onClick={async () => {
                              try {
                                const updated = await updateProject(
                                  project.id,
                                  { is_archived: !project.is_archived },
                                  token,
                                )
                                setProjects((prev) =>
                                  prev.map((p) => (p.id === project.id ? updated : p)),
                                )
                              } catch (err) {
                                alert((err as Error).message)
                              }
                            }}
                          >
                            <ArchiveIcon size={12} />
                          </button>
                          <button
                            type="button"
                            className="project-card-action-btn"
                            title="Edit project"
                            onClick={() => setEditingProject(project)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="project-card-action-btn project-card-action-danger"
                            title="Delete project"
                            onClick={() => setDeleteProjectTarget(project)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </span>
                      )
                    })}
                  </button>
                )
              })}
              </div>
              {visiblePlanSets.length === 0 && (
                <div className="empty-state glass-card">
                  <p>No plan sets found. Adjust filters or upload a new project.</p>
                </div>
              )}
            </motion.div>
          )}
          </div>
        </main>
      </div>

      {showUploadModal && (
        <UploadModal
          projects={projects}
          onClose={() => {
            setUploadedPlanSetId(null)
            setShowUploadModal(false)
          }}
          onUpload={handleUpload}
          uploadedPlanSetId={uploadedPlanSetId}
          onUploadComplete={handleUploadComplete}
          fetchPlanSet={fetchPlanSet}
        />
      )}

      {deleteProjectTarget && token && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (deletingProject) return
            setDeleteProjectTarget(null)
          }}
        >
          <div
            className="modal-content glass-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="confirm-modal-title">Delete project?</h2>
            <p className="confirm-modal-text">
              This will permanently delete{' '}
              <strong>{deleteProjectTarget.name || 'this project'}</strong> and all of its plan
              sets. This action cannot be undone.
            </p>
            <div className="modal-actions confirm-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingProject}
                onClick={() => setDeleteProjectTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={deletingProject}
                onClick={async () => {
                  if (!deleteProjectTarget) return
                  try {
                    setDeletingProject(true)
                    await deleteProject(deleteProjectTarget.id, token)
                    setProjects((prev) => prev.filter((p) => p.id !== deleteProjectTarget.id))
                    setPlanSets((prev) =>
                      prev.filter((ps) => ps.project !== deleteProjectTarget.id),
                    )
                    setDeleteProjectTarget(null)
                  } catch (err) {
                    alert((err as Error).message)
                    setDeletingProject(false)
                  } finally {
                    setDeletingProject(false)
                  }
                }}
              >
                {deletingProject ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProject && token && (
        <ProjectEditModal
          project={editingProject}
          planSets={planSets.filter((ps) => ps.project === editingProject.id)}
          token={token}
          onClose={() => setEditingProject(null)}
          onProjectUpdated={(updated) => {
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            setEditingProject(null)
          }}
        />
      )}
    </div>
  )
}

function ProjectEditModal({
  project,
  planSets,
  token,
  onClose,
  onProjectUpdated,
}: {
  project: Project
  planSets: PlanSet[]
  token: string
  onClose: () => void
  onProjectUpdated: (project: Project) => void
}) {
  const navigate = useNavigate()
  const [name, setName] = useState(project.name)
  const [clientName, setClientName] = useState(project.client_name)
  const [estimatingEmail, setEstimatingEmail] = useState(project.estimating_email || '')
  const [description, setDescription] = useState(project.description)
  const [isStarred, setIsStarred] = useState(!!project.is_starred)
  const [isArchived, setIsArchived] = useState(!!project.is_archived)
  const [saving, setSaving] = useState(false)
  const [showUploadSection, setShowUploadSection] = useState(false)
  const [uploadPlanSetName, setUploadPlanSetName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const updated = await updateProject(
        project.id,
        {
          name,
          client_name: clientName,
          estimating_email: estimatingEmail,
          description,
          is_starred: isStarred,
          is_archived: isArchived,
        },
        token,
      )
      onProjectUpdated(updated)
    } catch (err) {
      alert((err as Error).message)
      setSaving(false)
    }
  }

  async function handleUploadMorePlans(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile || !uploadPlanSetName || uploading) return
    setUploading(true)
    try {
      await uploadPlanSet(project.id, uploadPlanSetName, uploadFile)
      setUploadPlanSetName('')
      setUploadFile(null)
      setShowUploadSection(false)
      alert('Plan set uploaded successfully! Refresh the page to see it.')
      window.location.reload()
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message)
      setUploading(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!saving) onClose()
      }}
    >
      <div
        className="modal-content glass-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Edit project</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Project name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Client</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="form-group">
            <label>Estimating email</label>
            <input
              type="email"
              value={estimatingEmail}
              onChange={(e) => setEstimatingEmail(e.target.value)}
              placeholder="e.g. bids@company.com"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="form-group-inline">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isStarred}
                onChange={(e) => setIsStarred(e.target.checked)}
              />
              Starred
            </label>
          </div>
          <div className="form-group-inline">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isArchived}
                onChange={(e) => setIsArchived(e.target.checked)}
              />
              Archived
            </label>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ marginBottom: 0 }}>Plan sets & drawings</label>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                onClick={() => setShowUploadSection(!showUploadSection)}
              >
                {showUploadSection ? 'Cancel upload' : '+ Upload more plans'}
              </button>
            </div>

            {showUploadSection && (
              <div className="projects-edit-upload-section">
                <form onSubmit={handleUploadMorePlans}>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem' }}>Plan set name</label>
                    <input
                      type="text"
                      value={uploadPlanSetName}
                      onChange={(e) => setUploadPlanSetName(e.target.value)}
                      placeholder="e.g. Architectural set – Rev C"
                      required
                      style={{ fontSize: '0.85rem', padding: '0.4rem' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem' }}>PDF file</label>
                    <label className="file-input" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        required
                      />
                      <span className="file-input-button">
                        <UploadCloud size={14} />
                        <span>{uploadFile ? uploadFile.name : 'Choose PDF'}</span>
                      </span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={uploading || !uploadFile || !uploadPlanSetName}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                  >
                    {uploading ? 'Uploading…' : 'Upload plan set'}
                  </button>
                </form>
              </div>
            )}

            {planSets.length === 0 && !showUploadSection && (
              <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>This project has no plan sets yet.</p>
            )}
            {planSets.length > 0 && (
              <ul className="projects-edit-plan-list">
                {planSets.map((ps) => (
                  <li key={ps.id} className="projects-edit-plan-item">
                    <div>
                      <div className="projects-edit-plan-name">{ps.name}</div>
                      <div className="projects-edit-plan-meta">
                        {ps.pages?.length || 0} sheets
                        {ps.pages && ps.pages.length > 0 && (
                          <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>
                            ({ps.pages.map((p) => p.page_number).join(', ')})
                          </span>
                        )}
                      </div>
                      {ps.pages && ps.pages.length > 0 && (
                        <div className="projects-edit-plan-images">
                          {ps.pages.slice(0, 6).map((page) => (
                            <img
                              key={page.id}
                              src={page.image.startsWith('http') ? page.image : `${MEDIA_BASE}/${page.image}`}
                              alt={`Page ${page.page_number}`}
                              className="projects-edit-plan-thumb"
                              title={`Page ${page.page_number}: ${page.title || 'Untitled'}`}
                            />
                          ))}
                          {ps.pages.length > 6 && (
                            <div className="projects-edit-plan-thumb-more">+{ps.pages.length - 6}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          navigate(`/designer/plan-set/${ps.id}/view`)
                          onClose()
                        }}
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      >
                        View & manage
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UploadModal({
  projects,
  onClose,
  onUpload,
  uploadedPlanSetId,
  onUploadComplete,
  fetchPlanSet,
}: {
  projects: Project[]
  onClose: () => void
  onUpload: (
    projectId: number | null,
    projectName: string,
    planSetName: string,
    file: File,
  ) => Promise<void>
  uploadedPlanSetId: number | null
  onUploadComplete: () => void
  fetchPlanSet: (id: number) => Promise<PlanSet>
}) {
  const [projectName, setProjectName] = useState('')
  const [planSetName, setPlanSetName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [useExistingProject, setUseExistingProject] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progressTotal, setProgressTotal] = useState<number | null>(null)
  const [progressDone, setProgressDone] = useState<number | null>(null)

  // Poll for conversion progress when we have an uploaded plan set id
  useEffect(() => {
    if (!uploadedPlanSetId || !fetchPlanSet) return
    const planSetId = uploadedPlanSetId
    let cancelled = false
    async function tick() {
      if (cancelled) return
      try {
        const planSet = await fetchPlanSet(planSetId)
        setProgressTotal(planSet.processing_pages_total ?? null)
        setProgressDone(planSet.processing_pages_done ?? null)
        if (planSet.processing_pages_total == null) {
          onUploadComplete()
        }
      } catch {
        // ignore poll errors
      }
    }
    void tick()
    const interval = setInterval(tick, 500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [uploadedPlanSetId, fetchPlanSet, onUploadComplete])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!selectedFile) {
      alert('Please select a PDF file')
      return
    }
    if (useExistingProject) {
      if (!selectedProjectId) {
        alert('Please choose an existing project')
        return
      }
      setSubmitting(true)
      void onUpload(selectedProjectId, '', planSetName, selectedFile).finally(() =>
        setSubmitting(false),
      )
    } else {
      if (!projectName) {
        alert('Please enter a project name')
        return
      }
      setSubmitting(true)
      void onUpload(null, projectName, planSetName, selectedFile).finally(() =>
        setSubmitting(false),
      )
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Upload plan set</h2>
          <p className="modal-subtitle">
            Create a new project or attach pages to an existing one. We&apos;ll process the PDF
            into individual sheets automatically.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-toggle-row">
            <button
              type="button"
              className={`modal-toggle ${!useExistingProject ? 'active' : ''}`}
              onClick={() => setUseExistingProject(false)}
            >
              New project
            </button>
            <button
              type="button"
              className={`modal-toggle ${useExistingProject ? 'active' : ''}`}
              onClick={() => setUseExistingProject(true)}
            >
              Use existing
            </button>
          </div>

          {useExistingProject ? (
            <div className="form-group">
              <label>Project</label>
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                required
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Project name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required={!useExistingProject}
                placeholder="e.g. Midtown Tower Renovation"
              />
            </div>
          )}

          <div className="form-group">
            <label>Plan set name</label>
            <input
              type="text"
              value={planSetName}
              onChange={(e) => setPlanSetName(e.target.value)}
              required
              placeholder="e.g. Architectural set – Rev B"
            />
          </div>

          <div className="form-group">
            <label>PDF file</label>
            <label className="file-input">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                required
              />
              <span className="file-input-button">
                <UploadCloud size={16} />
                <span>
                  {selectedFile ? selectedFile.name : 'Choose PDF'}
                </span>
              </span>
            </label>
          </div>

          {uploadedPlanSetId != null ? (
            <div className="modal-progress">
              <p className="modal-progress-text">
                {progressTotal != null && progressDone != null
                  ? `Converting page ${progressDone} of ${progressTotal}…`
                  : 'Starting conversion…'}
              </p>
              {progressTotal != null && progressTotal > 0 && (
                <div className="modal-progress-bar-wrap">
                  <div
                    className="modal-progress-bar"
                    style={{
                      width: `${Math.round(((progressDone ?? 0) / progressTotal) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
