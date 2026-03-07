// Use env vars in production (set by build: VITE_API_BASE=/api VITE_MEDIA_BASE=/media)
// Fallback to localhost for local dev with Vite
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api'
export const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE ?? 'http://localhost:8000/media'

export type SubscriptionInfo = {
  plan: string
  status: string
  is_active: boolean
}

export type AuthUser = {
  id: number
  username: string
  email: string
  subscription?: SubscriptionInfo | null
  privacy_agreed?: boolean
}

export async function authRegister(data: {
  username: string
  email?: string
  password: string
}): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || 'Registration failed')
  return json
}

export async function authLogin(data: {
  username: string
  password: string
}): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || 'Login failed')
  return json
}

export async function authLogout(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
  })
  if (!res.ok) throw new Error('Logout failed')
}

export async function authMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/me/`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

export async function authChangePassword(
  token: string,
  data: { current_password: string; new_password: string }
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/change-password/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || 'Failed to change password')
}

export async function fetchMyProjects(token: string): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects/?owner=me`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load projects')
  return res.json()
}

export type PlanPage = {
  id: number
  page_number: number
  title: string
  image: string
  /** Second background (e.g. satellite view); same scale as image. */
  image_alt?: string | null
  plan_set: number
  dpi_x?: number | null
  dpi_y?: number | null
}

export type PlanSet = {
  id: number
  name: string
  pdf_file: string
  project: number
  pages: PlanPage[]
  created_at?: string
  /** Set while PDF is being converted to page images; null when done. */
  processing_pages_total?: number | null
  processing_pages_done?: number | null
}

export type Project = {
  id: number
  name: string
  description: string
  client_name: string
  estimating_email: string
  owner: number | null
  created_at: string
  updated_at: string
  is_starred?: boolean
  is_archived?: boolean
}

export type ProjectEmail = {
  id: number
  project: number
  subject: string
  sender: string
  body_preview: string
  category: 'invite' | 'change' | 'general'
  received_at: string | null
  is_read: boolean
  raw_headers: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CountDefinition = {
  id: number
  name: string
  count_type: 'area_perimeter' | 'linear_feet' | 'each'
  color: string
  shape: string
  shape_image_url?: string | null
  trade: string
  plan_set: number
}

export type CountItem = {
  id: number
  count_definition: number
  page: number
  geometry_type: 'point' | 'polyline' | 'polygon' | 'rect' | 'circle' | 'triangle'
  geometry: number[][] // normalized [0,1] coordinates
  area_sqft: number | null
  perimeter_ft: number | null
  length_ft: number | null
  rotation_deg?: number | null
  is_auto_detected?: boolean
}

export type ScaleCalibration = {
  id: number
  page: number
  real_world_feet: number
  pixel_distance: number
}

export type Detection = {
  id: number
  plan_page: number
  trade: string
  count_definition: number | null
  geometry: number[][]
  score: number
  is_confirmed: boolean
  is_deleted: boolean
}

export type ContactMessage = {
  id: number
  name: string
  email: string
  message: string
  reply: string
  replied_at: string | null
  created_at: string
}

export async function submitContact(data: {
  name: string
  email: string
  message: string
}, token?: string | null): Promise<ContactMessage> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Token ${token}`
  const res = await fetch(`${API_BASE}/contact/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || 'Failed to send message')
  return json
}

