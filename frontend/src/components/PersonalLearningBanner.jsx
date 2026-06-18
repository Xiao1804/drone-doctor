import React from 'react'
import { Link } from 'react-router-dom'
import { PERSONAL_LEARNING_EDITION } from '../config/productMode'

function PersonalLearningBanner() {
  if (!PERSONAL_LEARNING_EDITION) return null

  return (
    <aside
      aria-label="个人学习版提示"
      className="relative z-[60] border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="leading-6">
          <span className="mr-2 inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold">
            个人学习版 / 试运行
          </span>
          仅用于个人学习与故障排查辅助，不替代专业检验、维修资质判断或放行飞行。
        </p>
        <Link
          to="/compliance"
          className="shrink-0 font-medium text-amber-900 underline decoration-amber-500 underline-offset-4 hover:text-black"
        >
          查看合规与使用说明
        </Link>
      </div>
    </aside>
  )
}

export default PersonalLearningBanner
