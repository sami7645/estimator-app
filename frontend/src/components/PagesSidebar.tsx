import React from 'react'
import { LayoutGrid, List } from 'lucide-react'
import type { PlanPage } from '../api'
import './PagesSidebar.css'

export type PagesViewMode = 'images' | 'list'

interface PagesSidebarProps {
  pages: PlanPage[]
  selectedPage: PlanPage | null
  onSelectPage: (page: PlanPage) => void
  thumbnailUrls: Map<number, string>
  viewMode: PagesViewMode
  onViewModeChange: (mode: PagesViewMode) => void
}

export default function PagesSidebar({
  pages,
  selectedPage,
  onSelectPage,
  thumbnailUrls,
  viewMode,
  onViewModeChange,
}: PagesSidebarProps) {
  return (
    <div className="pages-sidebar">
      <div className="pages-sidebar-header">
        <span className="pages-sidebar-title">Sheets</span>
        <div className="pages-sidebar-view-toggle">
          <button
            type="button"
            className={viewMode === 'images' ? 'active' : ''}
            onClick={() => onViewModeChange('images')}
            aria-label="Thumbnail view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>
      <div className="pages-sidebar-list">
        {pages.map((page) => {
          const thumbUrl = thumbnailUrls.get(page.id)
          const isActive = selectedPage?.id === page.id
          const label = page.title || `Sheet ${page.page_number}`

          if (viewMode === 'list') {
            return (
              <button
                key={page.id}
                type="button"
                className={`pages-sidebar-list-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPage(page)}
                title={label}
              >
                <span className="pages-sidebar-list-num">{page.page_number}</span>
                <span className="pages-sidebar-list-label">{label}</span>
              </button>
            )
          }

          return (
            <button
              key={page.id}
              type="button"
              className={`pages-sidebar-thumb-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectPage(page)}
              title={label}
            >
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={label}
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <div className="pages-sidebar-thumb-placeholder" />
              )}
              <span className="pages-sidebar-thumb-num">{page.page_number}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