export async function fetchMyMessages(token: string): Promise<ContactMessage[]> {
  const res = await fetch(`${API_BASE}/contact/mine/`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load messages')
  return res.json()
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects/`)
  if (!res.ok) throw new Error('Failed to load projects')
  return res.json()
}

export async function createProject(
  data: Partial<Project>,
  token?: string | null
): Promise<Project> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Token ${token}`
  const res = await fetch(`${API_BASE}/projects/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || json.name?.[0] || 'Failed to create project')
  return json
}

export async function updateProject(
  id: number,
  data: Partial<Project>,
  token: string
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || json.name?.[0] || 'Failed to update project')
  return json
}

export async function deleteProject(id: number, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}/`, {
    method: 'DELETE',
    headers: {
      Authorization: `Token ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Failed to delete project')
  }
}

export async function fetchProjectEmails(
  projectId: number,
  category?: string,
): Promise<ProjectEmail[]> {
  let url = `${API_BASE}/project-emails/?project=${projectId}`
  if (category) url += `&category=${category}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load project emails')
  return res.json()
}

export async function createProjectEmail(
  data: Partial<ProjectEmail>,
): Promise<ProjectEmail> {
  const res = await fetch(`${API_BASE}/project-emails/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create project email')
  return res.json()
}

export async function fetchPlanSets(projectId?: number): Promise<PlanSet[]> {
  const url = projectId
    ? `${API_BASE}/plan-sets/?project=${projectId}`
    : `${API_BASE}/plan-sets/`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load plan sets')
  return res.json()
}

export async function uploadPlanSet(
  projectId: number,
  name: string,
  pdfFile: File
): Promise<PlanSet> {
  const formData = new FormData()
  formData.append('project', projectId.toString())
  formData.append('name', name)
  formData.append('pdf_file', pdfFile)

  const res = await fetch(`${API_BASE}/plan-sets/`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to upload: ${error}`)
  }
  return res.json()
}

export async function fetchPlanSet(id: number): Promise<PlanSet> {
  const res = await fetch(`${API_BASE}/plan-sets/${id}/`)
  if (!res.ok) throw new Error('Failed to load plan set')
  return res.json()
}

/** Upload second background image for a page (e.g. satellite view). Accepts image (jpg/png/...) or PDF (first page as PNG). */
export async function uploadPlanPageAlt(pageId: number, file: File): Promise<PlanPage> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/pages/${pageId}/upload_alt/`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to upload alternate image')
  }
  return res.json()
}

export async function fetchCountDefinitions(planSetId: number): Promise<CountDefinition[]> {
  const res = await fetch(`${API_BASE}/count-definitions/?plan_set=${planSetId}`)
  if (!res.ok) throw new Error('Failed to load count definitions')
  return res.json()
}

export async function createCountDefinition(data: Partial<CountDefinition>): Promise<CountDefinition> {
  const res = await fetch(`${API_BASE}/count-definitions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create count definition')
  return res.json()
}

export async function updateCountDefinition(
  id: number,
  data: Partial<CountDefinition>
): Promise<CountDefinition> {
  const res = await fetch(`${API_BASE}/count-definitions/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update count definition')
  return res.json()
}

export async function deleteCountDefinition(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/count-definitions/${id}/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete count definition')
}

export async function fetchCountItems(
  countDefinitionId?: number,
  pageId?: number,
  planSetId?: number
): Promise<CountItem[]> {
  let url = `${API_BASE}/count-items/`
  const params = new URLSearchParams()
  if (countDefinitionId) params.append('count_definition', countDefinitionId.toString())
  if (pageId) params.append('page', pageId.toString())
  if (planSetId) params.append('plan_set', planSetId.toString())
  if (params.toString()) url += '?' + params.toString()

  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load count items')
  return res.json()
}

export async function createCountItem(data: Partial<CountItem>): Promise<CountItem> {
  const res = await fetch(`${API_BASE}/count-items/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create count item')
  return res.json()
}

export async function updateCountItem(id: number, data: Partial<CountItem>): Promise<CountItem> {
  const res = await fetch(`${API_BASE}/count-items/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update count item')
  return res.json()
}

export async function deleteCountItem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/count-items/${id}/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete count item')
}

export async function fetchScaleCalibration(pageId: number): Promise<ScaleCalibration | null> {
  const res = await fetch(`${API_BASE}/scales/?page=${pageId}`)
  if (!res.ok) return null
  const data = await res.json()
  if (Array.isArray(data) && data.length > 0) return data[0]
  return null
}

export async function saveScaleCalibration(data: {
  page: number
  real_world_feet: number
  pixel_distance: number
}): Promise<ScaleCalibration> {
  const res = await fetch(`${API_BASE}/scales/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save scale calibration')
  return res.json()
}

export async function createScaleCalibration(data: Partial<ScaleCalibration>): Promise<ScaleCalibration> {
  const res = await fetch(`${API_BASE}/scales/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create scale calibration')
  return res.json()
}

export async function addPageToDataset(
  pageId: number,
  trade: string,
  countDefinitionId?: number
): Promise<void> {
  const res = await fetch(`${API_BASE}/pages/${pageId}/add_to_dataset/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trade, count_definition_id: countDefinitionId }),
  })
  if (!res.ok) throw new Error('Failed to add page to dataset')
}

export type AutoDetectResult = {
  items_created: CountItem[]
  definitions_created: CountDefinition[]
  removed_ids: number[]
  count: number
  dataset_summary: Record<string, { page_examples: number; uploaded_images: number; total: number }>
}

export async function runAutoDetect(
  pageId: number,
  trades: string[]
): Promise<AutoDetectResult> {
  const res = await fetch(`${API_BASE}/detections/run_auto_detect/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_page_id: pageId, trades }),
  })
  if (!res.ok) throw new Error('Failed to run auto detect')
  return res.json()
}

export type ExcelPricePreset = {
  pricePerEach?: number
  pricePerSqft?: number
  pricePerPerimeterFt?: number
  pricePerLinearFt?: number
}

export async function exportCountsExcel(planSetId?: number, pricePreset?: ExcelPricePreset): Promise<Blob> {
  const params = new URLSearchParams()
  if (planSetId) params.set('plan_set', String(planSetId))
  if (pricePreset?.pricePerEach != null) params.set('price_per_each', String(pricePreset.pricePerEach))
  if (pricePreset?.pricePerSqft != null) params.set('price_per_sqft', String(pricePreset.pricePerSqft))
  if (pricePreset?.pricePerPerimeterFt != null) params.set('price_per_perimeter_ft', String(pricePreset.pricePerPerimeterFt))
  if (pricePreset?.pricePerLinearFt != null) params.set('price_per_linear_ft', String(pricePreset.pricePerLinearFt))
  const qs = params.toString()
  const url = `${API_BASE}/detections/export_counts_excel/${qs ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to export Excel')
  return res.blob()
}

// ──────────────────────────────────────────────────────────────
//  Subscription API
// ──────────────────────────────────────────────────────────────

export type Subscription = {
  id: number
  owner: number
  owner_username: string
  owner_email: string
  plan: string
  status: string
  max_team_members: number
  stripe_customer_id: string
  stripe_subscription_id: string
  current_period_start: string | null
  current_period_end: string | null
  team_members: TeamMember[]
  created_at: string
  updated_at: string
}

export type TeamMember = {
  id: number
  user_id: number
  username: string
  email: string
  role: 'viewer' | 'editor'
  invited_email: string
  accepted: boolean
  created_at: string
}

export async function fetchSubscription(token: string): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/subscription/`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load subscription')
  return res.json()
}

export async function createSubscription(token: string, plan: string): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/subscription/create/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ plan }),
  })
  if (!res.ok) throw new Error('Failed to create subscription')
  return res.json()
}

export async function skipSubscription(token: string, plan: string): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/subscription/skip/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ plan }),
  })
  if (!res.ok) throw new Error('Failed to skip subscription')
  return res.json()
}

export async function cancelSubscription(token: string): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/subscription/cancel/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to cancel subscription')
  return res.json()
}

// ──────────────────────────────────────────────────────────────
//  Team Management API
// ──────────────────────────────────────────────────────────────

export async function fetchTeamMembers(token: string): Promise<TeamMember[]> {
  const res = await fetch(`${API_BASE}/team/`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load team')
  return res.json()
}

export async function addTeamMember(
  token: string,
  usernameOrEmail: string,
  role: 'viewer' | 'editor'
): Promise<TeamMember> {
  const res = await fetch(`${API_BASE}/team/add/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ username_or_email: usernameOrEmail, role }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || 'Failed to add member')
  return json
}

