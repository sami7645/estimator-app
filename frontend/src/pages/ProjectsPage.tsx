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
} from 'lucide-react'
import type { Project, PlanSet } from '../api'
import {
  fetchProjects,
  createProject,
  fetchPlanSets,
  fetchPlanSet,
  uploadPlanSet,
  updateProject,
  deleteProject,
  MEDIA_BASE,
} from '../api'
import { useAuth } from '../context/AuthContext'
import './ProjectsPage.css'

type ProjectCategory = 'all' | 'starred' | 'my' | 'archived'

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

  useEffect(() => {
    void loadData()
  }, [])

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('projects-view-mode', viewMode)
  }, [viewMode])

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
          project = await createProject({ name: projectName }, token ?? undefined)
          setProjects((prev) => [...prev, project])
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
                              onClick={() => navigate(`/designer/plan-set/${ps.id}`)}
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
                  </div>
                )
              })}
          </div>

          <div className="projects-sidebar-footer" />
        </aside>

        <main className="projects-main">
          <div className="projects-toolbar-row">
            <div className="projects-toolbar-glass">
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
              
              <select
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

              <select
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

              <select
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

              <input
                type="date"
                className="filter-date-input"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From date"
                title="Created from"
              />

              <input
                type="date"
                className="filter-date-input"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To date"
                title="Created to"
              />

              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'created_at')}
              >
                <option value="created_at">Newest first</option>
                <option value="name">Name A–Z</option>
              </select>

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

          {viewMode === 'grid' ? (
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
                    onClick={() => navigate(`/designer/plan-set/${planSet.id}`)}
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
              {visiblePlanSets.length === 0 && (
                <div className="empty-state glass-card">
                  <p>No plan sets found. Adjust filters or upload a new project.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              className="projects-list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08 }}
            >
              <div className="projects-list-header">
                <span className="projects-list-col-name">Plan set</span>
                <span className="projects-list-col-project">Project</span>
                <span className="projects-list-col-date">Created</span>
                <span className="projects-list-col-pages">Sheets</span>
                <span className="projects-list-col-actions">Actions</span>
              </div>
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
                    onClick={() => navigate(`/designer/plan-set/${planSet.id}`)}
                  >
                    <span className="projects-list-col-name">
                      <span className="projects-list-plan-name">{planSet.name}</span>
                    </span>
                    <span className="projects-list-col-project">
                      <span className="projects-list-project-name">
                        {project?.name || 'Untitled project'}
                      </span>
                    </span>
                    <span className="projects-list-col-date">{createdLabel}</span>
                    <span className="projects-list-col-pages">{pagesCount}</span>
                    <span
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
                  </button>
                )
              })}
              {visiblePlanSets.length === 0 && (
                <div className="empty-state glass-card">
                  <p>No plan sets found. Adjust filters or upload a new project.</p>
                </div>
              )}
            </motion.div>
          )}
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
                          navigate(`/designer/plan-set/${ps.id}`)
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
    let cancelled = false
    async function tick() {
      if (cancelled) return
      try {
        const planSet = await fetchPlanSet(uploadedPlanSetId)
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
