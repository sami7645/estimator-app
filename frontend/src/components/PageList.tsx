import React from 'react'
import type { PlanPage } from '../api'
import './PageList.css'

interface PageListProps {
  pages: PlanPage[]
  selectedPage: PlanPage | null
  onPageSelect: (page: PlanPage) => void
  onPageRightClick: (page: PlanPage) => void
}

export default function PageList({
  pages,
  selectedPage,
  onPageSelect,
  onPageRightClick,
}: PageListProps) {
  return (
    <aside className="page-list">
      <h3>Pages ({pages.length})</h3>
      <ul>
        {pages.map((page) => (
          <li
            key={page.id}
            className={selectedPage?.id === page.id ? 'active' : ''}
            onClick={() => onPageSelect(page)}
            onContextMenu={(e) => {
              e.preventDefault()
              onPageRightClick(page)
            }}
          >
            <span className="page-number">{page.page_number}</span>
            <span className="page-title">
              {page.title || `Page ${page.page_number}`}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