export async function updateTeamMember(
  token: string,
  memberId: number,
  role: 'viewer' | 'editor'
): Promise<TeamMember> {
  const res = await fetch(`${API_BASE}/team/${memberId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) throw new Error('Failed to update member')
  return res.json()
}

export async function removeTeamMember(token: string, memberId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/team/${memberId}/remove/`, {
    method: 'DELETE',
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to remove member')
}

// ──────────────────────────────────────────────────────────────
//  Privacy Agreement API
// ──────────────────────────────────────────────────────────────

export async function agreeToPrivacy(token: string): Promise<{ agreed: boolean }> {
  const res = await fetch(`${API_BASE}/privacy/agree/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to agree to privacy')
  return res.json()
}

export async function fetchPrivacyStatus(token: string): Promise<{ agreed: boolean }> {
  const res = await fetch(`${API_BASE}/privacy/status/`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to check privacy status')
  return res.json()
}

// ──────────────────────────────────────────────────────────────
//  User Search API
// ──────────────────────────────────────────────────────────────

export type UserSearchResult = {
  id: number
  username: string
  email: string
}

export async function searchUsers(token: string, query: string): Promise<UserSearchResult[]> {
  const res = await fetch(`${API_BASE}/users/search/?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}

// ──────────────────────────────────────────────────────────────
//  Trade Dataset API
// ──────────────────────────────────────────────────────────────

export type TradeDataset = {
  id: number
  owner: number
  trade: string
  name: string
  description: string
  is_active: boolean
  images: DatasetImage[]
  example_count: number
  page_example_count: number
  created_at: string
  updated_at: string
}

export type DatasetImage = {
  id: number
  dataset: number
  image: string
  label: string
  annotations: Record<string, unknown>
  created_at: string
}

export type DatasetStats = Record<string, {
  label: string
  global_items: number
  items_in_planset: number
  total: number
  estimated_accuracy: number
}>

export async function fetchTradeDatasets(token: string, trade?: string): Promise<TradeDataset[]> {
  let url = `${API_BASE}/trade-datasets/`
  if (trade) url += `?trade=${trade}`
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load datasets')
  return res.json()
}

export async function createTradeDataset(
  token: string,
  trade: string,
  name?: string
): Promise<TradeDataset> {
  const res = await fetch(`${API_BASE}/trade-datasets/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ trade, name: name || `${trade} Dataset` }),
  })
  if (!res.ok) throw new Error('Failed to create dataset')
  return res.json()
}

export async function uploadDatasetImage(
  token: string,
  datasetId: number,
  file: File,
  label?: string
): Promise<DatasetImage> {
  const formData = new FormData()
  formData.append('image', file)
  if (label) formData.append('label', label)
  const res = await fetch(`${API_BASE}/trade-datasets/${datasetId}/upload_image/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: formData,
  })
  if (!res.ok) throw new Error('Failed to upload image')
  return res.json()
}

export async function fetchDatasetStats(
  token: string,
  planSetId?: number,
  pageId?: number,
): Promise<DatasetStats> {
  const params = new URLSearchParams()
  if (planSetId) params.set('plan_set_id', String(planSetId))
  if (pageId) params.set('page_id', String(pageId))
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/dataset-stats/${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load dataset stats')
  return res.json()
}

export async function deleteDatasetImage(token: string, imageId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/dataset-images/${imageId}/`, {
    method: 'DELETE',
    headers: { Authorization: `Token ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete image')
}

export async function fetchDetections(
  pageId: number,
  trade?: string
): Promise<Detection[]> {
  let url = `${API_BASE}/detections/?plan_page=${pageId}`
  if (trade) url += `&trade=${trade}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load detections')
  return res.json()
}

export async function confirmDetection(id: number): Promise<Detection> {
  const res = await fetch(`${API_BASE}/detections/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_confirmed: true }),
  })
  if (!res.ok) throw new Error('Failed to confirm detection')
  return res.json()
}

export async function dismissDetection(id: number): Promise<Detection> {
  const res = await fetch(`${API_BASE}/detections/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_deleted: true }),
  })
  if (!res.ok) throw new Error('Failed to dismiss detection')
  return res.json()
}
