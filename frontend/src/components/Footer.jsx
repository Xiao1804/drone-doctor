import React from 'react'
import { useNavigate } from 'react-router-dom'
import WeChatQR from './WeChatQR'

const ICP_RECORD_NUMBER = '粤ICP备2026085133号'

function Footer() {
  const navigate = useNavigate()

  return (
    <footer className="py-8 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#0891B2] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="font-semibold text-[#134E4A]">DroneDoctor</span>
          </div>
          <WeChatQR size="sm" />
          <button
            onClick={() => navigate('/compliance')}
            className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-[#0891B2] transition-colors"
          >
            合规与使用说明
          </button>
          <div className="text-sm text-gray-500">© 2026 DroneDoctor. All rights reserved.</div>
        </div>
        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${ICP_RECORD_NUMBER}，打开工业和信息化部政务服务平台`}
            className="text-sm text-gray-600 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-[#0891B2]"
          >
            {ICP_RECORD_NUMBER}
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
