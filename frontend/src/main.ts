import './style.css'

const API_BASE = 'http://localhost:8000/api'

type PlanPage = {
  id: number
  page_number: number
  title: string
  image: string
}

type PlanSet = {
  id: number
  name: string
  pdf_file: string
  pages: PlanPage[]
}

async function fetchPlanSets(): Promise<PlanSet[]> {
  const res = await fetch(`${API_BASE}/plan-sets/`)
  if (!res.ok) throw new Error('Failed to load plan sets')
  return res.json()
}

function renderApp(planSets: PlanSet[]) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  if (planSets.length === 0) {
    app.innerHTML = `
      <div class="app-shell">
        <header class="app-header">Estimator Viewer (MVP)</header>
        <main class="app-main empty">
          <div>
            <h2>No plan sets yet</h2>
            <p>Use the upload form below to create your first project plan set.</p>
          </div>
        </main>
      </div>
    `
    return
  }

  const first = planSets[0]
  const firstPage = first.pages[0]
  const imageUrl = firstPage
    ? `http://localhost:8000/media/${firstPage.image}`
    : ''

  app.innerHTML = `
    <div class="app-shell">
      <header class="app-header">Estimator Viewer (MVP)</header>
      <main class="app-main">
        <aside class="sidebar">
          <h3>Pages</h3>
          <ul>
            ${first.pages
              .map(
                (p) =>
                  `<li>Page ${p.page_number} ${p.title ? `- ${p.title}` : ''}</li>`,
              )
              .join('')}
          </ul>
        </aside>
        <section class="viewer">
          ${
            imageUrl
              ? `<img src="${imageUrl}" alt="Plan page" class="viewer-image" />`
              : '<p>No pages rendered yet.</p>'
          }
        </section>
        <aside class="sidebar right">
          <h3>Counts (coming soon)</h3>
        </aside>
      </main>
    </div>
  `
}

async function main() {
  try {
    const planSets = await fetchPlanSets()
    renderApp(planSets)
  } catch (err) {
    console.error(err)
    const app = document.querySelector<HTMLDivElement>('#app')!
    app.innerHTML = `
      <div class="app-shell">
        <header class="app-header">Estimator Viewer (MVP)</header>
        <main class="app-main empty">
          <h2>Backend not reachable</h2>
          <p>Make sure Django is running on <code>localhost:8000</code> and you have at least one plan set.</p>
        </main>
      </div>
    `
  }
}

main()
